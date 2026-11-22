package browsercontext;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.function.Consumer;
import java.util.function.Supplier;
import java.util.stream.Stream;
import javafx.animation.Animation;
import javafx.animation.KeyFrame;
import javafx.animation.PauseTransition;
import javafx.animation.ScaleTransition;
import javafx.animation.Timeline;
import javafx.animation.TranslateTransition;
import javafx.application.ConditionalFeature;
import javafx.application.Platform;
import javafx.geometry.Insets;
import javafx.geometry.Rectangle2D;
import javafx.scene.Group;
import javafx.scene.Node;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.SnapshotParameters;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ScrollPane;
import javafx.scene.control.TextArea;
import javafx.scene.control.ToggleButton;
import javafx.scene.control.Tooltip;
import javafx.scene.image.Image;
import javafx.scene.image.WritableImage;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;
import javafx.scene.paint.Color;
import javafx.scene.shape.Circle;
import javafx.scene.shape.Ellipse;
import javafx.scene.shape.Rectangle;
import javafx.scene.shape.SVGPath;
import javafx.scene.shape.StrokeLineCap;
import javafx.scene.text.Font;
import javafx.scene.transform.Transform;
import javafx.stage.Screen;
import javafx.stage.Stage;
import javafx.stage.StageStyle;
import javafx.util.Duration;

/**
 * The server's panel: a small window of this server's own process that shows what the server holds
 * and can stop it. It is asked for with {@code --panel}; without that nothing of it is loaded, and
 * the server runs as it always did.
 *
 * <p>It is a window and not a page, so it opens no port that a website could reach. It looks like
 * the extension's popup: the same colours, cards, pills and goblin, from one stylesheet
 * ({@code panel.css}). What it shows comes from {@link PanelModel}. What it can do is a
 * {@link Command}, and each of them takes away: the panel authorizes no tab and changes no access
 * level.
 */
final class Panel {

    /** What the user can ask of the server from its panel. */
    sealed interface Command {
        /** Lets the extension connect to this server, or closes its connection and lets none in. */
        record Connection(boolean on) implements Command {
        }

        /** Ends the server in order, as when its agent closes it. */
        record Stop() implements Command {
        }

        /** Ends the process at once, for a server that hangs. */
        record Kill() implements Command {
        }

        /** Puts the pairing token on the clipboard, for the extension's popup. The panel itself never holds it. */
        record CopyToken() implements Command {
        }
    }

    /**
     * A secret on the system's clipboard, for a while. It is taken away again after a minute, and
     * when the server is stopped from its panel, but only if it is still what the clipboard holds:
     * what the user has copied since is theirs. A history of the clipboard that the system keeps is
     * out of reach, and so is a clipboard that the server leaves behind when it ends within that
     * minute.
     */
    static final class Secret {
        static final Duration STAYS = Duration.seconds(60);
        private final Supplier<String> held;
        private final Consumer<String> put;
        private final Runnable empty;
        private final PauseTransition gone = new PauseTransition(STAYS);
        private String secret;

        /** @param held what the clipboard holds now; {@code put} replaces it, {@code empty} clears it */
        Secret(Supplier<String> held, Consumer<String> put, Runnable empty) {
            this.held = held;
            this.put = put;
            this.empty = empty;
            gone.setOnFinished(over -> forget());
        }

        static Secret onTheSystemsClipboard() {
            var clipboard = javafx.scene.input.Clipboard.getSystemClipboard();
            return new Secret(clipboard::getString, text -> {
                var content = new javafx.scene.input.ClipboardContent();
                content.putString(text);
                clipboard.setContent(content);
            }, clipboard::clear);
        }

        void copy(String text) {
            secret = text;
            put.accept(text);
            gone.playFromStart();
        }

        /** Takes the secret off the clipboard, unless something else has been copied since. */
        void forget() {
            gone.stop();
            if (secret != null && secret.equals(held.get())) {
                empty.run();
            }
            secret = null;
        }

        boolean holds() {
            return secret != null;
        }
    }

    /** The one secret this process may have on the clipboard. Used on JavaFX's thread only. */
    private static Secret onClipboard;

    /** Puts a secret on the system's clipboard, to be taken away again. On JavaFX's thread. */
    static void copySecret(String text) {
        if (onClipboard == null) {
            onClipboard = Secret.onTheSystemsClipboard();
        }
        onClipboard.copy(text);
    }

    /** Takes back what {@link #copySecret} put there, if it is still there. On JavaFX's thread. */
    static void forgetSecret() {
        if (onClipboard != null) {
            onClipboard.forget();
        }
    }

