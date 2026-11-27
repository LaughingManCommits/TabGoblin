package tabgoblin;

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
    void theSharesAreKeptForEachTabACallWorkedInAndTheReportHasNoneOfIt() {
        assertEquals(java.util.Map.of(), timings.sharesBySession());

        // Two calls in one tab, with the agent thinking for a second between them.
        Timings.Running first = timings.begin("browser_snapshot");
        timings.trip(nanos(30), new Protocol.Timing(25, 0, 0), "s1");
        pass(40);
        assertEquals("s1", timings.end(first, true).session());
        pass(1000);
        Timings.Running second = timings.begin("browser_click");
        timings.trip(nanos(50), new Protocol.Timing(45, 0, 0), "s1");
        pass(60);
        timings.end(second, true);
        // One in another tab, three seconds later: a submission in two round trips. A call works in
        // one tab, the first it is told of.
        pass(3000);
        Timings.Running third = timings.begin("browser_submit");
        timings.trip(nanos(20), new Protocol.Timing(15, 0, 0), "s2");
        timings.trip(nanos(70), new Protocol.Timing(60, 0, 40), "s2");
        pass(100);
        timings.end(third, true);
        // And the status tool, which works in no tab, with a round trip that names none.
        pass(500);
        Timings.Running status = timings.begin("browser_status");
        timings.trip(nanos(2), new Protocol.Timing(1, 0, 0), null);
        pass(5);
        assertEquals(null, timings.end(status, true).session());

        var of = timings.sharesBySession();
        assertEquals(java.util.Set.of("s1", "s2"), of.keySet(), "a call that worked in no tab is in none");
        assertEquals(2, of.get("s1").calls());
        assertEquals(1000, of.get("s1").agent(), "the time the agent took before the tab's calls");
        assertEquals(1, of.get("s2").calls());
        assertEquals(3000, of.get("s2").agent());
        assertEquals(40, of.get("s2").user());
        // The whole is every call, the one without a tab included: more than the tabs together.
        Timings.Shares all = timings.shares();
        assertEquals(4, all.calls());
        assertEquals(1000 + 3000 + 500, all.agent());
        assertTrue(all.all() > of.get("s1").all() + of.get("s2").all());
        // What the agent is told has tool names and durations, as before, and no session.
        String report = timings.report();
        assertFalse(report.contains("s1"), report);
        assertFalse(report.contains("s2"), report);
    }

    @Test
    void theSharesForThePanelAreTheSameTimeInFourHeapsWithNothingLostOrCountedTwice() {
        assertEquals(new Timings.Shares(0, 0, 0, 0, 0), timings.shares(), "nothing before a call has ended");

        // A submission: 5 ms waiting in the server, 5 ms of its own work, 10 ms on the way, 10 ms in
        // the tab's queue, 50 ms in the page and 30 ms for the user's answer.
        Timings.Running first = timings.begin("browser_submit");
        timings.waited(nanos(5));
        timings.trip(nanos(100), new Protocol.Timing(80, 10, 30));
        pass(110);
        Timings.Call submit = timings.end(first, true);
        // The agent thinks for two seconds, then reads the page: 40 ms, 4 of them the server's.
        pass(2000);
        Timings.Call read = call("browser_snapshot", 40, 4, new Protocol.Timing(30, 0, 0));

        Timings.Shares shares = timings.shares();
        assertEquals(2, shares.calls());
        assertEquals(2000, shares.agent(), "the time between the calls; before the first one nothing is counted");
        assertEquals(20 + 4 + 6, shares.server(), "the server's own work, its waiting, and the way to the extension and back");
        assertEquals(60 + 30, shares.browser(), "the tab's queue and the page");
        assertEquals(30, shares.user());
        assertEquals(submit.total() + read.total() + 2000, shares.all());
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

    @Test
    void aPauseOfMoreThanAMinuteCountsAsAMinuteInTheSharesAndTheReportSaysSo() {
        call("browser_snapshot", 40, 5, new Protocol.Timing(30, 0, 0));
        pass(4_000);
        call("browser_click", 50, 5, new Protocol.Timing(40, 0, 0));
        // The agent is at something else for nearly six minutes. Counted in full, that pause would be
        // nearly all the time there is, and the shares would say nothing of the calls.
        pass(346_000);
        call("browser_extract", 30, 5, new Protocol.Timing(20, 0, 0));

        Timings.Shares shares = timings.shares();
        assertEquals(4_000 + Timings.PAUSE_COUNTS_MS, shares.agent());
        // Each call's own time is kept beside the sums, the pause at its real length: for what is
        // typical of a call, and what was the longest.
        assertEquals(java.util.List.of(-1L, 4_000L, 346_000L), shares.each().stream().map(Timings.Spent::agent).toList());
        assertEquals(shares.server(), shares.each().stream().mapToLong(Timings.Spent::server).sum());
        assertEquals(shares.browser(), shares.each().stream().mapToLong(Timings.Spent::browser).sum());
        assertEquals(java.util.List.of(30L, 40L, 20L), shares.each().stream().map(Timings.Spent::browser).toList());

        String report = timings.report();
        // The report's share is of the same counted time; the pause's real length is its longest.
        assertTrue(report.contains(" 100%  between calls, with the agent and its model (median 175.0 s, longest 346.0 s)"), report);
        assertTrue(report.contains("Note: 1 pause between calls took more than a minute. In the shares each counts as one minute.\n"),
                report);

        // Without such a pause the report says nothing of it, and a pause counts in full.
        Timings quick = new Timings(clock::get);
        Timings.Running first = quick.begin("browser_snapshot");
        pass(10);
        quick.end(first, true);
        pass(59_000);
        Timings.Running second = quick.begin("browser_click");
        pass(10);
        quick.end(second, true);
        assertEquals(59_000, quick.shares().agent());
        assertFalse(quick.report().contains("more than a minute"), quick.report());
    }
}
