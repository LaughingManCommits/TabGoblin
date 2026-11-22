package browsercontext;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * What the server's panel shows at one moment, in the words it shows it in. Read from the same
 * objects the status tool reads; nothing here knows of a window.
 *
 * <p>It is what this server holds, and less: of a session the site, the access level and the
 * state, not the page's title or address, which the status tool gives the agent and the log
 * leaves out. One server is one agent, so there is nothing of other agents in it.
 *
 * <p>{@code byHand} is a server that a person started in a terminal. No agent talks to it, so it
 * never has a tool call, and a tab authorized for it is used by nobody. Its panel is easily taken
 * for the place where an agent's work shows: it says in words that it is not.
 */
record PanelModel(String agent, boolean byHand, String identity, int port, String version, String problem,
        boolean connected, boolean switchedOff, String connection, List<Row> sessions, int tabs, int open, int calls,
        List<Share> times, List<String> log) {

    /**
     * How many sessions the panel lists. The window has a fixed height and must keep room for its
     * controls, so the rest are counted and not listed: the extension's popup lists every tab.
     */
    static final int LISTED = 3;

    /**
     * One session, as the popup lists it: its id, the site, the access level and what state it is
     * in. {@code open} is a tab that the user authorized for any agent and none has used yet. It
     * is listed by every server, and is this one's own only from its agent's first command on.
     */
    record Row(String id, String site, String access, String state, boolean open) {
        /** A session that is this server's own. */
        Row(String id, String site, String access, String state) {
            this(id, site, access, state, false);
        }
    }

    /** One heap of the time of the last tool calls, as a share of all of it. {@code yours} marks the user's own. */
    record Share(String name, int percent, boolean yours) {
    }

    private static final DateTimeFormatter CLOCK = DateTimeFormatter.ofPattern("HH:mm:ss");

    /**
     * Reads everything from the running server.
     *
     * @param byHand a person started this server in a terminal, and no agent talks to it
     */
    static PanelModel of(WebSocketBridge bridge, String startupProblem, boolean byHand) {
        // Asked once, so that the picture agrees with itself. And no tabs without a connection: for a
        // moment after a connection has closed the server still holds what it reported.
        boolean connected = bridge.isExtensionConnected();
        PanelModel model = of(bridge.clientName(), bridge.clientId(), bridge.getPort(), McpMain.version(), startupProblem,
                connected, bridge.isHeld(), bridge.connectedSince(), bridge.lastCloseCode(),
                connected ? bridge.sessions() : List.of(), bridge.timings().shares(), Log.recent(),
                ZoneId.systemDefault());
        return byHand ? model.startedByHand() : model;
    }

    /** The same of a server that a person started in a terminal: no agent talks to it. */
    PanelModel startedByHand() {
        return new PanelModel(agent, true, identity, port, version, problem, connected, switchedOff, connection,
                sessions, tabs, open, calls, times, log);
    }

    static PanelModel of(String agent, String clientId, int port, String version, String problem, boolean connected,
            boolean switchedOff, long connectedSince, int lastCloseCode, List<Protocol.Session> sessions,
            Timings.Shares time, List<Log.Line> log, ZoneId zone) {
        // An agent says its name with its first tool call. Until then it goes by its id, as in the popup.
        boolean named = agent != null && !agent.isBlank();
        return new PanelModel(named ? agent : "Agent " + clientId, false,
                (named ? agent + "  ·  " + clientId : "Agent " + clientId) + "  ·  port " + port,
                port, version, problem, connected, switchedOff,
                connection(connected, switchedOff, connectedSince, lastCloseCode, zone),
                sessions.stream().limit(LISTED).map(PanelModel::row).toList(), sessions.size(),
                (int) sessions.stream().filter(Protocol.Session::unclaimed).count(), time.calls(), shares(time),
                log.stream().map(line -> logLine(line, zone)).toList());
    }

    /** A line of the log as the panel shows it: the time of day, a mark on a warning, and the line as it was logged. */
    static String logLine(Log.Line line, ZoneId zone) {
        return clock(line.at(), zone) + "  " + (line.level().equals("warn") ? "! " : "") + line.text();
    }

    private static Row row(Protocol.Session session) {
        return new Row(session.sessionId(), site(session.origin()), access(session.mode()), session.state(),
                session.unclaimed());
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

    /** One line on the connection to the browser: whether it is there, since when, or why it is not. */
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

    /** How many tabs this agent has, in the popup's words. */
    String sessionsCount() {
        return tabs == 0 ? "no tabs" : tabs == 1 ? "1 tab" : tabs + " tabs";
    }

    /** What is said under the listed sessions when there are more of them; empty when all are listed. */
    String notListed() {
        int more = tabs - sessions.size();
        return more <= 0 ? "" : "and " + more + " more: the extension's popup lists every tab";
    }

    /**
     * What stands under the status line of a server that was started by hand, and is empty for any
     * other: that no agent's work shows here, and where it does show.
     */
    String note() {
        return byHand ? "Started by hand: no agent talks to this server. An agent's tabs and tool calls are in its "
                + "own server's window, which that server shows when it is started with --panel." : "";
    }

    /** What stands in place of the sessions while none is listed. */
    String noSessions() {
        if (!connected) {
            return "Not known while the browser is not connected";
        }
        return byHand ? "No tab is authorized for this server" : "No tab is authorized for this agent";
    }

    /**
     * What is said under the sessions of a server that was started by hand; empty where there is
     * nothing to say. A tab can be authorized for it, and then nobody works in that tab. That is
     * said of its own tabs only: one that is open to any agent is listed here too, and an agent
     * can take it.
     */
    String notUsed() {
        int own = tabs - open;
        if (!byHand || own <= 0) {
            return "";
        }
        String which = own < tabs
                ? (own == 1 ? "the tab that is authorized for this server" : "the tabs that are authorized for this server")
                : own == 1 ? "this tab" : "these tabs";
        return "No agent can use " + which + ": authorize " + (own == 1 ? "it" : "them")
                + " for the agent, in the extension's popup";
    }

    /** What stands in place of the times while there are none to show. */
    String noTimes() {
        return byHand ? "No tool calls: no agent talks to this server" : "No tool call has ended yet";
    }

    /** What the metrics are of: time, and over how many calls it is counted. */
    String callsCount() {
        return calls == 0 ? "" : calls == 1 ? "time of the last call" : "time of the last " + calls + " calls";
    }
}