    /** How many log lines the panel keeps and shows. */
    static final int LOG_LINES = 300;
    /** How many tabs the list shows at a time. It lists every tab, and scrolls where there are more. */
    static final int TABS_IN_VIEW = 3;
    /** How high a tab's row is, and the room between two of them: the list's height is counted from these. */
    private static final double TAB_ROW = 32;
    private static final double TAB_GAP = 6;
    /** How many rows the list shows at a time where a server has several agents: headings and tabs together. */
    static final int ROWS_IN_VIEW_OF_SEVERAL = 4;
    /** How high a line of words in the list is: what stands in the place of an agent's tabs while it has none. */
    private static final double WORDS_ROW = 18;
    /** How long a button that ends the server stays armed after its first click. */
    static final Duration ARMED_FOR = Duration.seconds(4);

    static final double WIDTH = 400;
    /** As high as the window is where the screen has room for it; on a lower screen it is as high as fits. */
    static final double HEIGHT = 760;
    /** Room around the window's body for its shadow, where the window floats. */
    private static final double SHADOW = 22;
    /** The ground of the panel, as the stylesheet has it: what a window in the system's frame is filled with. */
    private static final Color GROUND = Color.web("#0f1612");
    private static final String STYLESHEET =
            Objects.requireNonNull(Panel.class.getResource("/browsercontext/panel.css")).toExternalForm();

    private Panel() {
    }

    /** Whether a window can be shown here at all. A server without a display runs without its panel. */
    static boolean possible() {
        return !java.awt.GraphicsEnvironment.isHeadless();
    }

    /**
     * Opens the window and keeps it up to date, once a second. Closing it only puts it away: the
     * server is stopped with its button, or by the agent.
     *
     * @throws RuntimeException if the window system cannot be started; the server then runs without
     */
    static void open(Supplier<PanelModel> model, Consumer<Command> commands) {
        onFxThread(() -> {
            if (window != null) {
                return;
            }
            // The toolkit stays up when the window is put away: the server decides when the process ends.
            Platform.setImplicitExit(false);
            var first = model.get();
            var view = new View(commands);
            view.fit(Math.min(HEIGHT, Screen.getPrimary().getVisualBounds().getHeight() - 48));
            view.show(first);

            boolean floating = floats(System.getProperty("os.name", ""), Platform.isSupported(ConditionalFeature.TRANSPARENT_WINDOW));
            var stage = new Stage(floating ? StageStyle.TRANSPARENT : StageStyle.DECORATED);
            var scene = new Scene(view.frame(floating), floating ? Color.TRANSPARENT : GROUND);
            scene.getStylesheets().add(STYLESHEET);
            stage.setScene(scene);
            stage.setTitle("TabGoblin server · " + first.agent());
            stage.getIcons().setAll(Goblin.icons());
            stage.setResizable(false);
            view.movesAndMinimizes(stage);
            stage.setOnCloseRequest(request -> {
                request.consume();
                stage.setIconified(true);
            });
            place(stage, first.port(), floating ? SHADOW : 0);
            stage.show();
            window = stage;
            Log.debug("panel window style=" + stage.getStyle());
            // Nothing that acts has the keyboard when the window appears: a key meant for another
            // window, typed as this one came up, presses no button here.
            view.root().requestFocus();

            var refresh = new Timeline(new KeyFrame(Duration.seconds(1), tick -> {
                var now = model.get();
                view.show(now);
                stage.setTitle("TabGoblin server · " + now.agent());
            }));
            refresh.setCycleCount(Animation.INDEFINITE);
            refresh.play();
        });
    }

    /** The window, once it is open. Used on JavaFX's thread only. */
    private static Stage window;

    /**
     * Brings the window up where it was put away or lies under others: the user asked for it again.
     * Does nothing while there is no window.
     */
    static void raise() {
        onFxThread(() -> {
            if (window != null) {
                window.setIconified(false);
                window.toFront();
            }
        });
    }

    /**
     * Whether the window does without the system's frame: a rounded body with its own shadow, and
     * see-through around it. Only on Windows, where it was seen to work. On the one Linux it was
     * tried on, such a window was there for the system and drew nothing, and a window nobody can
     * see is worse than a frame that is not ours. So everywhere else the panel sits in the
     * system's own window, which every desktop draws.
     */
    static boolean floats(String system, boolean seeThroughWindows) {
        return seeThroughWindows && system.toLowerCase(java.util.Locale.ROOT).startsWith("windows");
    }

    /** Runs on JavaFX's thread, starting JavaFX if this is the first use of it. */
    static void onFxThread(Runnable work) {
        try {
            Platform.startup(work);
        } catch (IllegalStateException alreadyStarted) {
            Platform.runLater(work);
        }
    }

    /** The top right corner of the main screen; each further server's window a step down and to the left. */
    private static void place(Stage stage, int port, double shadow) {
        Rectangle2D screen = Screen.getPrimary().getVisualBounds();
        int step = Math.floorMod(port - McpMain.DEFAULT_PORT, McpMain.PORT_RANGE) * 30;
        stage.setX(screen.getMaxX() - WIDTH - shadow - 24 - step);
        stage.setY(screen.getMinY() + 24 - shadow + step);
    }

    // ---------------------------------------------------------------- the goblin

