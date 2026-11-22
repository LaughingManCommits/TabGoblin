package browsercontext;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.Test;

/** What the server's panel shows, and what it leaves out. No window is needed for any of it. */
class PanelModelTest {

    private static final ZoneId UTC = ZoneId.of("UTC");
    private static final Timings.Shares NO_CALLS = new Timings.Shares(0, 0, 0, 0, 0);

    private static Protocol.Session session(String id, String origin, String mode, String state) {
        return new Protocol.Session(id, "c-1a2b3c4d", "a1", origin, 7, 0, "d1", mode, 2, state,
                "Inbox (3) - private mail", origin + "/mail/u/0/?q=from:someone#inbox");
    }

    private static PanelModel model(boolean connected, boolean off, long since, int closeCode, List<Protocol.Session> sessions) {
        return PanelModel.of("claude-code", "c-1a2b3c4d", 47821, "9.8.7", null, connected, off, since, closeCode, sessions,
                NO_CALLS, List.of(), UTC);
    }

    @Test
    void ofASessionItShowsTheSiteTheAccessAndTheStateAndNothingOfThePage() {
        PanelModel shown = model(true, false, 0, 0, List.of(
                session("s1", "https://mail.example.com", "write", "active"),
                session("s2", "http://127.0.0.1:8931", "explore", "paused"),
                session("s3", "https://docs.example.org", "read", "suspended")));
        assertEquals(List.of(
                new PanelModel.Row("s1", "mail.example.com", "Read / Write", "active"),
                new PanelModel.Row("s2", "http://127.0.0.1:8931", "Explore", "paused"),
                new PanelModel.Row("s3", "docs.example.org", "Read", "suspended")), shown.sessions());
        assertEquals("3 tabs", shown.sessionsCount());
        // The extension reports a title and an address for each tab. The status tool gives them to
        // the agent; the panel, like the log, has neither.
        String everything = shown.toString();
        for (String ofThePage : List.of("Inbox", "private mail", "/mail/u/0", "from:someone", "#inbox")) {
            assertFalse(everything.contains(ofThePage), ofThePage);
        }
        assertEquals("no tabs", model(true, false, 0, 0, List.of()).sessionsCount());
        assertEquals("1 tab", model(true, false, 0, 0, List.of(session("s1", "https://a.example", "read", "active"))).sessionsCount());
    }

    @Test
    void withManyTabsThreeAreListedAndTheRestAreCounted() {
        // The window has a fixed height: a list as long as the tabs would push its controls out of it.
        var nine = java.util.stream.IntStream.rangeClosed(1, 9)
                .mapToObj(n -> session("s" + n, "https://site-" + n + ".example.org", "read", "active")).toList();
        PanelModel shown = model(true, false, 0, 0, nine);
        assertEquals(List.of("s1", "s2", "s3"), shown.sessions().stream().map(PanelModel.Row::id).toList());
        assertEquals(9, shown.tabs());
        assertEquals("9 tabs", shown.sessionsCount());
        assertEquals("and 6 more: the extension's popup lists every tab", shown.notListed());
        // Up to three, all are listed and nothing is said beyond them.
        assertEquals("", model(true, false, 0, 0, nine.subList(0, 3)).notListed());
        assertEquals("and 1 more: the extension's popup lists every tab", model(true, false, 0, 0, nine.subList(0, 4)).notListed());
        assertEquals("", model(true, false, 0, 0, List.of()).notListed());
    }

    @Test
    void oneLineSaysWhetherTheBrowserIsConnectedSinceWhenOrWhyNot() {
        long tenPastNoon = 12 * 3_600_000L + 10 * 60_000L + 7_000L;
        assertEquals("Connected to the browser since 12:10:07", model(true, false, tenPastNoon, 0, List.of()).connection());
        // Switched off here comes before any other reason: while that is so, nothing else can connect.
        assertEquals("Switched off here: the extension is not let in",
                model(false, true, 0, Protocol.CLOSE_USER_DISCONNECTED, List.of()).connection());
        assertEquals("Not connected: disconnected in the extension's popup",
                model(false, false, 0, Protocol.CLOSE_USER_DISCONNECTED, List.of()).connection());
        assertEquals("Not connected: the pairing has ended", model(false, false, 0, Protocol.CLOSE_UNAUTHORIZED, List.of()).connection());
        assertEquals("Not connected: the extension is of another version",
                model(false, false, 0, Protocol.CLOSE_VERSION, List.of()).connection());
        assertEquals("Not connected: waiting for the extension", model(false, false, 0, 0, List.of()).connection());
        assertEquals("Not connected: waiting for the extension", model(false, false, 0, 1006, List.of()).connection());
        // A moment is shown in the zone it is asked for.
        assertEquals("14:10:07", PanelModel.clock(tenPastNoon, ZoneId.of("Europe/Helsinki")));
    }

