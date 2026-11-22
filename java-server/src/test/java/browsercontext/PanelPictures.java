package browsercontext;

import java.awt.image.BufferedImage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.ZoneId;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import javafx.application.Platform;
import javafx.scene.image.Image;
import javafx.scene.image.PixelFormat;
import javax.imageio.ImageIO;

/**
 * Pictures of the server's panel in the states it has, to look at. Not a test: it is run by hand
 * after a change to the panel, and what it writes is not in git.
 *
 * <pre>
 *   mvn -q -f java-server/pom.xml test-compile dependency:build-classpath -Dmdep.outputFile=target/classpath.txt
 *   java -cp "java-server/target/classes;java-server/target/test-classes;$(cat java-server/target/classpath.txt)" \
 *        browsercontext.PanelPictures java-server/target/panel-pictures
 * </pre>
 *
 * <p>The panel is drawn by the server's own code from made-up states, without a window being
 * shown and without a server. It needs a display all the same: JavaFX does not start without one.
 * Nothing of the screen is read, so nothing else that is on it can get into a picture. The first
 * picture is the one the documentation shows ({@code docs/images/server-panel.png}); the last is
 * the panel as it fills a window with the system's frame, as on Linux and macOS.
 *
 * <p>What they cannot show is the window itself on a desktop: whether it appears, its icon on the
 * taskbar, and that its buttons do what they say. That is looked at by hand.
 */
final class PanelPictures {

    private static final ZoneId ZONE = ZoneId.of("Europe/Amsterdam");
    /** A fixed moment, so that the pictures are the same every time: 2026-11-22 10:41:52 in that zone. */
    private static final long NOW = 1_795_340_512_000L;

    private PanelPictures() {
    }

    public static void main(String[] args) throws Exception {
        Path out = Path.of(args.length > 0 ? args[0] : "panel-pictures");
        Files.createDirectories(out);
        var done = new CompletableFuture<Void>();
        Panel.onFxThread(() -> {
            try {
                for (var state : states()) {
                    var view = new Panel.View(command -> { });
                    view.show(state.model());
                    if (state.armed()) {
                        view.ends().get(0).fire();
                    }
                    write(view.picture(2, !state.framed()), out.resolve(state.name() + ".png"));
                    System.out.println(state.name() + ".png");
                }
                done.complete(null);
            } catch (Throwable e) {
                done.completeExceptionally(e);
            }
        });
        try {
            done.get(60, TimeUnit.SECONDS);
        } finally {
            Platform.exit();
        }
    }

    /** {@code armed}: Stop has had its first click. {@code framed}: as in the system's own window, where the panel does not float. */
    private record State(String name, PanelModel model, boolean armed, boolean framed) {
        State(String name, PanelModel model, boolean armed) {
            this(name, model, armed, false);
        }
    }

    private static List<State> states() {
        var sessions = List.of(
                session("s1", "https://github.com", "explore", "active"),
                session("s2", "http://127.0.0.1:8931", "write", "paused"),
                session("s3", "https://docs.example.org", "read", "suspended"));
        var log = List.of(
                line(-512, "info", "listening port=47821 client=c-7240df8e"),
                line(-511, "info", "panel shown"),
                line(-498, "info", "extension connected client=c-7240df8e protocol=2"),
                line(-214, "info", "command id=12 session=s2 action=fill ms=4 outcome=error code=PAUSED category=AUTHORIZATION"),
                line(-61, "warn", "connection rejected reason=pairing_proof"),
                line(-9, "info", "command id=27 session=s1 action=navigate ms=31 outcome=error code=NAVIGATION_BLOCKED category=SCOPE scope_violation=true"));
        var times = timings();
        var none = new Timings.Shares(0, 0, 0, 0, 0);
        return List.of(
                new State("1-connected", model("claude-code", null, true, false, NOW - 498_000, 0, sessions, times, log), false),
                new State("2-waiting", model("", null, false, false, 0, 0, List.of(), none, log.subList(0, 2)), false),
                new State("3-switched-off", model("IntelliJ IDEA", null, false, true, 0, 1001, List.of(), times, log), false),
                new State("4-no-port", model("claude-code",
                        "Could not listen on any of ports 47821-47828 on 127.0.0.1: too many TabGoblin servers are running.",
                        false, false, 0, 0, List.of(), none, List.of()), false),
                new State("5-armed", model("claude-code", null, true, false, NOW - 498_000, 0, sessions.subList(0, 1), times, log), true),
                new State("6-framed", model("claude-code", null, true, false, NOW - 498_000, 0, sessions, times, log), false, true));
    }

    private static PanelModel model(String agent, String problem, boolean connected, boolean off, long since, int closeCode,
            List<Protocol.Session> sessions, Timings.Shares times, List<Log.Line> log) {
        return PanelModel.of(agent, "c-7240df8e", 47821, "0.2.0", problem, connected, off, since, closeCode, sessions, times,
                log, ZONE);
    }

    private static Protocol.Session session(String id, String origin, String mode, String state) {
        // A title and an address, as the extension reports them: the panel must show neither.
        return new Protocol.Session(id, "c-7240df8e", "a-" + id, origin, 7, 0, "d1", mode, 3, state,
                "A page title that must not show", origin + "/a/path/that/must/not/show");
    }

    private static Log.Line line(long secondsAgo, String level, String text) {
        return new Log.Line(NOW + secondsAgo * 1000, level, text);
    }

    /** Where the time went, from a few made-up calls. */
    private static Timings.Shares timings() {
        var clock = new AtomicLong();
        var timings = new Timings(clock::get);
        long[][] calls = {{1200, 40, 31}, {5200, 35, 28}, {800, 1900, 1880}, {14000, 60, 52}};
        String[] tools = {"browser_snapshot", "browser_click", "browser_submit", "browser_extract"};
        for (int i = 0; i < calls.length; i++) {
            clock.addAndGet(calls[i][0] * 1_000_000);
            var running = timings.begin(tools[i]);
            clock.addAndGet(calls[i][1] * 1_000_000);
            timings.trip(calls[i][2] * 1_000_000, new Protocol.Timing(calls[i][2] - 3, 0, i == 2 ? 1600 : 0));
            timings.end(running, true);
        }
        return timings.shares();
    }

    private static void write(Image image, Path file) throws java.io.IOException {
        int width = (int) image.getWidth();
        int height = (int) image.getHeight();
        int[] pixels = new int[width * height];
        image.getPixelReader().getPixels(0, 0, width, height, PixelFormat.getIntArgbInstance(), pixels, 0, width);
        var picture = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        picture.setRGB(0, 0, width, height, pixels, 0, width);
        ImageIO.write(picture, "png", file.toFile());
    }
}