    /** The goblin of chrome-extension/icons/goblin.svg, from the same shapes. Its eyes can close and blink. */
    static final class Goblin {
        private static final String EARS = "M32 64 6 38l36 6zM96 64l26-26-36 6z";
        private static final String SKIN = "M64 28c-22 0-38 15-38 36 0 22 16 38 38 38s38-16 38-38c0-21-16-36-38-36z";
        private static final String MOUTH = "M48 82c5 6 27 6 32 0";
        private static final String TOOTH = "m58 85 3 7 3-6z";
        private static final Color INK = Color.web("#12201a");
        private static final Color LIGHT = Color.web("#f4fff8");

        private final Group eyes = new Group(new Ellipse(50, 62, 9, 10), new Ellipse(78, 62, 9, 10));
        private final Group pupils = new Group(new Circle(53, 59, 3, LIGHT), new Circle(81, 59, 3, LIGHT));
        private final Group face;
        private final ScaleTransition blink = new ScaleTransition(Duration.millis(110), eyes);

        Goblin() {
            eyes.getChildren().forEach(eye -> ((Ellipse) eye).setFill(INK));
            var mouth = path(MOUTH, null);
            mouth.setStroke(INK);
            mouth.setStrokeWidth(5);
            mouth.setStrokeLineCap(StrokeLineCap.ROUND);
            face = new Group(path(EARS, Color.web("#4fc27b")), path(SKIN, Color.web("#63d68f")), eyes, pupils, mouth,
                    path(TOOTH, LIGHT));
            // A blink: the eyes shut and open again, now and then, while they are open at all.
            blink.setFromY(1);
            blink.setToY(0.1);
            blink.setCycleCount(2);
            blink.setAutoReverse(true);
            var every = new Timeline(new KeyFrame(Duration.seconds(4.2), beat -> {
                if (eyes.getScaleY() == 1) {
                    blink.playFromStart();
                }
            }));
            every.setCycleCount(Animation.INDEFINITE);
            every.play();
        }

        private static SVGPath path(String shape, Color fill) {
            var path = new SVGPath();
            path.setContent(shape);
            path.setFill(fill);
            return path;
        }

        /** Open eyes for a server that may work with the browser, closed ones for one that is switched off. */
        void awake(boolean on) {
            blink.stop();
            eyes.setScaleY(on ? 1 : 0.12);
            pupils.setVisible(on);
        }

        /** The face alone, from ear to ear, {@code width} wide: bare, as in the notice in the page. */
        Node bare(double width) {
            double scale = width / 116;
            face.getTransforms().setAll(Transform.scale(scale, scale), Transform.translate(-6, -28));
            var place = new StackPane(new Group(face));
            place.setMinSize(width, 74 * scale);
            place.setMaxSize(width, 74 * scale);
            return place;
        }

        /**
         * The goblin on its dark tile, as the extension's icon has it: for the window's icon, which
         * is what the taskbar and the list of windows show instead of Java's cup.
         */
        static Image icon(int size) {
            var goblin = new Goblin();
            var tile = new Rectangle(128, 128, INK);
            tile.setArcWidth(60);
            tile.setArcHeight(60);
            var drawing = new Group(tile, goblin.face);
            var shot = new SnapshotParameters();
            shot.setFill(Color.TRANSPARENT);
            shot.setTransform(Transform.scale(size / 128.0, size / 128.0));
            WritableImage drawn = drawing.snapshot(shot, null);
            // A drawing comes back with each pixel as one number, and a window takes for its icon
            // only a picture that holds its pixels as bytes: any other is passed over without a
            // word, and the window keeps Java's cup. So the pixels go into a picture of that kind.
            var icon = new WritableImage(size, size);
            icon.getPixelWriter().setPixels(0, 0, Math.min(size, (int) drawn.getWidth()), Math.min(size, (int) drawn.getHeight()),
                    drawn.getPixelReader(), 0, 0);
            return icon;
        }

        /** The window's icon in the sizes the systems ask for: small for a title or a taskbar, large for a dock. */
        static List<Image> icons() {
            return Stream.of(16, 24, 32, 48, 64, 128, 256).map(Goblin::icon).toList();
        }
    }

    // ---------------------------------------------------------------- the view

    /**
     * Everything the window shows, as one tree of nodes, so that it can also be drawn without a
     * window: for a picture. It is made and used on JavaFX's thread.
     */
    static final class View {
        private final VBox root = new VBox();
        private final Goblin goblin = new Goblin();
        private final HBox header = new HBox();
        private final Button minimize = new Button("–");
        private final Label agent = label("", "sub");
        private final Region dot = new Region();
        private final Label connection = label("");
        private final Label problem = label("", "problem");
        private final Label note = label("", "note");
        private final Label sessionCount = label("", "aside");
        private final VBox sessionRows = new VBox();
        private final Label callsCount = label("", "aside");
        private final Label logCount = label("", "aside");
        private final ScrollPane sessionList = new ScrollPane(sessionRows);
        /** One row that can be chosen: a tab, or an agent where there are several, with its id and its button. */
        private record Choice(String id, ToggleButton button) {
        }

