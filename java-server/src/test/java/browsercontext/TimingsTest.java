package browsercontext;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class TimingsTest {

    private final AtomicLong clock = new AtomicLong(5_000_000_000L);
    private final Timings timings = new Timings(clock::get);

    private static long nanos(long ms) {
        return ms * 1_000_000;
    }

    private void pass(long ms) {
        clock.addAndGet(nanos(ms));
    }

    /** One call of the given length with one round trip that took all of it but {@code server} ms. */
    private Timings.Call call(String tool, long total, long server, Protocol.Timing inside) {
        Timings.Running running = timings.begin(tool);
        timings.trip(nanos(total - server), inside);
        pass(total);
        return timings.end(running, true);
    }

    @Test
    void aCallIsTakenApartIntoItsParts() {
        Timings.Running running = timings.begin("browser_submit");
        timings.waited(nanos(5));
        timings.trip(nanos(100), new Protocol.Timing(80, 10, 30));
        pass(110);
        Timings.Call call = timings.end(running, true);

        assertEquals(110, call.total());
        assertEquals(5, call.waited());
        assertEquals(5, call.server(), "what is left after the waiting and the round trip");
        assertEquals(10, call.way(), "the round trip less what the extension accounts for");
        assertEquals(10, call.queue());
        assertEquals(50, call.browser(), "the running less the user's part");
        assertEquals(30, call.user());
        assertEquals(call.total(), call.server() + call.waited() + call.way() + call.queue() + call.browser() + call.user());
    }

    @Test
    void theTimeBetweenAnAnswerAndTheNextCallIsTheAgents() {
        assertEquals(-1, call("browser_snapshot", 20, 0, null).gap(), "nothing came before the first call");
        pass(2000);
        Timings.Running second = timings.begin("browser_click");
        // A call that begins while another runs was sent together with it: the agent took no time.
        Timings.Running third = timings.begin("browser_extract");
        pass(30);
        assertEquals(2000, timings.end(second, true).gap());
        assertEquals(0, timings.end(third, false).gap());
    }

    @Test
    void withoutTimesFromTheExtensionTheRoundTripStaysWhole() {
        Timings.Call call = call("browser_click", 300, 10, null);
        assertFalse(call.split());
        assertEquals(290, call.browser());
        assertEquals(0, call.way() + call.queue() + call.user());
        assertEquals(10, call.server());
        assertTrue(timings.report().contains("Note: 1 call got no times from the extension."), timings.report());

        // A call that never reached the extension has nothing to take apart, and is not counted as such.
        Timings.Running refused = timings.begin("browser_fill");
        timings.trip(0, null);
        pass(1);
        assertTrue(timings.end(refused, false).split());
    }

    @Test
    void theReportGivesEachPartsShareItsMedianAndItsLongest() {
        assertEquals("", timings.report(), "nothing to report before a call has ended");
        call("browser_snapshot", 100, 0, new Protocol.Timing(100, 0, 0));
        pass(1000);
        call("browser_submit", 3900, 0, new Protocol.Timing(3850, 50, 2500));

        String report = timings.report();
        assertTrue(report.startsWith("Where the time went, over the last 2 tool calls"), report);
        // 5000 ms in all: 1000 with the agent, 50 in the queue, 1450 in the extension, 2500 with the user.
        assertTrue(report.contains("   20%  between calls, with the agent and its model (median 1.0 s, longest 1.0 s)\n"), report);
        assertTrue(report.contains("    0%  in this server (median 0 ms, longest 0 ms)\n"), report);
        assertTrue(report.contains("    1%  waiting for its turn in the tab's queue (median 25 ms, longest 50 ms)\n"), report);
        assertTrue(report.contains("   29%  in the extension and the page (median 725 ms, longest 1.4 s)\n"), report);
        assertTrue(report.contains("   50%  waiting for the user's answer (median 1.3 s, longest 2.5 s)\n"), report);
        // Each of the last calls, with its larger parts first.
        assertTrue(report.contains("  browser_snapshot 100 ms (first call): extension and page 100 ms\n"), report);
        assertTrue(report.contains("  browser_submit 3.9 s (agent before it: 1.0 s): user 2.5 s, extension and page 1.4 s, tab's queue 50 ms\n"),
                report);
        assertFalse(report.contains("got no times"), report);
    }

    @Test
    void onlyTheLastCallsAreKeptAndOnlyAFewAreListed() {
        for (int i = 0; i < Timings.KEPT + 5; i++) {
            call(i == Timings.KEPT + 4 ? "browser_click" : "browser_snapshot", 10, 0, new Protocol.Timing(10, 0, 0));
        }
        String report = timings.report();
        assertTrue(report.contains("over the last " + Timings.KEPT + " tool calls"), report);
        assertEquals(Timings.LISTED, report.lines().filter(line -> line.startsWith("  browser_")).count());
        assertTrue(report.contains("  browser_click 10 ms (agent before it: 0 ms)"), report);
    }

    @Test
    void aFailedCallIsMarked() {
        Timings.Running running = timings.begin("browser_navigate");
        pass(4);
        timings.end(running, false);
        assertTrue(timings.report().contains("  browser_navigate 4 ms (first call): server 4 ms [failed]\n"), timings.report());
    }
}
