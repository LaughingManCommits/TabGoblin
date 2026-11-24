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
 * after a change to the panel, and what it writes is not in git. The command, and what to look
 * at in the real window besides, is in docs/agents/runbook.md, "Look at the server's panel".
 *
 * <p>The panel is drawn by the server's own code from made-up states, without a window being
 * shown and without a server. It needs a display all the same: JavaFX does not start without one.
 * Nothing of the screen is read, so nothing else that is on it can get into a picture. The first
 * picture is the one the documentation shows ({@code docs/images/server-panel.png}); the sixth is
 * the panel as it fills a window with the system's frame, as on Linux and macOS. Further on are
 * the one server without an agent and with two, and a tab and an agent clicked.
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
                    if (state.height() > 0) {
                        view.fit(state.height());
                    }
                    view.show(state.model());
                    if (state.armed()) {
                        view.ends().get(0).fire();
                    }
                    if (state.chosen() >= 0) {
                        view.tabs().get(state.chosen()).fire();
                    }
                    write(view.picture(2, !state.framed(), state.later()), out.resolve(state.name() + ".png"));
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

    /**
     * {@code armed}: Stop has had its first click. {@code framed}: as in the system's own window, where
     * the panel does not float. {@code height}: as high as on a screen that has no room for more; 0
     * for the window's own height. {@code chosen}: the tab that was clicked, counted from 0 in the
     * list, or -1 for none.
     */
    private record State(String name, PanelModel model, boolean armed, boolean framed, double height, int chosen,
            PanelModel later) {
        State(String name, PanelModel model, boolean armed) {
            this(name, model, armed, false, 0, -1, null);
        }

        State(String name, PanelModel model, boolean armed, boolean framed) {
            this(name, model, armed, framed, 0, -1, null);
        }

        State(String name, PanelModel model, boolean armed, boolean framed, double height) {
            this(name, model, armed, framed, height, -1, null);
        }

        /** The same with one tab clicked. */
        State chosen(String as, int tab) {
            return new State(as, model, armed, framed, height, tab, null);
        }

        /** The same with the log scrolled up to its first line, and what the server holds a moment later. */
        State held(String as, PanelModel later) {
            return new State(as, model, armed, framed, height, chosen, later);
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
                line(-301, "debug", "command id=9 session=s1 action=snapshot ms=18 outcome=ok", "s1"),
                line(-214, "info", "command id=12 session=s2 action=fill ms=4 outcome=error code=PAUSED category=AUTHORIZATION", "s2"),
                line(-61, "warn", "connection rejected reason=pairing_proof"),
                line(-40, "debug", "command id=26 session=s1 action=click ms=702 outcome=ok", "s1"),
                line(-9, "info", "command id=27 session=s1 action=navigate ms=31 outcome=error code=NAVIGATION_BLOCKED category=SCOPE scope_violation=true", "s1"));
        var times = timings();
        var none = new Timings.Shares(0, 0, 0, 0, 0);
        var twoAgents = new State("10-two-agents", PanelModel.of(List.of(
                new PanelModel.Facts("claude-code", "c-7240df8e", 47821, null, true, NOW - 498_000, 0,
                        List.of(sessions.get(0), new Protocol.Session("s4", "", "a-s4", "https://wiki.example.net", 9, 0, "d4",
                                "read", 1, "active", "A page title that must not show", "https://wiki.example.net/not/shown", true)),
                        tab(new long[][] {{1_200, 9, 31, 0}, {5_200, 7, 28, 0}, {800, 44, 1_241, 0}}), java.util.Map.of("s1", tab(new long[][] {{1_200, 9, 31, 0}, {5_200, 7, 28, 0}, {800, 44, 1_241, 0}}))),
                new PanelModel.Facts("IntelliJ IDEA", "c-3b9a01c2", 47822, null, false, 0, Protocol.CLOSE_USER_DISCONNECTED,
                        List.of(), tab(new long[][] {{14_000, 8, 52, 1_600}}), java.util.Map.of())),
                47829, McpMain.version(), false, List.of(
                        line(-512, "info", "server listening for agents port=47829"),
                        new Log.Line(NOW - 510_000, "info", "listening port=47821 client=c-7240df8e", null, "c-7240df8e"),
                        new Log.Line(NOW - 498_000, "info", "extension connected client=c-7240df8e protocol=2", null, "c-7240df8e"),
                        new Log.Line(NOW - 301_000, "debug", "command id=9 session=s1 action=snapshot ms=18 outcome=ok", "s1", "c-7240df8e"),
                        new Log.Line(NOW - 120_000, "info", "listening port=47822 client=c-3b9a01c2", null, "c-3b9a01c2"),
                        new Log.Line(NOW - 90_000, "info", "extension disconnected client=c-3b9a01c2 code=4403", null, "c-3b9a01c2")),
                ZONE), false);
        var connected = new State("1-connected", model("claude-code", null, true, false, NOW - 498_000, 0, sessions, times, log), false);
        return List.of(
                connected,
                new State("2-waiting", model("", null, false, false, 0, 0, List.of(), none, log.subList(0, 2)), false),
                new State("3-switched-off", model("IntelliJ IDEA", null, false, true, 0, 1001, List.of(), times, log), false),
                new State("4-no-port", model("claude-code",
                        Agent.noPort(47821, 0),
                        false, false, 0, 0, List.of(), none, List.of()), false),
                new State("5-armed", model("claude-code", null, true, false, NOW - 498_000, 0, sessions.subList(0, 1), times, log), true),
                new State("6-framed", model("claude-code", null, true, false, NOW - 498_000, 0, sessions, times, log), false, true),
                new State("7-many-tabs", model("claude-code", null, true, false, NOW - 498_000, 0, many(9), times, log), false),
                // The most there is to show, on a screen 768 pixels high with a taskbar: everything has to stay inside.
                new State("8-low-screen", model("claude-code",
                        Agent.noPort(47821, 0),
                        true, false, NOW - 498_000, 0, many(9), times, log), false, false, 680),
                // The one server before any agent has connected: started by the user, it waits and says so.
                new State("9-no-agent", PanelModel.of(List.of(), 47829, McpMain.version(), false,
                        List.of(line(-512, "info", "server listening for agents port=47829"), line(-511, "info", "panel shown")),
                        ZONE), false),
                // Two agents of the one server: each with a heading over its tabs. And the second agent clicked.
                twoAgents,
                twoAgents.chosen("13-agent-chosen", 3),
                // The first tab clicked: its metrics and its calls alone. And the second, which has one call.
                connected.chosen("11-tab-chosen", 0),
                connected.chosen("12-other-tab-chosen", 1),
                // Sites the user has blocked: named in the controls, and the tab on one of them says so.
                new State("14-blocked", blocked(sessions, times, log,
                        new BlockedSites.Rule(List.of("docs.example.org", "intranet.example", "mail.example.com"), null)), false),
                // A settings file with a mistake in it: every tab is blocked, and the window says what is wrong.
                new State("15-settings-unreadable", blocked(sessions, times, log, new BlockedSites.Rule(List.of(),
                        "\"exam_ple.org\" in blocked.sites is no domain")), false),
                // A security policy with a blocked site, and one without: the heading names the policy, and a
                // second line says in short what it restricts. The Control card is one line higher for it.
                new State("18-policy", blocked(sessions, times, log, new BlockedSites.Rule(List.of("docs.example.org"), null,
                        new BlockedSites.Limits(true, List.of("ci.example.org"), false, BlockedSites.Access.EXPLORE, 240, 20))), false),
                new State("19-policy-alone", blocked(sessions, times, log, new BlockedSites.Rule(List.of(), null,
                        new BlockedSites.Limits(false, List.of(), false, BlockedSites.Access.WRITE, 0, 0))), false),
                // Someone reads in the log, scrolled up to its first line, and seven lines have come since:
                // it stands still, and its corner says so, with the way to the newest line.
                connected.held("16-log-held", model("claude-code", null, true, false, NOW - 498_000, 0, sessions, times, later(log))),
                // A browser came with a token that is not the server's, as after a rotation: the window
                // says at its top what the user has to do, with the button that copies the token.
                new State("17-another-token", model("claude-code", null, false, false, 0, Protocol.CLOSE_UNAUTHORIZED, List.of(), none,
                        log.subList(0, 2)), false));
    }

    /** The same lines, and seven calls more. */
    private static List<Log.Line> later(List<Log.Line> log) {
        var more = new java.util.ArrayList<>(log);
        for (int i = 0; i < 7; i++) {
            more.add(line(-8 + i, "debug", "command id=" + (28 + i) + " session=s1 action=extract ms=" + (6 + i) + " outcome=ok", "s1"));
        }
        return more;
    }

    private static PanelModel blocked(List<Protocol.Session> sessions, Timings.Shares times, List<Log.Line> log, BlockedSites.Rule rule) {
        var more = new java.util.ArrayList<>(log);
        more.add(line(-4, "info", "command id=28 session=s3 action=snapshot ms=0 outcome=error code=SITE_BLOCKED category=SCOPE scope_violation=true", "s3"));
        return PanelModel.of(List.of(new PanelModel.Facts("claude-code", "c-7240df8e", 47821, null, true, NOW - 498_000, 0, sessions, times,
                java.util.Map.of("s1", tab(new long[][] {{1_200, 9, 31, 0}, {5_200, 7, 28, 0}, {800, 44, 1_241, 0}}), "s2", tab(new long[][] {{14_000, 8, 52, 1_600}})))),
                47821, McpMain.version(), false, more, ZONE, rule, "~/.browser-context-mcp/tabgoblin.properties");
    }

    private static PanelModel model(String agent, String problem, boolean connected, boolean off, long since, int closeCode,
            List<Protocol.Session> sessions, Timings.Shares times, List<Log.Line> log) {
        // The tabs' own times, where there are any at all: most of the calls in the first tab, one in the second.
        java.util.Map<String, Timings.Shares> ofTab = times.calls() == 0 ? java.util.Map.of()
                : java.util.Map.of("s1", tab(new long[][] {{1_200, 9, 31, 0}, {5_200, 7, 28, 0}, {800, 44, 1_241, 0}}), "s2", tab(new long[][] {{14_000, 8, 52, 1_600}}));
        return PanelModel.of(agent, "c-7240df8e", 47821, McpMain.version(), problem, connected, off, since, closeCode, sessions, times,
                ofTab, log, ZONE);
    }

    private static Protocol.Session session(String id, String origin, String mode, String state) {
        // A title and an address, as the extension reports them: the panel must show neither.
        return new Protocol.Session(id, "c-7240df8e", "a-" + id, origin, 7, 0, "d1", mode, 3, state,
                "A page title that must not show", origin + "/a/path/that/must/not/show");
    }

    /** More tabs than the window has room for. */
    private static List<Protocol.Session> many(int count) {
        return java.util.stream.IntStream.rangeClosed(1, count)
                .mapToObj(n -> session("s" + n, "https://site-" + n + ".example.org", n % 3 == 0 ? "write" : "explore", n == 4 ? "paused" : "active"))
                .toList();
    }

    private static Log.Line line(long secondsAgo, String level, String text) {
        return line(secondsAgo, level, text, null);
    }

    /** The line of a command, with the tab it ran in. */
    private static Log.Line line(long secondsAgo, String level, String text, String session) {
        return new Log.Line(NOW + secondsAgo * 1000, level, text, session);
    }

    /** Where the time went, from a few made-up calls. */
    /** The times of some calls, each as the agent's pause before it, the server, the browser and the user: with their sums. */
    private static Timings.Shares tab(long[][] calls) {
        var each = java.util.Arrays.stream(calls).map(c -> new Timings.Spent(c[0], c[1], c[2], c[3])).toList();
        return new Timings.Shares(calls.length, each.stream().mapToLong(Timings.Spent::agent).sum(),
                each.stream().mapToLong(Timings.Spent::server).sum(), each.stream().mapToLong(Timings.Spent::browser).sum(),
                each.stream().mapToLong(Timings.Spent::user).sum(), each);
    }

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