        /** The rows that can be chosen, in the list's order. A tab that is open to any agent is under each agent. */
        private final List<Choice> choices = new ArrayList<>();
        /** What the server held when the view was last brought up to date: a click shows another part of it. */
        private PanelModel shown;
        /** The tab whose metrics and log are shown, or null for all tabs. The view's own: the server knows nothing of it. */
        private String chosen;
        private final VBox timeRows = new VBox();
        private final TextArea log = lines();
        private final ToggleButton browser = new ToggleButton();
        private final Button copy = new Button("Copy");
        private final Region knob = new Region();
        private final Label browserHint = label("", "hint");
        private final Label version = label("", "foot");
        private final EndButton stop;
        private final EndButton kill;
        private List<PanelModel.Row> shownRows;
        private List<PanelModel.Member> shownAgents;
        private List<PanelModel.Share> shownTimes;
        private String shownNoSessions;
        private String shownNoTimes;
        private Boolean shownConnected;

        View(Consumer<Command> commands) {
            root.getStyleClass().add("panel");
            root.setPrefSize(WIDTH, HEIGHT);
            root.setMinSize(WIDTH, HEIGHT);
            root.setMaxSize(WIDTH, HEIGHT);
            root.setStyle("-fx-font-family: '" + family("Segoe UI", "SF Pro Text", "Helvetica Neue", "Ubuntu", "Noto Sans") + "';");
            root.setFocusTraversable(true);

            // The goblin, bare as in the page's notice, and beside it what this window is and whose server.
            header.getStyleClass().add("header");
            var dash = new Region();
            dash.getStyleClass().add("dash");
            minimize.setText(null);
            minimize.setGraphic(dash);
            minimize.getStyleClass().add("window-button");
            minimize.setTooltip(new Tooltip("Put this window away. The server keeps running."));
            minimize.setAccessibleText("Minimize. The server keeps running.");
            header.getChildren().addAll(goblin.bare(46), new VBox(label("TabGoblin server", "title"), agent), grow(), minimize);

            // The popup's status line: a dot and one sentence.
            dot.getStyleClass().add("dot");
            var status = new HBox(dot, connection);
            status.getStyleClass().add("status");

            problem.setWrapText(true);
            problem.setMaxWidth(Double.MAX_VALUE);
            // As high as its words need when they run over more than one line.
            problem.setMinHeight(Region.USE_PREF_SIZE);
            note.setWrapText(true);
            note.setMaxWidth(Double.MAX_VALUE);
            note.setMinHeight(Region.USE_PREF_SIZE);

            sessionRows.getStyleClass().add("sessions");
            timeRows.getStyleClass().add("times");
            // Every tab is in the list, so that every tab can be clicked. Three of them show at a time:
            // the window has a fixed height and must keep room for its controls, so the list scrolls.
            sessionList.getStyleClass().add("session-list");
            sessionList.setFitToWidth(true);
            sessionList.setHbarPolicy(ScrollPane.ScrollBarPolicy.NEVER);
            sessionList.setMinHeight(Region.USE_PREF_SIZE);
            sessionList.setMaxHeight(Region.USE_PREF_SIZE);
            sessionList.setFocusTraversable(false);
            var sessions = card("Sessions", sessionCount, sessionList);
            var time = card("Metrics", callsCount, timeRows);
            var logCard = card("Log", logCount, log);
            // Escape gives up the tab that is chosen, wherever in the window the keyboard is.
            root.addEventHandler(javafx.scene.input.KeyEvent.KEY_PRESSED, key -> {
                if (key.getCode() == javafx.scene.input.KeyCode.ESCAPE && chosen != null) {
                    choose(chosen);
                    key.consume();
                }
            });
            VBox.setVgrow(log, Priority.ALWAYS);
            VBox.setVgrow(logCard, Priority.ALWAYS);
            followLog();

            // The switch, drawn as the popup draws its own: a track, and a knob that slides.
            knob.getStyleClass().add("knob");
            var track = new StackPane(knob);
            track.getStyleClass().add("track");
            browser.setGraphic(track);
            browser.getStyleClass().setAll("switch");
            browser.setAccessibleText("Connection to the browser");
            browser.setSelected(true);
            knob.setTranslateX(20);
            browser.selectedProperty().addListener((property, was, on) -> {
                var slide = new TranslateTransition(Duration.millis(130), knob);
                slide.setToX(on ? 20 : 0);
                slide.play();
            });
            // Only the user's own click reaches the server: bringing the view up to date sends nothing.
            browser.setOnAction(click -> commands.accept(new Command.Connection(browser.isSelected())));
            var connect = new HBox(new VBox(label("Connection to the browser", "strong"), browserHint), grow(), browser);
            connect.getStyleClass().add("row");

            stop = new EndButton("Stop server", "Click again to stop", () -> commands.accept(new Command.Stop()));
            kill = new EndButton("Kill", "Click again to kill", () -> commands.accept(new Command.Kill()));
            stop.setTooltip(new Tooltip("Ends the server in order, for every agent.\n"
                    + "An agent has its tools again when it reconnects."));
            kill.setTooltip(new Tooltip("Ends the process at once, for a server that hangs.\n"
                    + "What it was doing in the browser then has an unknown outcome.\n"
                    + "Agents that are still running start a new server."));
            var ends = new HBox(stop, kill);
            ends.getStyleClass().add("row");

            // The pairing token is handed over and never shown: a click puts it on the clipboard.
            copy.setMinWidth(76);
            copy.setAccessibleText("Copy the pairing token to the clipboard");
            copy.setTooltip(new Tooltip("Puts the pairing token on the clipboard, for the extension's popup.\n"
                    + "It is not shown here, and it leaves the clipboard again after a minute."));
            var copied = new PauseTransition(Duration.seconds(3));
            copied.setOnFinished(over -> copy.setText("Copy"));
            copy.setOnAction(click -> {
                commands.accept(new Command.CopyToken());
                copy.setText("Copied");
                copied.playFromStart();
            });
            var pairing = new HBox(
                    new VBox(label("Pairing token", "strong"), label("Paste it into the extension's popup.", "hint")), grow(), copy);
            pairing.getStyleClass().add("row");

            var ending = label("Stop ends the server for every agent. Kill is for a server that hangs: "
                    + "agents that are still running start it again.", "hint");
            ending.setWrapText(true);
            ending.setMinHeight(Region.USE_PREF_SIZE);
            var control = card("Control", null, connect, pairing, ends, ending);

            var foot = new HBox(grow(), version);

            // What is above and below is always whole: whose server this is, and its controls. What
            // lies between takes the room that is left, and scrolls where a screen is too low for it.
            var between = new VBox(sessions, time, logCard);
            between.getStyleClass().add("between");
            var middle = new ScrollPane(between);
            middle.getStyleClass().add("middle");
            middle.setFitToWidth(true);
            middle.setFitToHeight(true);
            middle.setHbarPolicy(ScrollPane.ScrollBarPolicy.NEVER);
            middle.setFocusTraversable(false);
            VBox.setVgrow(middle, Priority.ALWAYS);

            root.getChildren().addAll(header, status, problem, note, middle, control, foot);
        }

