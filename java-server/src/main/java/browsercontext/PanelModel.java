package browsercontext;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What the server's panel shows at one moment, in the words it shows it in. Read from the same
 * objects the status tool reads; nothing here knows of a window.
 *
 * <p>It is what the server holds, and less: of a session the site, the access level and the
 * state, not the page's title or address, which the status tool gives the agent and the log
 * leaves out.
 *
 * <p>One server has every agent that is connected to it, and the panel is the user's: it shows
 * all of them. With one agent it shows that agent as it always did. With several, each agent has
 * a heading over its tabs. With none it says so: a server that the user started waits for its
 * first agent.
 *
 * <p>The metrics and the log are there for everything together, for each agent and for each tab
 * alone: the window shows one agent's or one tab's when the user has clicked it, and everything
 * otherwise. What is chosen is the window's own affair and is in no model.
 */
record PanelModel(String agent, String identity, int port, String version, String problem,
        boolean connected, boolean switchedOff, String connection, List<Member> agents, List<Row> sessions, int tabs,
        int open, Metrics metrics, Map<String, Metrics> metricsOf, List<Entry> entries) {

    /** One agent as the server holds it: what the model is made from. */
    record Facts(String name, String id, int port, String problem, boolean connected, long connectedSince,
            int lastCloseCode, List<Protocol.Session> sessions, Timings.Shares time, Map<String, Timings.Shares> timeOf) {
    }

    /**
     * One agent in the panel: its name, or how it goes without one; its id and its port; whether
     * the extension is connected to it, and the sentence that says so; and how many tabs it has.
     */
    record Member(String id, String name, int port, boolean connected, String connection, int tabs) {
    }

    /**
     * One session, as the popup lists it: its id, the site, the access level and what state it is
     * in. {@code open} is a tab that the user authorized for any agent and none has used yet. It
     * is listed under every agent, and is one agent's own only from that agent's first command on.
     * {@code owner} is the id of the agent it is listed under.
     */
    record Row(String id, String site, String access, String state, boolean open, String owner) {
        /** A session that is its agent's own, where the agent does not matter. */
        Row(String id, String site, String access, String state) {
            this(id, site, access, state, false, null);
        }

        Row(String id, String site, String access, String state, boolean open) {
            this(id, site, access, state, open, null);
        }
    }

    /** One heap of the time of the last tool calls, as a share of all of it. {@code yours} marks the user's own. */
    record Share(String name, int percent, boolean yours) {
    }

    /**
     * Where the time of some calls went: how many calls, and the shares. The shares are of all
     * the time of those calls together, not a mean of anything.
     */
    record Metrics(int calls, List<Share> shares) {
        static final Metrics NONE = new Metrics(0, List.of());
    }

    /**
     * One line of the log as it is shown; the session of the command it is the line of, if it is
     * one; and the agent it belongs to, if it is an agent's.
     */
    record Entry(String text, String session, String agent) {
        Entry(String text, String session) {
            this(text, session, null);
        }
    }

    private static final DateTimeFormatter CLOCK = DateTimeFormatter.ofPattern("HH:mm:ss");
    private static final Timings.Shares NO_TIME = new Timings.Shares(0, 0, 0, 0, 0);

    /** What the server holds of one agent, read from that agent's own objects. */
    static Facts facts(WebSocketBridge bridge, String startupProblem) {
        // Asked once, so that the picture agrees with itself. And no tabs without a connection: for a
        // moment after a connection has closed the server still holds what it reported.
        boolean connected = bridge.isExtensionConnected();
        return new Facts(bridge.clientName(), bridge.clientId(), bridge.getPort(), startupProblem, connected,
                bridge.connectedSince(), bridge.lastCloseCode(), connected ? bridge.sessions() : List.of(),
                bridge.timings().shares(), bridge.timings().sharesBySession());
    }

    /** Reads everything from a running server that has one agent: a process that serves its agent alone. */
    static PanelModel of(WebSocketBridge bridge, String startupProblem) {
        return of(List.of(facts(bridge, startupProblem)), bridge.getPort(), McpMain.version(), bridge.isHeld(), Log.recent(),
                ZoneId.systemDefault());
    }

    /** One agent, without times of single tabs: where only the whole is known, or looked at. */
    static PanelModel of(String agent, String clientId, int port, String version, String problem, boolean connected,
            boolean switchedOff, long connectedSince, int lastCloseCode, List<Protocol.Session> sessions,
            Timings.Shares time, List<Log.Line> log, ZoneId zone) {
        return of(agent, clientId, port, version, problem, connected, switchedOff, connectedSince, lastCloseCode, sessions,
                time, Map.of(), log, zone);
    }

    /** One agent. */
    static PanelModel of(String agent, String clientId, int port, String version, String problem, boolean connected,
            boolean switchedOff, long connectedSince, int lastCloseCode, List<Protocol.Session> sessions,
            Timings.Shares time, Map<String, Timings.Shares> timeOf, List<Log.Line> log, ZoneId zone) {
        return of(List.of(new Facts(agent, clientId, port, problem, connected, connectedSince, lastCloseCode, sessions, time,
                timeOf)), port, version, switchedOff, log, zone);
    }

    /**
     * Every agent of a server, in the order they came.
     *
     * @param port the port to place the window by: the first agent's, or the server's own
     */
    static PanelModel of(List<Facts> agents, int port, String version, boolean switchedOff, List<Log.Line> log, ZoneId zone) {
        List<Member> members = new ArrayList<>();
        List<Row> rows = new ArrayList<>();
        Map<String, Metrics> metricsOf = new LinkedHashMap<>();
        Timings.Shares all = NO_TIME;
        String problem = null;
        int open = 0;
        for (Facts facts : agents) {
            // An agent says its name when it opens its connection. Until then it goes by its id, as in the popup.
            boolean named = facts.name() != null && !facts.name().isBlank();
            members.add(new Member(facts.id(), named ? facts.name() : "Agent " + facts.id(), facts.port(), facts.connected(),
                    connection(facts.connected(), switchedOff, facts.connectedSince(), facts.lastCloseCode(), zone),
                    facts.sessions().size()));
            for (Protocol.Session session : facts.sessions()) {
                rows.add(new Row(session.sessionId(), site(session.origin()), access(session.mode()), session.state(),
                        session.unclaimed(), facts.id()));
                open += session.unclaimed() ? 1 : 0;
            }
            all = plus(all, facts.time());
            metricsOf.put(facts.id(), new Metrics(facts.time().calls(), shares(facts.time())));
            facts.timeOf().forEach((tab, time) -> metricsOf.put(tab, new Metrics(time.calls(), shares(time))));
            if (problem == null) {
                problem = facts.problem();
            }
        }
        Member only = members.size() == 1 ? members.get(0) : null;
        boolean named = only != null && !only.name().equals("Agent " + only.id());
        String title = only != null ? only.name() : members.isEmpty() ? "no agent" : members.size() + " agents";
        String identity = only != null
                ? (named ? only.name() + "  ·  " + only.id() : only.name()) + "  ·  port " + only.port()
                // With no agent there is nobody to name: the line says what this window is. That no agent
                // is connected is said once, in the line with the dot.
                : members.isEmpty() ? "one server for all your agents" : members.size() + " agents";
        return new PanelModel(title, identity, port, version, problem,
                !members.isEmpty() && members.stream().allMatch(Member::connected), switchedOff,
                only != null ? only.connection() : connection(members, switchedOff),
                List.copyOf(members), List.copyOf(rows), rows.size(), open,
                new Metrics(all.calls(), shares(all)), Map.copyOf(metricsOf),
                log.stream().map(line -> new Entry(logLine(line, zone), line.session(), line.agent())).toList());
    }

    private static Timings.Shares plus(Timings.Shares a, Timings.Shares b) {
        return new Timings.Shares(a.calls() + b.calls(), a.agent() + b.agent(), a.server() + b.server(),
                a.browser() + b.browser(), a.user() + b.user());
    }

    /** A line of the log as the panel shows it: the time of day, a mark on a warning, and the line as it was logged. */
    static String logLine(Log.Line line, ZoneId zone) {
        return clock(line.at(), zone) + "  " + (line.level().equals("warn") ? "! " : "") + line.text();
    }

    /** The site as the popup shows it: without the scheme when that is https. */
    static String site(String origin) {
        return origin.startsWith("https://") ? origin.substring("https://".length()) : origin;
    }

    /** The access level in the popup's words. */
    static String access(String mode) {
        return switch (mode) {
            case "write" -> "Read / Write";
            case "explore" -> "Explore";
            default -> "Read";
        };
    }

    /** One line on one agent's connection to the browser: whether it is there, since when, or why it is not. */
    static String connection(boolean connected, boolean switchedOff, long since, int lastCloseCode, ZoneId zone) {
        if (connected) {
            return "Connected to the browser since " + clock(since, zone);
        }
        if (switchedOff) {
            return "Switched off here: the extension is not let in";
        }
        return switch (lastCloseCode) {
            case Protocol.CLOSE_USER_DISCONNECTED -> "Not connected: disconnected in the extension's popup";
            case Protocol.CLOSE_UNAUTHORIZED -> "Not connected: the pairing has ended";
            case Protocol.CLOSE_VERSION -> "Not connected: the extension is of another version";
            default -> "Not connected: waiting for the extension";
        };
    }

    /** The same for no agent, or for several: how many of them the extension is connected to. */
    static String connection(List<Member> agents, boolean switchedOff) {
        if (switchedOff) {
            return "Switched off here: the extension is not let in";
        }
        if (agents.isEmpty()) {
            return "No agent connected";
        }
        long connected = agents.stream().filter(Member::connected).count();
        if (connected == agents.size()) {
            return (agents.size() == 2 ? "Both agents" : "All " + agents.size() + " agents") + " are connected to the browser";
        }
        return connected == 0 ? "No agent is connected to the browser"
                : connected + " of " + agents.size() + " agents " + (connected == 1 ? "is" : "are") + " connected to the browser";
    }

    /**
     * Where the time went, as whole percents of all of it, the four heaps in the order a call
     * passes through them. Empty while no call has ended, or while none of them took any time.
     */
    static List<Share> shares(Timings.Shares time) {
        long all = time.all();
        if (time.calls() == 0 || all == 0) {
            return List.of();
        }
        return List.of(
                new Share("Agent and its model", percent(time.agent(), all), false),
                new Share("This server", percent(time.server(), all), false),
                new Share("Extension and page", percent(time.browser(), all), false),
                new Share("Waiting for you", percent(time.user(), all), true));
    }

    private static int percent(long part, long all) {
        return (int) Math.round(100.0 * part / all);
    }

    /** The time of day of a moment, as the log's lines show it. */
    static String clock(long at, ZoneId zone) {
        return CLOCK.format(Instant.ofEpochMilli(at).atZone(zone));
    }

    /** How many calls the metrics of everything are counted over. */
    int calls() {
        return metrics.calls();
    }

    /** The shares of everything together. */
    List<Share> times() {
        return metrics.shares();
    }

    /** Every line of the log. */
    List<String> log() {
        return entries.stream().map(Entry::text).toList();
    }

    /** Whether what is chosen is an agent, and not a tab. */
    private boolean isAgent(String chosen) {
        return agents.stream().anyMatch(member -> member.id().equals(chosen));
    }

    /** The agent with that id, as the panel names it; or the id itself for a tab. */
    String named(String chosen) {
        return agents.stream().filter(member -> member.id().equals(chosen)).map(Member::name).findFirst().orElse(chosen);
    }

    /** The metrics of one tab or one agent, or of everything when nothing is chosen. A tab without a call has none. */
    Metrics metrics(String chosen) {
        return chosen == null ? metrics : metricsOf.getOrDefault(chosen, Metrics.NONE);
    }

    /** The lines of one tab's commands, or of one agent, or every line when nothing is chosen. */
    List<String> log(String chosen) {
        if (chosen == null) {
            return log();
        }
        boolean agent = isAgent(chosen);
        return entries.stream().filter(entry -> chosen.equals(agent ? entry.agent() : entry.session())).map(Entry::text).toList();
    }

    /** Whether a tab or an agent of that id is listed: one that was chosen and has gone is chosen no more. */
    boolean has(String chosen) {
        return isAgent(chosen) || sessions.stream().anyMatch(row -> row.id().equals(chosen));
    }

    /**
     * How many tabs there are, in the popup's words; with several agents, how many agents as well.
     * Nothing while there is no tab: the card says that in the tabs' place, and once is enough.
     */
    String sessionsCount() {
        String count = tabs == 0 ? "" : tabs == 1 ? "1 tab" : tabs + " tabs";
        if (agents.size() <= 1) {
            return count;
        }
        return agents.size() + " agents" + (count.isEmpty() ? "" : "  ·  " + count);
    }

    /** What stands in the corner of the sessions' card while one is chosen: which, and how to get back. */
    String chosenNote(String chosen) {
        return chosen == null ? "" : "showing " + named(chosen) + " only  ·  click again for all";
    }

    /**
     * What stands under the status line of a server that has no agent, and is empty for any other:
     * what the user does to have one. The line above says that there is none; this does not say it again.
     */
    String note() {
        return agents.isEmpty() ? "Start your agent (IDE or CLI): it connects by itself." : "";
    }

    /** What stands in place of the sessions while none is listed. */
    String noSessions() {
        if (agents.isEmpty()) {
            return "No tabs";
        }
        return noSessions(agents.get(0));
    }

    /** What stands in place of one agent's sessions while it has none. */
    static String noSessions(Member agent) {
        return agent.connected() ? "No tab is authorized for this agent" : "Not known while the browser is not connected";
    }

    /** What stands in place of the times while there are none to show. */
    String noTimes() {
        return noTimes(null);
    }

    /** The same for one tab or one agent, or for everything when nothing is chosen. */
    String noTimes(String chosen) {
        if (agents.isEmpty()) {
            return "No calls yet";
        }
        return chosen == null ? "No tool call has ended yet"
                : isAgent(chosen) ? "No tool call of this agent has ended yet" : "No tool call has ended in this tab yet";
    }

    /** What the metrics are of: time, and over how many calls it is counted. */
    String callsCount() {
        return callsCount(null);
    }

    /** The same for one tab or one agent, named in front, or for everything when nothing is chosen. */
    String callsCount(String chosen) {
        int calls = metrics(chosen).calls();
        String of = calls == 0 ? "" : calls == 1 ? "time of the last call" : "time of the last " + calls + " calls";
        return chosen == null ? of : of.isEmpty() ? named(chosen) : named(chosen) + "  ·  " + of;
    }

    /** What the log shows: the last lines that are kept, or one tab's or one agent's among them. */
    String logCount(String chosen, int kept) {
        if (chosen == null) {
            return "the last " + kept + " lines";
        }
        int lines = log(chosen).size();
        return named(chosen) + "  ·  " + (lines == 0 ? "none" : lines) + " of the last " + kept + " lines";
    }

    /** What stands in place of the log while it has no line to show. */
    String noLog(String chosen) {
        return chosen == null ? "Nothing logged yet."
                : isAgent(chosen) ? "No line of this agent among the lines that are kept."
                : "No call in this tab among the lines that are kept.";
    }
}
