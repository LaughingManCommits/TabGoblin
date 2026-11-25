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
import javafx.geometry.Pos;
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

        /** Opens the settings file, where the blocked sites are named, in the system's editor for text. */
        record EditSettings() implements Command {
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

    /** Where a port's number goes when the user clicks it: the system's clipboard. A port is no secret, and stays there. */
    static Consumer<String> portClipboard = text -> {
        var content = new javafx.scene.input.ClipboardContent();
        content.putString(text);
        javafx.scene.input.Clipboard.getSystemClipboard().setContent(content);
    };

    /**
     * A port as the window shows it, that a click copies: the number alone goes to the clipboard,
     * and the label says for a moment that it did. The header also handles window dragging.
     */
    static final class PortLabel extends Label {
        /** The room above and below the pill that takes a click as the pill does; the stylesheet has the same number. */
        private static final double TOUCH = 4;
        private final PauseTransition said = new PauseTransition(Duration.seconds(2));
        private String idle = "";
        private int port;

        PortLabel(String... classes) {
            getStyleClass().addAll(classes);
            getStyleClass().add("port");
            setAccessibleRole(javafx.scene.AccessibleRole.BUTTON);
            setMinWidth(Region.USE_PREF_SIZE);
            // It is higher to the pointer than to the eye: the stylesheet gives it room above and below
            // its pill, and here that room is taken out of the row again, so that nothing around it moves.
            HBox.setMargin(this, new Insets(-TOUCH, 0, -TOUCH, 0));
            // It acts as a button does, so the keyboard reaches it and presses it as one: Tab, then Space or Enter.
            setFocusTraversable(true);
            setOnKeyPressed(key -> {
                if (key.getCode() == javafx.scene.input.KeyCode.SPACE || key.getCode() == javafx.scene.input.KeyCode.ENTER) {
                    key.consume();
                    copy();
                }
            });
            said.setOnFinished(over -> setText(idle));
            // Pressing is taken here as well, so the header does not start a window drag.
            setOnMousePressed(javafx.scene.input.MouseEvent::consume);
            setOnMouseDragged(javafx.scene.input.MouseEvent::consume);
            setOnMouseClicked(javafx.scene.input.MouseEvent::consume);
            setOnMouseReleased(release -> {
                release.consume();
                if (contains(release.getX(), release.getY())) {
                    copy();
                }
            });
        }

        /** What it shows while nothing was copied just now, and the port a click copies. */
        PortLabel showing(String text, int port) {
            if (this.port != port) said.stop();
            this.idle = text;
            this.port = port;
            if (said.getStatus() != Animation.Status.RUNNING) {
                setText(text);
            }
            setAccessibleText("Port " + port + ". Copy the number to the clipboard");
            setTooltip(new Tooltip("Click to copy the port number " + port));
            return this;
        }

        void copy() {
            portClipboard.accept(String.valueOf(port));
            setText("copied");
            said.playFromStart();
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
    static final int ROWS_IN_VIEW_OF_SEVERAL = 3;
    /** How high a line of words in the list is: what stands in the place of an agent's tabs while it has none. */
    private static final double WORDS_ROW = 18;
    /** How wide the two numbers of a heap of the time are: its share, and what a call typically takes in it. */
    private static final double SHARE_WIDE = 36;
    private static final double TYPICAL_WIDE = 58;
    /** How long a button that ends the server stays armed after its first click. */
    static final Duration ARMED_FOR = Duration.seconds(4);

    static final double WIDTH = 400;
    /** As high as the window is where the screen has room for it; on a lower screen it is as high as fits. */
    static final double HEIGHT = 824;
    /** How near the lower edge of a floating window the pointer takes hold of it, to make it higher or lower. */
    private static final double EDGE = 8;
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
            var kept = Place.kept();
            double highest = Screen.getPrimary().getVisualBounds().getHeight() - 48;
            view.fit(Math.max(LOWEST, Math.min(kept.height() > 0 ? kept.height() : HEIGHT, highest)));
            view.show(first);
            // As the system is set: light or dark as the popup is, and still where less motion is asked for.
            var system = Platform.getPreferences();
            view.light(system.getColorScheme() == javafx.application.ColorScheme.LIGHT);
            calm = system.isReducedMotion();
            system.reducedMotionProperty().addListener((property, was, less) -> calm = less);

            boolean floating = floats(System.getProperty("os.name", ""), Platform.isSupported(ConditionalFeature.TRANSPARENT_WINDOW));
            var stage = new Stage(floating ? StageStyle.TRANSPARENT : StageStyle.DECORATED);
            var scene = new Scene(view.frame(floating), floating ? Color.TRANSPARENT : GROUND);
            scene.getStylesheets().add(STYLESHEET);
            stage.setScene(scene);
            stage.setTitle("TabGoblin server · " + first.agent());
            stage.getIcons().setAll(Goblin.icons());
            system.colorSchemeProperty().addListener((property, was, scheme) -> {
                boolean light = scheme == javafx.application.ColorScheme.LIGHT;
                view.light(light);
                if (!floating) {
                    scene.setFill(light ? GROUND_LIGHT : GROUND);
                }
            });
            if (!floating) {
                scene.setFill(system.getColorScheme() == javafx.application.ColorScheme.LIGHT ? GROUND_LIGHT : GROUND);
            }
            // As wide as it is, always. As high as the user makes it: by the system's frame where it
            // has one, and by its lower edge where it floats.
            stage.setResizable(!floating);
            view.movesAndMinimizes(stage);
            view.resizes(stage, floating, highest);
            stage.setOnCloseRequest(request -> {
                request.consume();
                stage.setIconified(true);
            });
            place(stage, first.port(), floating ? SHADOW : 0);
            if (kept.onAScreen(WIDTH)) {
                // Where the user left it, as long as that is still on a screen.
                stage.setX(kept.x());
                stage.setY(kept.y());
            }
            stage.show();
            if (!floating) {
                stage.setMinWidth(stage.getWidth());
                stage.setMaxWidth(stage.getWidth());
                stage.setMinHeight(LOWEST);
            }
            // Its place and height are kept for the next time, whenever they have come to rest.
            var keep = new PauseTransition(Duration.millis(600));
            keep.setOnFinished(rest -> Place.keep(stage.getX(), stage.getY(), view.height()));
            javafx.beans.value.ChangeListener<Number> moved = (property, was, now) -> keep.playFromStart();
            stage.xProperty().addListener(moved);
            stage.yProperty().addListener(moved);
            stage.heightProperty().addListener(moved);
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

    /** The lowest the window is made: its header, one card's worth of the middle, and the controls. */
    static final double LOWEST = 560;
    /** The ground of the light theme, for a window in the system's frame. */
    private static final Color GROUND_LIGHT = Color.web("#f4f7f3");

    /**
     * Whether the user has asked the system for less motion, as JavaFX reports it. Nothing in the
     * window moves then: the goblin does not blink and the switch does not slide. Used on JavaFX's
     * thread only.
     */
    static boolean calm;

    /**
     * Where the user left the window, and how high: kept in the user's own preferences of Java, and
     * nothing else is. Read once when the window opens.
     *
     * @param height 0 where none was kept
     */
    record Place(double x, double y, double height, boolean known) {
        private static java.util.prefs.Preferences store() {
            return java.util.prefs.Preferences.userNodeForPackage(Panel.class).node("panel");
        }

        static Place kept() {
            try {
                var store = store();
                double x = store.getDouble("x", Double.NaN);
                double y = store.getDouble("y", Double.NaN);
                return new Place(x, y, store.getDouble("height", 0), !Double.isNaN(x) && !Double.isNaN(y));
            } catch (RuntimeException unreadable) {
                return new Place(0, 0, 0, false);
            }
        }

        static void keep(double x, double y, double height) {
            try {
                var store = store();
                store.putDouble("x", x);
                store.putDouble("y", y);
                store.putDouble("height", height);
            } catch (RuntimeException unwritable) {
                // Then it opens in its usual place the next time.
            }
        }

        /** Whether a window this wide, put there, has its header on one of the screens that are there now. */
        boolean onAScreen(double width) {
            return known && !Screen.getScreensForRectangle(x + 40, y + 20, Math.max(1, width - 80), 40).isEmpty();
        }
    }

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
                if (eyes.getScaleY() == 1 && !calm) {
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
        /** The first port the extension scans, available before any agent connects. */
        private final PortLabel firstPort = new PortLabel("chip");
        /** The port of the one agent a server has: where the extension reaches that agent, in the line about that. A click copies it. */
        private final PortLabel agentPort = new PortLabel("chip");
        private final Region dot = new Region();
        private final Label connection = label("");
        private final Label problem = label("", "problem");
        private final Label note = label("", "note");
        private final Label sessionCount = label("", "aside");
        private final VBox sessionRows = new VBox();
        private final Label callsCount = label("", "aside");
        private final Label logCount = label("", "aside");
        /** Shown while the log is held: how many lines have come since, and the way to the newest of them. */
        private final Button follow = new Button();
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
        /** The same at the window's top, while the browser holds another token: the step the window came up for. */
        private final Button pairCopy = new Button("Copy token");
        private final HBox pair = new HBox();
        private final Region knob = new Region();
        private final Label browserHint = label("", "hint");
        private final Label blockedHint = label("", "hint");
        /** Over the two lines: it names the security policy as well while one is in force. */
        private final Label blockedTitle = label("Blocked sites", "strong");
        /** What the policy restricts, in short. Not there, and taking no room, without a policy. */
        private final Label policyHint = label("", "hint");
        private final Button edit = new Button("Edit");
        private final Tooltip blockedTip = new Tooltip();
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
            header.getChildren().addAll(goblin.bare(46), new VBox(label("TabGoblin server", "title"), new HBox(6, agent, firstPort)), grow(), minimize);

            // The popup's status line: a dot and one sentence.
            dot.getStyleClass().add("dot");
            // The one agent's port is where the browser reaches it: said at the end of the line about
            // that connection, where there is room for it. The header keeps the agent's name whole.
            var status = new HBox(dot, connection, grow(), agentPort);
            status.setAlignment(Pos.CENTER_LEFT);
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
            // While the user reads in the log it holds still, and says so here, with the way back.
            follow.getStyleClass().add("follow");
            follow.setVisible(false);
            follow.setManaged(false);
            follow.setTooltip(new Tooltip("The log holds still while you read in it: scrolled up, or with some of it marked.\n"
                    + "Press to go to its newest line. It follows again from there."));
            follow.setOnAction(press -> toNewest());
            logCount.setGraphic(follow);
            // The words first, then the button: "held while you read", and the way out of it.
            logCount.setContentDisplay(javafx.scene.control.ContentDisplay.RIGHT);
            logCount.setGraphicTextGap(8);
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
                if (calm) {
                    knob.setTranslateX(on ? 20 : 0);
                    return;
                }
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
            copies(copy, "Copy", commands);
            var pairing = new HBox(
                    new VBox(label("Pairing token", "strong"), label("Paste in the popup.", "hint")), grow(), copy);
            pairing.getStyleClass().add("row");

            // While the browser holds a token that is not the server's, pairing is the one thing to do,
            // and what the window came up for: said at the top, with the button beside it.
            copies(pairCopy, "Copy token", commands);
            pairCopy.getStyleClass().add("primary");
            pairCopy.setMinWidth(Region.USE_PREF_SIZE);
            var pairHint = label("Copy the token, then paste it into the TabGoblin popup in Chrome.", "hint");
            pairHint.setWrapText(true);
            pairHint.setMinHeight(Region.USE_PREF_SIZE);
            var pairWords = new VBox(label("Pair the browser with this server", "strong"), pairHint);
            pairWords.setMinWidth(0);
            HBox.setHgrow(pairWords, Priority.ALWAYS);
            pair.getChildren().addAll(pairWords, pairCopy);
            pair.getStyleClass().addAll("row", "pair");

            // The sites no agent may work on: what is in force now, and the way to the file they are named in.
            edit.setMinWidth(76);
            edit.setAccessibleText("Edit the blocked sites: opens the settings file in a text editor");
            edit.setTooltip(blockedTip);
            edit.setOnAction(click -> commands.accept(new Command.EditSettings()));
            blockedHint.setTooltip(blockedTip);
            blockedHint.setMaxWidth(Double.MAX_VALUE);
            policyHint.setTooltip(blockedTip);
            policyHint.setMaxWidth(Double.MAX_VALUE);
            // What it restricts is not cut short: it takes a second line where one is not enough.
            policyHint.setWrapText(true);
            policyHint.setMinHeight(Region.USE_PREF_SIZE);
            policyHint.setVisible(false);
            policyHint.setManaged(false);
            var blockedWords = new VBox(blockedTitle, blockedHint, policyHint);
            // The names give way to the button: a long list ends in dots, and is whole where the mouse rests.
            blockedWords.setMinWidth(0);
            HBox.setHgrow(blockedWords, Priority.ALWAYS);
            var blockedSites = new HBox(blockedWords, edit);
            blockedSites.getStyleClass().add("row");

            // One line: what is beside it is the log's room. The rest is under the pointer.
            var ending = label("Kill is for a server that hangs: running agents start a new one.", "hint");
            ending.setWrapText(true);
            ending.setMinHeight(Region.USE_PREF_SIZE);
            var control = card("Control", null, connect, pairing, blockedSites, ends, ending);

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

            root.getChildren().addAll(header, status, pair, problem, note, middle, control, foot);
        }

        /** Makes the body this high: the log takes what is left over, and gives it up first. */
        void fit(double height) {
            root.setPrefHeight(height);
            root.setMinHeight(height);
            root.setMaxHeight(height);
        }

        /** How high the body is made. */
        double height() {
            return root.getPrefHeight();
        }

        /** The daylight colours, where the system is set to light; the cave's otherwise. */
        void light(boolean on) {
            root.getStyleClass().remove("light");
            if (on) {
                root.getStyleClass().add("light");
            }
        }

        /**
         * Lets the user make the window higher or lower, and never wider. In the system's frame the
         * frame does it and the body follows. Floating, the body's lower edge is the handle: the
         * pointer says so there, and a drag sets the height.
         */
        void resizes(Stage stage, boolean floating, double highest) {
            if (!floating) {
                stage.getScene().heightProperty().addListener((property, was, high) -> fit(Math.max(LOWEST, high.doubleValue())));
                return;
            }
            boolean[] dragging = new boolean[1];
            java.util.function.Predicate<javafx.scene.input.MouseEvent> atTheEdge =
                    mouse -> mouse.getY() >= root.getHeight() - EDGE && mouse.getY() <= root.getHeight();
            root.addEventFilter(javafx.scene.input.MouseEvent.MOUSE_MOVED, mouse ->
                    root.setCursor(atTheEdge.test(mouse) ? javafx.scene.Cursor.S_RESIZE : null));
            root.addEventFilter(javafx.scene.input.MouseEvent.MOUSE_EXITED, mouse -> {
                if (!dragging[0]) {
                    root.setCursor(null);
                }
            });
            root.addEventFilter(javafx.scene.input.MouseEvent.MOUSE_PRESSED, mouse -> {
                dragging[0] = atTheEdge.test(mouse);
                if (dragging[0]) {
                    mouse.consume();
                }
            });
            root.addEventFilter(javafx.scene.input.MouseEvent.MOUSE_DRAGGED, mouse -> {
                if (dragging[0]) {
                    mouse.consume();
                    setHeight(stage, mouse.getY(), highest);
                }
            });
            root.addEventFilter(javafx.scene.input.MouseEvent.MOUSE_RELEASED, mouse -> dragging[0] = false);
        }

        /** Makes a floating window's body this high, within what is allowed, and the window around it. */
        void setHeight(Stage stage, double wanted, double highest) {
            double high = Math.max(LOWEST, Math.min(wanted, highest));
            fit(high);
            stage.setHeight(high + 2 * SHADOW);
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
            firstPort.showing("Port " + model.firstPort(), model.firstPort());
            firstPort.setTooltip(new Tooltip("The port to set in the extension's popup, under Connection. "
                    + "Click to copy " + model.firstPort() + "."));
            agent.setText(model.identity());
            // One agent: its port ends the line about its connection. Several have theirs in their rows.
            // Only where it is another than the port in the header: the same number twice says nothing.
            boolean another = model.agentPort() > 0 && model.agentPort() != model.firstPort();
            agentPort.setVisible(another);
            agentPort.setManaged(another);
            agentPort.showing("agent port " + model.agentPort(), model.agentPort());
            connection.setText(model.connection());
            dot.getStyleClass().setAll("dot", model.connected() ? "connected" : model.switchedOff() ? "off" : "waiting");
            if (!Objects.equals(shownConnected, !model.switchedOff())) {
                shownConnected = !model.switchedOff();
                goblin.awake(shownConnected);
            }
            pair.setVisible(model.pairingWanted());
            pair.setManaged(model.pairingWanted());
            // A long one is three things in a row: what is wrong, why, and what to do. A line each.
            problem.setText(model.problem() == null ? "" : model.problem().replaceAll("(?<=[.]) (?=[A-Z])", "\n"));
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
                    shownRows.forEach(row -> lines.add(choice(row.id(), sessionRow(row, null))));
                    if (lines.isEmpty()) {
                        lines.add(label(model.noSessions(), "empty"));
                    }
                } else {
                    // Several: each agent's heading, and under it that agent's tabs.
                    for (PanelModel.Member member : shownAgents) {
                        lines.add(choice(member.id(), agentRow(member)));
                        var its = shownRows.stream().filter(row -> member.id().equals(row.owner())).toList();
                        its.forEach(row -> lines.add(choice(row.id(), sessionRow(row, member.name()))));
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
            blockedHint.setText(model.blocked().summary());
            blockedHint.getStyleClass().setAll("label", "hint", model.blocked().unreadable() != null ? "bad" : "fine");
            blockedTip.setText(model.blocked().explained());
            blockedTitle.setText(model.blocked().heading());
            policyHint.setText(model.blocked().policyLine());
            policyHint.setVisible(model.blocked().restricts());
            policyHint.setManaged(model.blocked().restricts());
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
                List<Node> rows = new ArrayList<>();
                if (times.isEmpty()) {
                    rows.add(label(noTimes, "empty"));
                } else {
                    rows.add(timeHead(times));
                    times.forEach(share -> rows.add(timeRow(share)));
                }
                timeRows.getChildren().setAll(rows);
            }
            var lines = shown.log(chosen);
            String text = lines.isEmpty() ? shown.noLog(chosen) : String.join("\n", lines);
            boolean changed = !text.equals(log.getText());
            // It holds still while the user reads in it: nothing is written under a mark or under a
            // place they have scrolled up to. What the user has just chosen is shown at once.
            boolean held = changed && !now && readingLog();
            if (changed && !held) {
                if (now) {
                    log.deselect();
                }
                log.setText(text);
                logToEnd();
            }
            // Held, the corner says so: beside metrics that count on, a log that stands still looks
            // broken. With how many lines have come since, and a button that goes to the newest.
            int newer = held ? PanelModel.newer(lines, log.getText()) : 0;
            follow.setText(newer == 1 ? "1 newer line  ↓" : newer + " newer lines  ↓");
            follow.setAccessibleText(newer + " newer lines. Go to the newest line of the log.");
            follow.setVisible(held);
            follow.setManaged(held);
            logCount.setText(held ? "held while you read" : shown.logCount(chosen, LOG_LINES));
        }

        /** Gives up the place in the log the user was reading at: its newest line shows, and it follows again. */
        void toNewest() {
            log.deselect();
            showChosen(true);
        }

        /** Whether the user is reading in the log: has marked some of it, or has scrolled up from its last line. */
        boolean readingLog() {
            if (!log.isVisible()) {
                // Its card is folded: nobody reads what is not shown, whatever was marked in it or
                // wherever it stood. It is written on, and is at its newest line when it shows again.
                return false;
            }
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

        /** What the two numbers of a heap are, over their columns. Without typical times there is the share alone. */
        private static Node timeHead(List<PanelModel.Share> shares) {
            var share = label("share", "time-head");
            share.setMinWidth(SHARE_WIDE);
            share.setTooltip(new Tooltip("How much of all the time of these calls went here."));
            var row = new HBox(grow(), share);
            if (shares.stream().anyMatch(each -> !each.typical().isEmpty())) {
                // The middle one of the calls, not the mean: one long wait does not move it. So a heap
                // that few calls spend time in, such as the waiting for the user, can have a share and 0 ms.
                var typical = label("typical", "time-head");
                typical.setMinWidth(TYPICAL_WIDE);
                typical.setTooltip(new Tooltip("What one call typically spends here: the middle one of the calls. "
                        + "Where only a few calls spend time, as in waiting for you, this is 0 ms though the share is not."));
                row.getChildren().add(typical);
            }
            row.getStyleClass().addAll("row", "time-head-row");
            return row;
        }

        /**
         * One heap of the time: its name, a bar as long as its share, the share in numbers, and how
         * long a call typically takes in it. What the heap is, and its longest, rest under the pointer.
         */
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
            percent.setMinWidth(SHARE_WIDE);
            var row = new HBox(name, track, percent);
            if (!share.typical().isEmpty()) {
                var typical = label(share.typical(), "time-share", "time-typical");
                typical.setMinWidth(TYPICAL_WIDE);
                row.getChildren().add(typical);
            }
            row.getStyleClass().add("row");
            if (!share.about().isEmpty()) {
                Tooltip.install(row, new Tooltip(share.about()));
                row.setAccessibleText(share.name() + ": " + share.percent() + " percent. " + share.about().replace('\n', ' '));
            }
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
            var row = new HBox(name, grow(), id);
            if (!member.connected()) {
                var state = label("not connected", "chip", "state");
                state.setMinWidth(Region.USE_PREF_SIZE);
                state.setTooltip(new Tooltip(member.connection()));
                row.getChildren().add(state);
            } else if (member.port() > 0) {
                // Its port while the extension is connected to it: the row has room for one of the two.
                // The port is copied by a click on it; the row is chosen by a click anywhere else.
                row.getChildren().add(new PortLabel("chip").showing(":" + member.port(), member.port()));
            }
            return chooser(row, member.id(), "agent", member.name() + ": show the metrics and the log of this agent only");
        }

        /**
         * One tab, as a button: a click on it chooses the tab, and its metrics and its log show in
         * the cards below. Pressed again, it gives the choice up.
         *
         * @param among the name of the agent the tab is listed under, where a server has several: the
         *              row then says whose the tab is, or that it is nobody's yet. Null with one agent
         */
        private ToggleButton sessionRow(PanelModel.Row session, String among) {
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
                open.setTooltip(new Tooltip("No agent has used this tab yet. The first that does becomes its owner, "
                        + "and no other agent can use it after that."));
                row.getChildren().add(open);
            } else if (among != null) {
                // With several agents, whose a tab is decides who can work in it: said in the row.
                var owner = label("owner: " + among, "chip");
                owner.setMinWidth(Region.USE_PREF_SIZE);
                owner.setTooltip(new Tooltip("Only " + among + " can use this tab. To give it to another agent, revoke it "
                        + "in the extension's popup and authorize the tab for that agent."));
                row.getChildren().add(owner);
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
            var arrow = new Region();
            arrow.getStyleClass().add("disclosure-arrow");
            var caption = new HBox(6, arrow, heading);
            caption.setAlignment(Pos.CENTER_LEFT);
            var toggle = new ToggleButton();
            toggle.getStyleClass().add("card-toggle");
            toggle.setGraphic(caption);
            toggle.setAccessibleText(title);
            toggle.setSelected(true);
            toggle.setMaxWidth(Double.MAX_VALUE);
            HBox.setHgrow(toggle, Priority.ALWAYS);
            var head = new HBox(toggle);
            head.getStyleClass().add("card-head");
            if (aside != null) {
                head.getChildren().add(aside);
            }
            var card = new VBox(head);
            for (Node section : content) {
                section.visibleProperty().bind(toggle.selectedProperty());
                section.managedProperty().bind(toggle.selectedProperty());
            }
            toggle.selectedProperty().addListener((property, was, expanded) ->
                    card.setMaxHeight(expanded ? Region.USE_COMPUTED_SIZE : Region.USE_PREF_SIZE));
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

        /** The button at the top, which is there while the browser holds another token. */
        Button pairCopy() {
            return pairCopy;
        }

        boolean pairShown() {
            return pair.isVisible();
        }

        /**
         * A button that puts the pairing token on the clipboard: it asks for that, and says for a
         * moment that it is done. The token is never in the window.
         */
        private static void copies(Button button, String idle, Consumer<Command> commands) {
            button.setAccessibleText("Copy the pairing token to the clipboard");
            button.setTooltip(new Tooltip("Puts the pairing token on the clipboard, for the extension's popup.\n"
                    + "It is not shown here, and it leaves the clipboard again after a minute."));
            var copied = new PauseTransition(Duration.seconds(3));
            copied.setOnFinished(over -> button.setText(idle));
            button.setOnAction(click -> {
                commands.accept(new Command.CopyToken());
                button.setText("Copied");
                copied.playFromStart();
            });
        }

        /** The button that opens the settings file. */
        Button edit() {
            return edit;
        }

        /** The button that goes to the log's newest line, shown while the log is held. */
        Button follow() {
            return follow;
        }

        /** What the corner of the log's card says. */
        String logCorner() {
            return logCount.getText();
        }

        /** What rests under the mouse on the blocked sites. */
        String blockedExplained() {
            return blockedTip.getText();
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
            return picture(scale, floating, null);
        }

        /**
         * The same, with the log held if {@code later} is given: scrolled up to its first line, as by
         * someone who reads in it, and then brought up to what the server holds a moment later.
         */
        Image picture(double scale, boolean floating, PanelModel later) {
            var scene = new Scene(frame(floating), floating ? Color.TRANSPARENT : GROUND);
            scene.getStylesheets().add(STYLESHEET);
            scene.getRoot().applyCss();
            scene.getRoot().layout();
            if (later == null) {
                // As a window does it a moment after it has laid the lines out: down to the last of them.
                logToEnd();
            } else {
                log.setScrollTop(0);
                scene.getRoot().layout();
                show(later);
                scene.getRoot().applyCss();
            }
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