        /** Makes the body this high: the log takes what is left over, and gives it up first. */
        void fit(double height) {
            root.setPrefHeight(height);
            root.setMinHeight(height);
            root.setMaxHeight(height);
        }

        /** The view's own node: the window's body. */
        Parent root() {
            return root;
        }

        /**
         * The body as the root of a scene: floating, with room around it for its shadow, or filling
         * a window that has the system's frame.
         */
        Parent frame(boolean floating) {
            var frame = new StackPane(root);
            frame.setPadding(new Insets(floating ? SHADOW : 0));
            frame.setStyle("-fx-background-color: transparent;");
            root.getStyleClass().add(floating ? "floating" : "framed");
            return frame;
        }

        /**
         * The header moves the window and the button in it puts it away. A floating window has
         * nothing else for either; in the system's frame they are there as well as the frame's own.
         */
        void movesAndMinimizes(Stage stage) {
            double[] grip = new double[2];
            header.setOnMousePressed(press -> {
                grip[0] = press.getScreenX() - stage.getX();
                grip[1] = press.getScreenY() - stage.getY();
            });
            header.setOnMouseDragged(drag -> {
                stage.setX(drag.getScreenX() - grip[0]);
                stage.setY(drag.getScreenY() - grip[1]);
            });
            minimize.setOnAction(click -> stage.setIconified(true));
        }

