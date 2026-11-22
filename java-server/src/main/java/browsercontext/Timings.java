package browsercontext;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Deque;
import java.util.List;
import java.util.Locale;
import java.util.function.LongSupplier;
import java.util.function.ToLongFunction;

/**
 * Where the time of the last tool calls went: with the agent between two calls, in this server,
 * on the way to the extension, in the extension and the page, and with the user.
 *
 * <p>Only this server sees all of it. It measures the time between calls, the whole of a call and
 * the round trip to the extension itself. What happened inside the round trip the extension says
 * with each answer. Nothing but tool names, durations and the id of the session a call ran in
 * is kept: no address and nothing of a page. The session is for the server's panel, which shows
 * the times of one tab; the report for the agent has none of it.
 */
final class Timings {

    /** Calls kept for the report. */
    static final int KEPT = 200;
    /** Calls the report lists one by one. */
    static final int LISTED = 10;

    /**
     * One finished tool call, in milliseconds. A gap of -1 means that no call came before it.
     * {@code split} says that the extension gave its numbers for every round trip of the call.
     * {@code session} is the tab the call worked in, or null for a call that worked in none: the
     * status tool, or a call that was refused before a session was found.
     */
    record Call(String tool, long gap, long total, long waited, long trip, long ran, long queued, long asked,
            boolean split, boolean ok, String session) {

        /** This server's own work: what is left of the call after the waiting and the round trips. */
        long server() {
            return Math.max(0, total - waited - trip);
        }

        /** Between this server and the extension, both ways. */
        long way() {
            return split ? Math.max(0, trip - ran - queued) : 0;
        }

        /** Behind another command for the same tab. */
        long queue() {
            return split ? queued : 0;
        }

        /** The extension and the page at work. Without numbers from the extension, the whole round trip. */
        long browser() {
            return split ? Math.max(0, ran - asked) : trip;
        }

        /** The user, answering a question in the popup. */
        long user() {
            return split ? Math.min(asked, ran) : 0;
        }
    }

    /** A tool call that is running on the current thread. */
    static final class Running {
        private final String tool;
        private final long begun;
        private final long gap;
        private long waited;
        private long trip;
        private long ran;
        private long queued;
        private long asked;
        private boolean split = true;
        private String session;

        private Running(String tool, long begun, long gap) {
            this.tool = tool;
            this.begun = begun;
            this.gap = gap;
        }
    }

    /** A part of a call: its name in the summary, its name in the list of calls, and how to read it. */
    private record Part(String name, String brief, ToLongFunction<Call> of) {
    }

    /** In the order in which a call passes through them. */
    private static final List<Part> PARTS = List.of(
            new Part("in this server", "server", Call::server),
            new Part("waiting to send: for the extension to connect, or for another call on the same session",
                    "waiting to send", Call::waited),
            new Part("between this server and the extension", "on the way", Call::way),
            new Part("waiting for its turn in the tab's queue", "tab's queue", Call::queue),
            new Part("in the extension and the page", "extension and page", Call::browser),
            new Part("waiting for the user's answer", "user", Call::user));

    private final LongSupplier nanos;
    private final ThreadLocal<Running> current = new ThreadLocal<>();
    private final Deque<Call> calls = new ArrayDeque<>();
    private int running;
    private boolean ended;
    private long lastEnd;

    /** The log of the agent whose calls these are. */
    private final Log.Scope log;

    Timings() {
        this(System::nanoTime);
    }

    Timings(Log.Scope log) {
        this(System::nanoTime, log);
    }

    Timings(LongSupplier nanos) {
        this(nanos, Log.of(null));
    }

    private Timings(LongSupplier nanos, Log.Scope log) {
        this.nanos = nanos;
        this.log = log;
    }

    /** A tool call begins on this thread. What came since the last answer was the agent's time. */
    Running begin(String tool) {
        long now = nanos.getAsLong();
        long gap;
        synchronized (this) {
            // While another call runs the agent is not thinking: it sent several calls at once.
            gap = running > 0 ? 0 : ended ? Math.max(0, now - lastEnd) : -1;
            running++;
        }
        Running call = new Running(tool, now, gap);
        current.set(call);
        return call;
    }

    /** Time the call on this thread spent before its command could be sent. */
    void waited(long duration) {
        Running call = current.get();
        if (call != null) {
            call.waited += Math.max(0, duration);
        }
    }

    /** One round trip to the extension, and what the extension says happened inside it, if it says. */
    void trip(long duration, Protocol.Timing inside) {
        trip(duration, inside, null);
    }

    /** The same, with the session the command ran in, if it ran in one. A call works in one tab: its first. */
    void trip(long duration, Protocol.Timing inside, String session) {
        Running call = current.get();
        if (call == null) {
            return;
        }
        if (call.session == null) {
            call.session = session;
        }
        call.trip += Math.max(0, duration);
        if (inside != null) {
            call.ran += inside.ran();
            call.queued += inside.queued();
            call.asked += inside.asked();
        } else if (millis(duration) > 0) {
            // An older extension, or no answer at all: this round trip cannot be taken apart.
            call.split = false;
        }
    }

    /** The call ends: it is kept for the report and written to the log. */
    Call end(Running call, boolean ok) {
        long now = nanos.getAsLong();
        current.remove();
        Call done = new Call(call.tool, call.gap < 0 ? -1 : millis(call.gap), millis(now - call.begun),
                millis(call.waited), millis(call.trip), call.ran, call.queued, call.asked, call.split, ok, call.session);
        synchronized (this) {
            running--;
            ended = true;
            lastEnd = now;
            calls.addLast(done);
            while (calls.size() > KEPT) {
                calls.removeFirst();
            }
        }
        log.debug(logLine(done));
        return done;
    }