    @Test
    void theTimeIsShownAsFourSharesInTheOrderACallPassesThroughThem() {
        var time = new Timings.Shares(12, 9_000, 200, 500, 300);
        assertEquals(List.of(
                new PanelModel.Share("Agent and its model", 90, false),
                new PanelModel.Share("This server", 2, false),
                new PanelModel.Share("Extension and page", 5, false),
                new PanelModel.Share("Waiting for you", 3, true)), PanelModel.shares(time));
        PanelModel shown = PanelModel.of("claude-code", "c-1", 47821, "9.8.7", null, true, false, 0, 0, List.of(), time,
                List.of(), UTC);
        assertEquals("time of the last 12 calls", shown.callsCount());
        // Before any call has ended there is nothing to divide, and the panel says so in words.
        assertEquals(List.of(), PanelModel.shares(NO_CALLS));
        assertEquals(List.of(), PanelModel.shares(new Timings.Shares(1, 0, 0, 0, 0)));
        assertEquals("", model(true, false, 0, 0, List.of()).callsCount());
        assertEquals("time of the last call", PanelModel.of("a", "c-1", 1, "v", null, true, false, 0, 0, List.of(),
                new Timings.Shares(1, 0, 4, 0, 0), List.of(), UTC).callsCount());
    }

    @Test
    void anAgentWithoutANameIsSaidToHaveNoneAndAProblemAtTheStartIsPassedOn() {
        // An agent says its name with its first tool call. Until then it goes by its id, as in the popup,
        // and the line that says whose server this is does not say the id twice.
        for (String noName : new String[] {"", "  ", null}) {
            PanelModel unnamed = PanelModel.of(noName, "c-1a2b3c4d", 47821, "9.8.7", null, false, false, 0, 0, List.of(),
                    NO_CALLS, List.of(), UTC);
            assertEquals("Agent c-1a2b3c4d", unnamed.agent());
            assertEquals("Agent c-1a2b3c4d  ·  port 47821", unnamed.identity());
        }
        PanelModel named = model(true, false, 0, 0, List.of());
        assertEquals("claude-code", named.agent());
        assertEquals("claude-code  ·  c-1a2b3c4d  ·  port 47821", named.identity());
        PanelModel stuck = PanelModel.of("claude-code", "c-1", 47821, "9.8.7", "Could not listen on any of ports 47821-47828.",
                false, false, 0, 0, List.of(), NO_CALLS, List.of(new Log.Line(5, "warn", "a line")), UTC);
        assertEquals("Could not listen on any of ports 47821-47828.", stuck.problem());
        // A line of the log is shown as it was written, with its time of day in front and a mark on a warning.
        assertEquals(List.of("00:00:00  ! a line"), stuck.log());
        assertEquals("03:25:45  listening port=47821",
                PanelModel.logLine(new Log.Line(5_145_000, "info", "listening port=47821"), ZoneId.of("Europe/Helsinki")));
        assertTrue(stuck.sessions().isEmpty());
    }