        /** Brings the view up to what the server holds now. What has not changed is left as it is. */
        void show(PanelModel model) {
            agent.setText(model.identity());
            connection.setText(model.connection());
            dot.getStyleClass().setAll("dot", model.connected() ? "connected" : model.switchedOff() ? "off" : "waiting");
            if (!Objects.equals(shownConnected, !model.switchedOff())) {
                shownConnected = !model.switchedOff();
                goblin.awake(shownConnected);
            }
            problem.setText(model.problem() == null ? "" : model.problem());
            problem.setVisible(model.problem() != null);
            problem.setManaged(model.problem() != null);
            // Whose work does not show here: said by a server that no agent talks to, and by no other.
            note.setText(model.note());
            note.setVisible(!model.note().isEmpty());
            note.setManaged(!model.note().isEmpty());
            version.setText("TabGoblin " + model.version() + " · protocol " + Protocol.VERSION);
            shown = model;
            if (chosen != null && !model.has(chosen)) {
                // The tab that was chosen has gone: its session ended. All tabs show again.
                chosen = null;
            }
            if (!model.sessions().equals(shownRows) || !model.agents().equals(shownAgents)
                    || !model.noSessions().equals(shownNoSessions)) {
                shownRows = model.sessions();
                shownAgents = model.agents();
                shownNoSessions = model.noSessions();
                choices.clear();
                List<Node> lines = new ArrayList<>();
                if (shownAgents.size() <= 1) {
                    // One agent: its tabs, as the panel always listed them.
                    shownRows.forEach(row -> lines.add(choice(row.id(), sessionRow(row))));
                    if (lines.isEmpty()) {
                        lines.add(label(model.noSessions(), "empty"));
                    }
                } else {
                    // Several: each agent's heading, and under it that agent's tabs.
                    for (PanelModel.Member member : shownAgents) {
                        lines.add(choice(member.id(), agentRow(member)));
                        var its = shownRows.stream().filter(row -> member.id().equals(row.owner())).toList();
                        its.forEach(row -> lines.add(choice(row.id(), sessionRow(row))));
                        if (its.isEmpty()) {
                            lines.add(label(PanelModel.noSessions(member), "empty"));
                        }
                    }
                }
                sessionRows.getChildren().setAll(lines);
                // As high as its rows, up to the ones it shows at a time; beyond those it scrolls. With
                // nothing to choose it is as high as the words that stand in the rows' place.
                int inView = Math.min(lines.size(), shownAgents.size() > 1 ? ROWS_IN_VIEW_OF_SEVERAL : TABS_IN_VIEW);
                double high = (inView - 1) * TAB_GAP;
                for (Node line : lines.subList(0, inView)) {
                    high += line instanceof ToggleButton ? TAB_ROW : WORDS_ROW;
                }
                sessionList.setPrefHeight(choices.isEmpty() ? Region.USE_COMPUTED_SIZE : high);
            }
            showChosen(false);
            browser.setSelected(!model.switchedOff());
            browserHint.setText(model.switchedOff() ? "Off: the extension is not let in." : "On: the extension may connect.");
        }

        /**
         * Chooses a tab: the metrics and the log are that tab's from now on. The tab that is chosen
         * already is given up, and all tabs show again. Nothing of it reaches the server.
         */
        void choose(String tab) {
            chosen = tab.equals(chosen) ? null : tab;
            showChosen(true);
        }

        /**
         * Shows what belongs to the chosen tab, or to all: which row is marked, what is said under
         * the list, the metrics and the log.
         *
         * @param now the user has just chosen: the log changes at once, also under a place they had scrolled to
         */
        private void showChosen(boolean now) {
            choices.forEach(choice -> choice.button().setSelected(choice.id().equals(chosen)));
            // In the card's corner: how many tabs there are, or which one is chosen and how to get back.
            // In the corner, and in no line of its own: a click moves nothing below it.
            sessionCount.setText(chosen == null ? shown.sessionsCount() : shown.chosenNote(chosen));
            callsCount.setText(shown.callsCount(chosen));
            var times = shown.metrics(chosen).shares();
            String noTimes = shown.noTimes(chosen);
            if (!times.equals(shownTimes) || !noTimes.equals(shownNoTimes)) {
                shownTimes = times;
                shownNoTimes = noTimes;
                timeRows.getChildren().setAll(times.isEmpty()
                        ? List.of(label(noTimes, "empty"))
                        : times.stream().map(View::timeRow).toList());
            }
            logCount.setText(shown.logCount(chosen, LOG_LINES));
            var lines = shown.log(chosen);
            String text = lines.isEmpty() ? shown.noLog(chosen) : String.join("\n", lines);
            if (now && !text.equals(log.getText())) {
                log.deselect();
                log.setText(text);
                logToEnd();
            } else {
                writeLog(text);
            }
        }

        /**
         * The log's lines as they are now, with the newest in view. It holds still while the user
         * reads in it: nothing is written under a mark or under a place they have scrolled up to.
         */
        private void writeLog(String text) {
            if (text.equals(log.getText()) || readingLog()) {
                return;
            }
            log.setText(text);
            logToEnd();
        }

        /** Whether the user is reading in the log: has marked some of it, or has scrolled up from its last line. */
        boolean readingLog() {
            if (!log.getSelectedText().isEmpty()) {
                return true;
            }
            if (!(log.lookup(".scroll-pane") instanceof ScrollPane scroll) || scroll.getContent() == null) {
                return false; // not drawn yet
            }
            double below = scroll.getContent().getLayoutBounds().getHeight() - scroll.getViewportBounds().getHeight();
            return below > 0 && (1 - scroll.getVvalue() / scroll.getVmax()) * below > 2;
        }

        /** Down to the last line. */
        void logToEnd() {
            log.setScrollTop(Double.MAX_VALUE);
        }