    /**
     * Where the time of the kept calls went, in the four heaps a person looks for, in milliseconds:
     * the agent between its calls, this server with the way to the extension, the browser, and the
     * user. The panel draws them; the report below has every part on its own.
     */
    record Shares(int calls, long agent, long server, long browser, long user) {
        long all() {
            return agent + server + browser + user;
        }
    }

    synchronized Shares shares() {
        return shares(calls);
    }

    /**
     * The same for each session that a kept call worked in, by the session's id: the calls of that
     * tab alone, with the time the agent took before each of them. Calls that worked in no tab
     * are in none of them.
     */
    synchronized java.util.Map<String, Shares> sharesBySession() {
        java.util.Map<String, List<Call>> of = new java.util.TreeMap<>();
        for (Call call : calls) {
            if (call.session() != null) {
                of.computeIfAbsent(call.session(), id -> new ArrayList<>()).add(call);
            }
        }
        java.util.Map<String, Shares> shares = new java.util.TreeMap<>();
        of.forEach((id, its) -> shares.put(id, shares(its)));
        return shares;
    }

    private static Shares shares(java.util.Collection<Call> calls) {
        long agent = 0;
        long server = 0;
        long browser = 0;
        long user = 0;
        for (Call call : calls) {
            agent += Math.max(0, call.gap());
            server += call.server() + call.waited() + call.way();
            browser += call.queue() + call.browser();
            user += call.user();
        }
        return new Shares(calls.size(), agent, server, browser, user);
    }

    /** The report for the status tool. Empty while no call has ended. */
    String report() {
        List<Call> all;
        synchronized (this) {
            all = new ArrayList<>(calls);
        }
        if (all.isEmpty()) {
            return "";
        }
        long[] gaps = all.stream().mapToLong(Call::gap).filter(gap -> gap >= 0).toArray();
        long everything = Arrays.stream(gaps).sum();
        for (Part part : PARTS) {
            everything += all.stream().mapToLong(part.of()).sum();
        }
        StringBuilder sb = new StringBuilder();
        sb.append("Where the time went, over the last ").append(all.size())
                .append(all.size() == 1 ? " tool call" : " tool calls")
                .append(" (share of all the time; median and longest per call):\n");
        summarize(sb, everything, "between calls, with the agent and its model", gaps);
        for (Part part : PARTS) {
            summarize(sb, everything, part.name(), all.stream().mapToLong(part.of()).toArray());
        }
        sb.append("Last calls, newest last (the whole call; what the agent took before it; the call's parts, ")
                .append("largest first):\n");
        for (Call call : all.subList(Math.max(0, all.size() - LISTED), all.size())) {
            sb.append("  ").append(describe(call)).append('\n');
        }
        long unsplit = all.stream().filter(call -> !call.split()).count();
        if (unsplit > 0) {
            sb.append("Note: ").append(unsplit).append(unsplit == 1 ? " call" : " calls")
                    .append(" got no times from the extension. Their whole round trip is counted under the ")
                    .append("extension and the page.\n");
        }
        sb.append("Note: the time between calls is the agent's program as well as its model, and any approval ")
                .append("the user gives there.\n");
        return sb.toString();
    }

    private static void summarize(StringBuilder sb, long everything, String name, long[] values) {
        if (values.length == 0) {
            sb.append("     -  ").append(name).append(" (not known: no call came before)\n");
            return;
        }
        long[] sorted = values.clone();
        Arrays.sort(sorted);
        int n = sorted.length;
        long median = n % 2 == 1 ? sorted[n / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
        long share = everything == 0 ? 0 : Math.round(100.0 * Arrays.stream(sorted).sum() / everything);
        sb.append(String.format(Locale.ROOT, "  %3d%%  %s (median %s, longest %s)\n",
                share, name, show(median), show(sorted[n - 1])));
    }

    private static String describe(Call call) {
        StringBuilder sb = new StringBuilder(call.tool()).append(' ').append(show(call.total()));
        sb.append(call.gap() < 0 ? " (first call)" : " (agent before it: " + show(call.gap()) + ")");
        List<String> parts = PARTS.stream()
                .filter(part -> part.of().applyAsLong(call) > 0)
                .sorted(Comparator.comparingLong((Part part) -> part.of().applyAsLong(call)).reversed())
                .map(part -> part.brief() + " " + show(part.of().applyAsLong(call)))
                .toList();
        if (!parts.isEmpty()) {
            sb.append(": ").append(String.join(", ", parts));
        }
        if (!call.ok()) {
            sb.append(" [failed]");
        }
        return sb.toString();
    }

    private static String logLine(Call call) {
        StringBuilder line = new StringBuilder("call tool=").append(call.tool())
                .append(" ms=").append(call.total()).append(" gap=").append(call.gap())
                .append(" waited=").append(call.waited()).append(" trip=").append(call.trip());
        if (call.split()) {
            line.append(" ran=").append(call.ran()).append(" queued=").append(call.queued())
                    .append(" asked=").append(call.asked());
        }
        return line.append(" outcome=").append(call.ok() ? "ok" : "error").toString();
    }

    private static String show(long ms) {
        return ms < 1000 ? ms + " ms" : String.format(Locale.ROOT, "%.1f s", ms / 1000.0);
    }

    private static long millis(long duration) {
        return Math.round(duration / 1e6);
    }
}