    @Test
    void aServerStartedByHandSaysThatNoAgentsWorkShowsInIt() {
        // An agent's own server: nothing is added, and the words are the ones it always had.
        PanelModel agents = model(true, false, 0, 0, List.of());
        assertFalse(agents.byHand());
        assertEquals("", agents.note());
        assertEquals("No tab is authorized for this agent", agents.noSessions());
        assertEquals("No tool call has ended yet", agents.noTimes());
        assertEquals("", model(true, false, 0, 0, List.of(session("s1", "https://a.example", "read", "active"))).notUsed());

        // One that a person started in a terminal has no agent. Its panel was taken for the place
        // where an agent's tabs and times show, and nothing in it said otherwise.
        PanelModel hand = agents.startedByHand();
        assertTrue(hand.byHand());
        assertEquals("Started by hand: no agent talks to this server. An agent's tabs and tool calls are in its own "
                + "server's window, which that server shows when it is started with --panel.", hand.note());
        assertEquals("No tab is authorized for this server", hand.noSessions());
        assertEquals("No tool calls: no agent talks to this server", hand.noTimes());
        assertEquals("", hand.notUsed(), "without a tab there is nothing to say of one");
        // Everything else is as it was.
        assertEquals(agents.identity(), hand.identity());
        assertEquals(agents.connection(), hand.connection());
        assertEquals(agents.sessionsCount(), hand.sessionsCount());

        // A tab can be authorized for it, and then nobody works there: said under the tab.
        var one = List.of(session("s1", "https://a.example", "read", "active"));
        assertEquals("No agent can use this tab: authorize it for the agent, in the extension's popup",
                model(true, false, 0, 0, one).startedByHand().notUsed());
        var nine = java.util.stream.IntStream.rangeClosed(1, 9)
                .mapToObj(n -> session("s" + n, "https://site-" + n + ".example.org", "read", "active")).toList();
        PanelModel many = model(true, false, 0, 0, nine).startedByHand();
        assertEquals("No agent can use these tabs: authorize them for the agent, in the extension's popup", many.notUsed());
        assertEquals("and 6 more: the extension's popup lists every tab", many.notListed());

        // A tab that the user authorized for any agent is listed by every server until one agent has
        // used it. It is not this server's own, and an agent can take it: nothing is said against it.
        var open = new Protocol.Session("s2", "", "a2", "https://b.example", 8, 0, "d2", "explore", 1, "active", "", "", true);
        PanelModel onlyOpen = model(true, false, 0, 0, List.of(open)).startedByHand();
        assertEquals(1, onlyOpen.tabs());
        assertEquals(1, onlyOpen.open());
        assertEquals("", onlyOpen.notUsed());
        assertEquals(List.of(new PanelModel.Row("s2", "b.example", "Explore", "active", true)), onlyOpen.sessions());
        // Beside one of its own, the line names which it means.
        PanelModel both = model(true, false, 0, 0, List.of(one.get(0), open)).startedByHand();
        assertEquals("No agent can use the tab that is authorized for this server: authorize it for the agent, "
                + "in the extension's popup", both.notUsed());
        assertEquals("No agent can use the tabs that are authorized for this server: authorize them for the agent, "
                + "in the extension's popup", model(true, false, 0, 0, List.of(one.get(0), nine.get(1), open)).startedByHand().notUsed());
        // On an agent's own server it is marked the same way, and its own tabs are not.
        assertEquals(List.of(false, true), model(true, false, 0, 0, List.of(one.get(0), open)).sessions().stream()
                .map(PanelModel.Row::open).toList());

        // Without the browser it is not known whether there is a tab, whoever started the server.
        PanelModel apart = model(false, false, 0, 0, List.of());
        assertEquals("Not known while the browser is not connected", apart.noSessions());
        assertEquals("Not known while the browser is not connected", apart.startedByHand().noSessions());
    }

    @Test
    void theWindowDoesWithoutTheSystemsFrameOnlyWhereThatWasSeenToWork() {
        assertTrue(Panel.floats("Windows 11", true));
        assertTrue(Panel.floats("windows server 2022", true));
        // A see-through window drew nothing on the Linux it was tried on, and macOS was not tried.
        assertFalse(Panel.floats("Linux", true));
        assertFalse(Panel.floats("Mac OS X", true));
        assertFalse(Panel.floats("", true));
        // And not where the system says it has no see-through windows.
        assertFalse(Panel.floats("Windows 11", false));
    }

    @Test
    void itIsReadFromTheRunningServerThroughTheObjectsTheStatusToolReads() throws Exception {
        WebSocketBridge bridge = new WebSocketBridge(0, WebSocketBridgeTest.TOKEN, FakeExtension.ORIGIN, 400);
        bridge.startAndWait();
        try {
            bridge.setClientName("claude-code");
            PanelModel alone = PanelModel.of(bridge, null, false);
            assertFalse(alone.byHand());
            assertTrue(PanelModel.of(bridge, null, true).byHand(), "said by the one who started the server");
            assertEquals("claude-code", alone.agent());
            assertEquals("claude-code  ·  " + bridge.clientId() + "  ·  port " + bridge.getPort(), alone.identity());
            assertEquals(bridge.getPort(), alone.port());
            assertFalse(alone.connected());
            assertEquals("Not connected: waiting for the extension", alone.connection());

            FakeExtension ext = FakeExtension.paired(bridge.getPort(), WebSocketBridgeTest.TOKEN);
            ext.send("""
                    {"type":"event","event":"sessions","data":{"sessions":[{"session":"s1","origin":"https://app.example.com",\
                    "mode":"explore","state":"active","tab":{"title":"Board - private","url":"https://app.example.com/b/42"}}]}}""");
            for (int i = 0; i < 100 && bridge.sessions().isEmpty(); i++) {
                Thread.sleep(20);
            }
            PanelModel paired = PanelModel.of(bridge, null, false);
            assertTrue(paired.connected());
            assertTrue(paired.connection().startsWith("Connected to the browser since "), paired.connection());
            assertEquals(List.of(new PanelModel.Row("s1", "app.example.com", "Explore", "active")), paired.sessions());
            assertFalse(paired.toString().contains("Board"), "the page's title stays out");
            assertFalse(paired.toString().contains("/b/42"), "the page's address stays out");

            bridge.setHeld(true);
            for (int i = 0; i < 100 && bridge.isExtensionConnected(); i++) {
                Thread.sleep(20);
            }
            PanelModel off = PanelModel.of(bridge, null, false);
            assertTrue(off.switchedOff());
            assertEquals("Switched off here: the extension is not let in", off.connection());
            assertTrue(off.sessions().isEmpty(), "what the extension reported went with its connection");
        } finally {
            bridge.stop(500);
        }
    }
}