        /**
         * Keeps the log at its last line. Where that is, is known only once new lines have been laid
         * out, and that happens after they were written: so it is done each time their height changes.
         * The height changes at no other time, because nothing is written while the user reads.
         */
        private void followLog() {
            log.skinProperty().addListener((property, was, skin) -> {
                if (log.lookup(".scroll-pane") instanceof ScrollPane scroll && scroll.getContent() instanceof Region lines) {
                    lines.heightProperty().addListener((height, before, now) -> Platform.runLater(this::logToEnd));
                }
            });
        }

        /** One heap of the time: its name, a bar as long as its share, and the share in numbers. */
        private static Node timeRow(PanelModel.Share share) {
            var name = label(share.name(), "time-name");
            name.setMinWidth(132);
            var fill = new Region();
            fill.getStyleClass().addAll("bar-fill", share.yours() ? "yours" : "theirs");
            var track = new HBox(fill);
            track.getStyleClass().add("bar-track");
            HBox.setHgrow(track, Priority.ALWAYS);
            // A share that is there at all shows, however small.
            fill.prefWidthProperty().bind(track.widthProperty().multiply(share.percent() / 100.0));
            fill.setMinWidth(share.percent() > 0 ? 3 : 0);
            var percent = label(share.percent() + "%", "time-share");
            percent.setMinWidth(36);
            var row = new HBox(name, track, percent);
            row.getStyleClass().add("row");
            return row;
        }

        private ToggleButton choice(String id, ToggleButton button) {
            choices.add(new Choice(id, button));
            return button;
        }

        /**
         * One agent, where a server has several: a heading over its tabs, and a button as a tab's row
         * is. A click chooses the agent, and its metrics and its lines show in the cards below.
         */
        private ToggleButton agentRow(PanelModel.Member member) {
            var id = label(member.id(), "chip");
            id.setStyle("-fx-font-family: '" + monospace() + "';");
            id.setMinWidth(Region.USE_PREF_SIZE);
            var name = label(member.name(), "agent-name");
            name.setMinWidth(Region.USE_PREF_SIZE);
            // Its port while the extension is connected to it, and that it is not while it is not: the
            // row has room for one of the two beside the name and the id.
            var last = member.connected() ? label(":" + member.port(), "chip") : label("not connected", "chip", "state");
            last.setMinWidth(Region.USE_PREF_SIZE);
            if (!member.connected()) {
                last.setTooltip(new Tooltip(member.connection()));
            }
            var row = new HBox(name, grow(), id, last);
            return chooser(row, member.id(), "agent", member.name() + ": show the metrics and the log of this agent only");
        }

        /**
         * One tab, as a button: a click on it chooses the tab, and its metrics and its log show in
         * the cards below. Pressed again, it gives the choice up.
         */
        private ToggleButton sessionRow(PanelModel.Row session) {
            var id = label(session.id(), "chip", "id");
            id.setStyle("-fx-font-family: '" + monospace() + "';");
            id.setMinWidth(Region.USE_PREF_SIZE);
            var access = label(session.access(), "chip");
            access.setMinWidth(Region.USE_PREF_SIZE);
            var row = new HBox(id, label(session.site(), "site"), grow(), access);
            if (session.open()) {
                // Authorized for any agent and used by none yet: every server lists it until one has it.
                var open = label("any agent", "chip");
                open.setMinWidth(Region.USE_PREF_SIZE);
                row.getChildren().add(open);
            }
            if (!session.state().equals("active")) {
                var state = label(session.state(), "chip", "state");
                state.setMinWidth(Region.USE_PREF_SIZE);
                row.getChildren().add(state);
            }
            return chooser(row, session.id(), "tab", session.id() + ", " + session.site() + ": show the metrics and the log of this tab only");
        }

        /** A row as a button that chooses what the row stands for. */
        private ToggleButton chooser(HBox row, String id, String what, String spoken) {
            row.getStyleClass().add("session-line");
            var button = new ToggleButton();
            button.setGraphic(row);
            button.setContentDisplay(javafx.scene.control.ContentDisplay.GRAPHIC_ONLY);
            button.getStyleClass().setAll("session");
            if (what.equals("agent")) {
                button.getStyleClass().add("agent");
            }
            button.setMaxWidth(Double.MAX_VALUE);
            button.setMinHeight(TAB_ROW);
            button.setPrefHeight(TAB_ROW);
            button.setMaxHeight(TAB_ROW);
            // A button is as wide as what is in it: the row is made as wide as the button has room.
            row.minWidthProperty().bind(button.widthProperty().subtract(20));
            button.setAccessibleText(spoken);
            button.setTooltip(new Tooltip("Shows the metrics and the log of this " + what + " only.\nClick again for everything."));
            // The button has turned itself already: what is chosen is said in one place, and every row follows it.
            button.setOnAction(click -> choose(id));
            return button;
        }

        private static VBox card(String title, Label aside, Node... content) {
            var heading = label(title.toUpperCase(), "heading");
            // A box of text has no name of its own for a screen reader: its card's heading is its name.
            Stream.of(content).filter(TextArea.class::isInstance).findFirst().ifPresent(heading::setLabelFor);
            var head = new HBox(heading, grow());
            head.getStyleClass().add("card-head");
            if (aside != null) {
                head.getChildren().add(aside);
            }
            var card = new VBox(head);
            card.getChildren().addAll(content);
            card.getStyleClass().add("card");
            return card;
        }

