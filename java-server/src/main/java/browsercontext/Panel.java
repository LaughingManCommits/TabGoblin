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
    }

    /** How many log lines the panel keeps and shows. */
    static final int LOG_LINES = 300;
    /** How long a button that ends the server stays armed after its first click. */
    static final Duration ARMED_FOR = Duration.seconds(4);

    static final double WIDTH = 400;
    static final double HEIGHT = 720;
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
            // The toolkit stays up when the window is put away: the server decides when the process ends.
            Platform.setImplicitExit(false);
            var first = model.get();
            var view = new View(commands);
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
        private final Label sessionCount = label("", "aside");
        private final VBox sessionRows = new VBox();
        private final Label callsCount = label("", "aside");
        private final VBox timeRows = new VBox();
        private final TextArea log = lines();
        private final ToggleButton browser = new ToggleButton();
        private final Region knob = new Region();
        private final Label browserHint = label("", "hint");
        private final Label version = label("", "foot");
        private final EndButton stop;
        private final EndButton kill;
        private List<PanelModel.Row> shownRows;
        private List<PanelModel.Share> shownTimes;
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

            sessionRows.getStyleClass().add("sessions");
            timeRows.getStyleClass().add("times");
            var sessions = card("Sessions", sessionCount, sessionRows);
            var time = card("Where the time went", callsCount, timeRows);
            var logCard = card("Log", label("the last " + LOG_LINES + " lines", "aside"), log);
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
            stop.setTooltip(new Tooltip("Ends the server in order, as when the agent closes it."));
            kill.setTooltip(new Tooltip("Ends the process at once, for a server that hangs.\n"
                    + "What it was doing in the browser then has an unknown outcome."));
            var ends = new HBox(stop, kill);
            ends.getStyleClass().add("row");
            var control = card("Control", null, connect, ends,
                    label("Stop ends it in order. Kill ends the process at once.", "hint"));

            var foot = new HBox(grow(), version);

            root.getChildren().addAll(header, status, problem, sessions, time, logCard, control, foot);
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
            version.setText("TabGoblin " + model.version() + " · protocol " + Protocol.VERSION);
            sessionCount.setText(model.sessionsCount());
            if (!model.sessions().equals(shownRows)) {
                shownRows = model.sessions();
                sessionRows.getChildren().setAll(shownRows.isEmpty()
                        ? List.of(label(model.connected() ? "No tab is authorized for this agent"
                                : "Not known while the browser is not connected", "empty"))
                        : shownRows.stream().map(View::sessionRow).toList());
            }
            callsCount.setText(model.callsCount());
            if (!model.times().equals(shownTimes)) {
                shownTimes = model.times();
                timeRows.getChildren().setAll(shownTimes.isEmpty()
                        ? List.of(label("No tool call has ended yet", "empty"))
                        : shownTimes.stream().map(View::timeRow).toList());
            }
            writeLog(model.log().isEmpty() ? "Nothing logged yet." : String.join("\n", model.log()));
            browser.setSelected(!model.switchedOff());
            browserHint.setText(model.switchedOff() ? "Off: the extension is not let in." : "On: the extension may connect.");
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

        private static Node sessionRow(PanelModel.Row session) {
            var id = label(session.id(), "chip", "id");
            id.setStyle("-fx-font-family: '" + monospace() + "';");
            id.setMinWidth(Region.USE_PREF_SIZE);
            var access = label(session.access(), "chip");
            access.setMinWidth(Region.USE_PREF_SIZE);
            var row = new HBox(id, label(session.site(), "site"), grow(), access);
            if (!session.state().equals("active")) {
                var state = label(session.state(), "chip", "state");
                state.setMinWidth(Region.USE_PREF_SIZE);
                row.getChildren().add(state);
            }
            row.getStyleClass().add("session");
            return row;
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
