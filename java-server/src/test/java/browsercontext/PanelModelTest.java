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
                new PanelModel.Row("s1", "mail.example.com", "Read / Write", "active", false, "c-1a2b3c4d"),
                new PanelModel.Row("s2", "http://127.0.0.1:8931", "Explore", "paused", false, "c-1a2b3c4d"),
                new PanelModel.Row("s3", "docs.example.org", "Read", "suspended", false, "c-1a2b3c4d")), shown.sessions());
        assertEquals("3 tabs", shown.sessionsCount());
        // The extension reports a title and an address for each tab. The status tool gives them to
        // the agent; the panel, like the log, has neither.
        String everything = shown.toString();
        for (String ofThePage : List.of("Inbox", "private mail", "/mail/u/0", "from:someone", "#inbox")) {
            assertFalse(everything.contains(ofThePage), ofThePage);
        }
        // Without a tab the corner is empty: the card says so in the tabs' place, once.
        assertEquals("", model(true, false, 0, 0, List.of()).sessionsCount());
        assertEquals("1 tab", model(true, false, 0, 0, List.of(session("s1", "https://a.example", "read", "active"))).sessionsCount());
    }

    @Test
    void everyTabIsInTheListHoweverManyThereAre() {
        // Each can be clicked for its own metrics and log, so each has to be there. The window keeps
        // its height by letting the list scroll, which is the window's part and not in the model.
        var nine = java.util.stream.IntStream.rangeClosed(1, 9)
                .mapToObj(n -> session("s" + n, "https://site-" + n + ".example.org", "read", "active")).toList();
        PanelModel shown = model(true, false, 0, 0, nine);
        assertEquals(List.of("s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"),
                shown.sessions().stream().map(PanelModel.Row::id).toList());
        assertEquals(9, shown.tabs());
        assertEquals("9 tabs", shown.sessionsCount());
        assertTrue(shown.has("s9"));
        assertFalse(shown.has("s10"));
    }

    @Test
    void theMetricsAndTheLogAreThereForAllTabsAndForEachTabAlone() {
        var both = List.of(session("s1", "https://a.example", "write", "active"), session("s2", "https://b.example", "read", "active"));
        var all = new Timings.Shares(12, 9_000, 200, 500, 300);
        var ofOne = new Timings.Shares(10, 8_000, 100, 400, 0);
        var ofTwo = new Timings.Shares(1, 1_000, 0, 100, 300);
        var log = List.of(
                new Log.Line(1_000, "info", "extension connected client=c-1a2b3c4d protocol=2"),
                new Log.Line(2_000, "debug", "command id=1 session=s1 action=snapshot ms=12 outcome=ok", "s1"),
                new Log.Line(3_000, "info", "command id=2 session=s2 action=fill ms=4 outcome=error code=PAUSED category=AUTHORIZATION", "s2"),
                new Log.Line(4_000, "debug", "command id=3 session=s1 action=click ms=31 outcome=ok", "s1"),
                new Log.Line(5_000, "debug", "command id=4 session=- action=status ms=1 outcome=ok"));
        PanelModel shown = PanelModel.of("claude-code", "c-1a2b3c4d", 47821, "9.8.7", null, true, false, 0, 0, both, all,
                java.util.Map.of("s1", ofOne, "s2", ofTwo), log, UTC);

        // With no tab chosen: every call and every line. The shares are of all the time together.
        assertEquals(12, shown.metrics(null).calls());
        assertEquals(PanelModel.shares(all), shown.metrics(null).shares());
        assertEquals("time of the last 12 calls", shown.callsCount(null));
        assertEquals(5, shown.log(null).size());
        assertEquals("the last 300 lines", shown.logCount(null, 300));
        assertEquals("", shown.chosenNote(null));

        // One tab: its calls alone, and the lines of its commands. A line that belongs to no tab, a
        // connection made or a status asked, is not among them.
        assertEquals(10, shown.metrics("s1").calls());
        assertEquals(PanelModel.shares(ofOne), shown.metrics("s1").shares());
        assertEquals("s1  ·  time of the last 10 calls", shown.callsCount("s1"));
        assertEquals(List.of("00:00:02  command id=1 session=s1 action=snapshot ms=12 outcome=ok",
                "00:00:04  command id=3 session=s1 action=click ms=31 outcome=ok"), shown.log("s1"));
        assertEquals("s1  ·  2 of the last 300 lines", shown.logCount("s1", 300));
        assertEquals("s2  ·  time of the last call", shown.callsCount("s2"));
        assertEquals(1, shown.log("s2").size());
        assertEquals("showing s1 only  ·  click again for all", shown.chosenNote("s1"));

        // A tab that no call has worked in yet has no metrics and no line, and says so.
        PanelModel quiet = PanelModel.of("claude-code", "c-1a2b3c4d", 47821, "9.8.7", null, true, false, 0, 0, both, all,
                java.util.Map.of("s1", ofOne), log.subList(0, 2), UTC);
        assertEquals(PanelModel.Metrics.NONE, quiet.metrics("s2"));
        assertEquals("s2", quiet.callsCount("s2"));
        assertEquals("No tool call has ended in this tab yet", quiet.noTimes("s2"));
        assertEquals(List.of(), quiet.log("s2"));
        assertEquals("s2  ·  none of the last 300 lines", quiet.logCount("s2", 300));
        assertEquals("No call in this tab among the lines that are kept.", quiet.noLog("s2"));
        assertEquals("Nothing logged yet.", quiet.noLog(null));
        // Nothing of a page is in any of it, chosen or not.
        assertFalse(shown.toString().contains("Inbox"));
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
    void aServerWithoutAnAgentSaysSoAndWaitsForOne() {
        // The one server, started by the user, before any agent's program has connected to it.
        PanelModel empty = PanelModel.of(List.of(), 47829, "9.8.7", false, List.of(), UTC);
        assertEquals("no agent", empty.agent());
        assertEquals("one server for all your agents", empty.identity());
        assertFalse(empty.connected());
        assertEquals("No agent connected", empty.connection());
        // What to do about it, and not the same sentence a second time.
        assertEquals("Start your agent (IDE or CLI): it connects by itself.", empty.note());
        assertEquals("", empty.sessionsCount());
        assertEquals("No tabs", empty.noSessions());
        assertEquals("No calls yet", empty.noTimes());
        assertEquals(List.of(), empty.agents());
        // Switched off, it says that first: nothing connects while that is so.
        assertEquals("Switched off here: the extension is not let in",
                PanelModel.of(List.of(), 47829, "9.8.7", true, List.of(), UTC).connection());
        // With an agent there is no such note, and the words are that agent's.
        PanelModel one = model(true, false, 0, 0, List.of());
        assertEquals("", one.note());
        assertEquals("No tab is authorized for this agent", one.noSessions());
        assertEquals("No tool call has ended yet", one.noTimes());
        assertEquals("Not known while the browser is not connected", model(false, false, 0, 0, List.of()).noSessions());
    }

    @Test
    void severalAgentsOfOneServerAreAllShownEachWithItsOwnTabsTimesAndLines() {
        var time = new Timings.Shares(4, 3_000, 100, 800, 100);
        var ofTab = new Timings.Shares(3, 2_000, 50, 700, 0);
        var other = new Timings.Shares(2, 1_000, 0, 1_000, 0);
        // A tab that the user authorized for any agent is reported to each agent until one has used it.
        var open = new Protocol.Session("s3", "", "a3", "https://c.example", 9, 0, "d3", "read", 1, "active", "", "", true);
        var first = new PanelModel.Facts("claude-code", "c-11111111", 47821, null, true, 12 * 3_600_000L, 0,
                List.of(session("s1", "https://a.example", "write", "active"), open), time, java.util.Map.of("s1", ofTab));
        var second = new PanelModel.Facts("", "c-22222222", 47822, null, false, 0, Protocol.CLOSE_USER_DISCONNECTED,
                List.of(), other, java.util.Map.of());
        var log = List.of(
                new Log.Line(1_000, "info", "server listening for agents port=47829"),
                new Log.Line(2_000, "info", "listening port=47821 client=c-11111111", null, "c-11111111"),
                new Log.Line(3_000, "debug", "command id=1 session=s1 action=snapshot ms=12 outcome=ok", "s1", "c-11111111"),
                new Log.Line(4_000, "info", "listening port=47822 client=c-22222222", null, "c-22222222"));
        PanelModel shown = PanelModel.of(List.of(first, second), 47829, "9.8.7", false, log, UTC);

        assertEquals("2 agents", shown.agent());
        assertEquals("2 agents", shown.identity());
        assertEquals(List.of(
                new PanelModel.Member("c-11111111", "claude-code", 47821, true, "Connected to the browser since 12:00:00", 2),
                new PanelModel.Member("c-22222222", "Agent c-22222222", 47822, false,
                        "Not connected: disconnected in the extension's popup", 0)), shown.agents());
        // The dot is green only when every agent is connected, and the line says how many are.
        assertFalse(shown.connected());
        assertEquals("1 of 2 agents is connected to the browser", shown.connection());
        assertEquals("2 agents  ·  2 tabs", shown.sessionsCount());
        assertEquals(List.of("c-11111111", "c-11111111"), shown.sessions().stream().map(PanelModel.Row::owner).toList());
        assertEquals("", shown.note());

        // Everything together: the calls of both, and every line.
        assertEquals(6, shown.metrics(null).calls());
        assertEquals(PanelModel.shares(new Timings.Shares(6, 4_000, 100, 1_800, 100)), shown.metrics(null).shares());
        assertEquals(4, shown.log(null).size());
        // One agent: its calls and its lines. The server's own line is no agent's.
        assertTrue(shown.has("c-11111111"));
        assertEquals(4, shown.metrics("c-11111111").calls());
        assertEquals("claude-code  ·  time of the last 4 calls", shown.callsCount("c-11111111"));
        assertEquals(2, shown.log("c-11111111").size());
        assertEquals("claude-code  ·  2 of the last 300 lines", shown.logCount("c-11111111", 300));
        assertEquals("showing claude-code only  ·  click again for all", shown.chosenNote("c-11111111"));
        assertEquals("Agent c-22222222  ·  time of the last 2 calls", shown.callsCount("c-22222222"));
        assertEquals(List.of("00:00:04  listening port=47822 client=c-22222222"), shown.log("c-22222222"));
        // One tab: as with one agent.
        assertEquals(3, shown.metrics("s1").calls());
        assertEquals(1, shown.log("s1").size());
        assertEquals("showing s1 only  ·  click again for all", shown.chosenNote("s1"));
        // An agent without a call, and what stands in the place of each agent's tabs.
        PanelModel quiet = PanelModel.of(List.of(first, new PanelModel.Facts("IntelliJ IDEA", "c-33333333", 47823, null, true,
                0, 0, List.of(), new Timings.Shares(0, 0, 0, 0, 0), java.util.Map.of())), 47829, "9.8.7", false, List.of(), UTC);
        assertEquals("No tool call of this agent has ended yet", quiet.noTimes("c-33333333"));
        assertEquals("No line of this agent among the lines that are kept.", quiet.noLog("c-33333333"));
        assertEquals("Both agents are connected to the browser", quiet.connection());
        assertTrue(quiet.connected());
        assertEquals("No tab is authorized for this agent", PanelModel.noSessions(quiet.agents().get(1)));
        assertEquals("Not known while the browser is not connected", PanelModel.noSessions(shown.agents().get(1)));
        assertEquals("All 3 agents are connected to the browser", PanelModel.connection(List.of(quiet.agents().get(0),
                quiet.agents().get(1), quiet.agents().get(0)), false));
        assertEquals("No agent is connected to the browser", PanelModel.connection(List.of(shown.agents().get(1)), false));
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
            PanelModel alone = PanelModel.of(bridge, null);
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
            PanelModel paired = PanelModel.of(bridge, null);
            assertTrue(paired.connected());
            assertTrue(paired.connection().startsWith("Connected to the browser since "), paired.connection());
            assertEquals(List.of(new PanelModel.Row("s1", "app.example.com", "Explore", "active", false, bridge.clientId())),
                    paired.sessions());
            assertFalse(paired.toString().contains("Board"), "the page's title stays out");
            assertFalse(paired.toString().contains("/b/42"), "the page's address stays out");

            bridge.setHeld(true);
            for (int i = 0; i < 100 && bridge.isExtensionConnected(); i++) {
                Thread.sleep(20);
            }
            PanelModel off = PanelModel.of(bridge, null);
            assertTrue(off.switchedOff());
            assertEquals("Switched off here: the extension is not let in", off.connection());
            assertTrue(off.sessions().isEmpty(), "what the extension reported went with its connection");
        } finally {
            bridge.stop(500);
        }
    }
}