        private static TextArea lines() {
            var area = new TextArea();
            area.setEditable(false);
            // A long line goes on below itself: the window is narrow, and nobody scrolls sideways to read.
            area.setWrapText(true);
            area.setPrefRowCount(4);
            // It gives its room up before anything else does, but not all of it.
            area.setMinHeight(44);
            area.getStyleClass().add("lines");
            area.setStyle("-fx-font-family: '" + monospace() + "';");
            return area;
        }

        private static Label label(String text, String... classes) {
            var label = new Label(text);
            label.getStyleClass().addAll(classes);
            return label;
        }

        private static Region grow() {
            var space = new Region();
            HBox.setHgrow(space, Priority.ALWAYS);
            return space;
        }

        private static String monospace() {
            return family("Cascadia Mono", "Consolas", "Menlo", "DejaVu Sans Mono", "Monospaced");
        }

        /** The first of these font families that this machine has. The last one is the fallback. */
        private static String family(String... wanted) {
            var there = Font.getFamilies();
            return Stream.of(wanted).filter(there::contains).findFirst().orElse(wanted[wanted.length - 1]);
        }

        /** The buttons that end the server, for a test: each has to be clicked twice. */
        List<Button> ends() {
            return List.of(stop, kill);
        }

        ToggleButton browser() {
            return browser;
        }

        /** The button that copies the pairing token, for a test. */
        Button copy() {
            return copy;
        }

        /** The rows of the tabs in the list's order, for a test: each is a button that chooses its tab. */
        List<ToggleButton> tabs() {
            return choices.stream().map(Choice::button).toList();
        }

        /** The tab whose metrics and log are shown, or null for all, for a test. */
        String chosen() {
            return chosen;
        }

        /** The box with the log's lines, for a test: to scroll in it and to mark some of it, as a user does. */
        TextArea log() {
            return log;
        }

        /** What the view says, in reading order: for a test, and for nothing else. */
        List<String> words() {
            var all = new ArrayList<String>();
            collect(root, all);
            return all;
        }

        private static void collect(Parent from, List<String> into) {
            for (Node part : from.getChildrenUnmodifiable()) {
                if (!part.isVisible()) {
                    continue;
                }
                switch (part) {
                    case Label label when !label.getText().isEmpty() -> into.add(label.getText());
                    case TextArea area -> into.add(area.getText());
                    case Button button when button.getText() != null && !button.getText().isEmpty() -> into.add(button.getText());
                    // A tab's row is what its button shows; the button holds it only once it has been drawn.
                    case ToggleButton toggle when toggle.getGraphic() instanceof Parent shownInIt -> collect(shownInIt, into);
                    // What scrolls is held by its pane, also before the pane has been drawn.
                    case ScrollPane pane when pane.getContent() instanceof Parent inner -> collect(inner, into);
                    case Parent inner -> collect(inner, into);
                    default -> {
                    }
                }
            }
        }

        /**
         * Draws the view without a window, at {@code scale} times its size: floating, with room for
         * its shadow, or as it fills a window that has the system's frame.
         */
        Image picture(double scale, boolean floating) {
            var scene = new Scene(frame(floating), floating ? Color.TRANSPARENT : GROUND);
            scene.getStylesheets().add(STYLESHEET);
            scene.getRoot().applyCss();
            scene.getRoot().layout();
            // As a window does it a moment after it has laid the lines out: down to the last of them.
            logToEnd();
            scene.getRoot().layout();
            var shot = new SnapshotParameters();
            shot.setFill(Color.TRANSPARENT);
            shot.setTransform(Transform.scale(scale, scale));
            return scene.getRoot().snapshot(shot, null);
        }
    }

    /**
     * A button that ends the server. The first click arms it: it says what the next click does, and
     * goes back by itself after a moment. Only the second click acts.
     */
    static final class EndButton extends Button {
        private final String label;
        private final String armedLabel;
        private final PauseTransition disarm = new PauseTransition(ARMED_FOR);

        EndButton(String label, String armedLabel, Runnable action) {
            super(label);
            this.label = label;
            this.armedLabel = armedLabel;
            getStyleClass().add("danger");
            disarm.setOnFinished(over -> arm(false));
            setOnAction(click -> {
                if (armed()) {
                    arm(false);
                    action.run();
                } else {
                    arm(true);
                }
            });
        }

        boolean armed() {
            return getStyleClass().contains("armed");
        }

        private void arm(boolean on) {
            getStyleClass().remove("armed");
            if (on) {
                getStyleClass().add("armed");
                disarm.playFromStart();
            } else {
                disarm.stop();
            }
            setText(on ? armedLabel : label);
        }
    }
}
