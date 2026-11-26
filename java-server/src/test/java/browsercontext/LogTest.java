package browsercontext;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/** The lines the log keeps in memory for the server's panel. */
class LogTest {

    @AfterEach
    void keepNothing() {
        Log.keep(0);
    }

    private static List<String> texts() {
        return Log.recent().stream().map(Log.Line::text).toList();
    }

    @Test
    void nothingIsKeptUnlessThePanelAsksForIt() {
        Log.info("before anything asked");
        assertEquals(List.of(), Log.recent());
        long before = Log.count();
        Log.warn("still nothing");
        assertEquals(before, Log.count());
    }

    @Test
    void theLastLinesAreKeptAsTheyWereWrittenAndNoMore() {
        Log.keep(3);
        long before = System.currentTimeMillis();
        long counted = Log.count();
        Log.info("one");
        Log.warn("two");
        Log.command("7", "s2", "click", 31, "NAVIGATION_BLOCKED");
        assertEquals(List.of("one", "two",
                "command id=7 session=s2 action=click ms=31 outcome=error code=NAVIGATION_BLOCKED category=SCOPE scope_violation=true"),
                texts());
        assertEquals(List.of("info", "warn", "info"), Log.recent().stream().map(Log.Line::level).toList());
        assertTrue(Log.recent().stream().allMatch(line -> line.at() >= before && line.at() <= System.currentTimeMillis()));

        // A fourth line takes the place of the oldest, and the count goes on: a reader sees that something came.
        Log.info("four");
        assertEquals(3, Log.recent().size());
        assertEquals("two", texts().get(0));
        assertEquals("four", texts().get(2));
        assertEquals(counted + 4, Log.count());
    }

    @Test
    void aDetailIsKeptOnlyWhenItIsLoggedAndACallThatWentThroughAlways() {
        // Run with BCMCP_LOG=debug, a debug line is logged, and then it is kept too.
        org.junit.jupiter.api.Assumptions.assumeFalse("debug".equalsIgnoreCase(System.getenv("BCMCP_LOG")));
        Log.keep(5);
        // A detail is a debug line, and the tests run at the default level: it is not written, and not kept.
        Log.debug("a detail");
        assertEquals(List.of(), texts());
        // A call that went through is written at debug only, and kept for the panel all the same:
        // that is where the user looks for what the agent did. It carries no mark of a warning.
        Log.command("8", "s1", "snapshot", 12, null);
        assertEquals(List.of("command id=8 session=s1 action=snapshot ms=12 outcome=ok"), texts());
        assertEquals("debug", Log.recent().get(0).level());
        // And the tab it ran in, by which the panel shows one tab's calls. Any other line has none.
        assertEquals("s1", Log.recent().get(0).session());
        Log.command("9", "s2", "fill", 4, "PAUSED");
        Log.command("10", null, "status", 1, null);
        Log.info("extension connected");
        assertEquals(java.util.Arrays.asList("s1", "s2", null, null), Log.recent().stream().map(Log.Line::session).toList());
        Log.keep(0);
        Log.keep(5);
        Log.command("8", "s1", "snapshot", 12, null);
        // The window shows a call's line in short: its tab, the action, how long, and how it ended.
        assertEquals("00:00:00  s1 snapshot  12 ms  ok",
                PanelModel.logLine(new Log.Line(0, "debug", texts().get(0)), java.time.ZoneId.of("UTC")));
        Log.keep(0);
        Log.keep(5);
        // Fewer lines asked for: the oldest go at once.
        Log.info("a");
        Log.info("b");
        Log.info("c");
        Log.keep(2);
        assertEquals(List.of("b", "c"), texts());
    }
}
