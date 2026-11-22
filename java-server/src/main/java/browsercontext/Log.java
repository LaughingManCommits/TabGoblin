package browsercontext;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.BiConsumer;

/**
 * Concise diagnostics on stderr (stdout is the MCP channel). Level from BCMCP_LOG: debug, info
 * (default), warn or off.
 *
 * <p>Lines carry ids, operation types, durations, outcomes and error categories. They never carry
 * page content, entered text, URLs with their query, cookies, headers or the pairing token.
 *
 * <p>For the server's panel the last lines can be kept in memory ({@link #keep}). What is kept is
 * the line as it is written here and when: nothing that the log does not carry. That includes
 * one line for each call that went through, which is written only at debug, so that the panel
 * shows what the agent did. Without a panel nothing is kept.
 *
 * <p>One server has several agents. A line that is one agent's is logged through that agent's
 * {@link Scope} and carries the agent's id: the panel shows one agent's lines by it, and the line
 * goes to that agent's own log and to no other agent's ({@link #written}).
 */
final class Log {

    private static final int LEVEL = level(System.getenv("BCMCP_LOG"));

    /**
     * One line as it was logged: when, at which level, and the text. {@code session} is the tab a
     * command ran in, for the line of that command, and null for every other line. {@code agent}
     * is the id of the agent the line belongs to, or null for a line of the server itself.
     */
    record Line(long at, String level, String text, String session, String agent) {
        /** A line that belongs to no session and to no agent. */
        Line(long at, String level, String text) {
            this(at, level, text, null, null);
        }

        /** The line of a command, where the agent does not matter. */
        Line(long at, String level, String text, String session) {
            this(at, level, text, session, null);
        }
    }

    /** The log of one agent: what is logged through it carries the agent's id. */
    static final class Scope {
        private final String agent;

        private Scope(String agent) {
            this.agent = agent;
        }

        void debug(String message) {
            emit(0, "debug", message, null, agent, false);
        }

        void info(String message) {
            emit(1, "info", message, null, agent, true);
        }

        void warn(String message) {
            emit(2, "warn", message, null, agent, true);
        }

        /** One line per finished command. Failures and scope violations show at info, the rest at debug. */
        void command(String id, String session, String action, long millis, String errorCode) {
            Log.command(agent, id, session, action, millis, errorCode);
        }
    }

    /** The lines that are not one agent's: the server's own. */
    private static final Scope SERVER = new Scope(null);

    private static final Deque<Line> KEPT = new ArrayDeque<>();
    /** Told every line that is written, with the agent it belongs to or null: for an agent's own log. */
    private static final List<BiConsumer<String, String>> WRITTEN = new CopyOnWriteArrayList<>();
    /** How many lines are kept; 0 while nothing asked for them. */
    private static int keep;
    /** Counts every line that was kept, so that a reader knows cheaply whether anything is new. */
    private static long count;

    private Log() {
    }

    private static int level(String name) {
        if (name == null) {
            return 1;
        }
        return switch (name.trim().toLowerCase()) {
            case "debug" -> 0;
            case "warn" -> 2;
            case "off", "none" -> 3;
            default -> 1;
        };
    }

    /** The log of the agent with that id. */
    static Scope of(String agent) {
        return new Scope(agent);
    }

    static void debug(String message) {
        SERVER.debug(message);
    }

    static void info(String message) {
        SERVER.info(message);
    }

    static void warn(String message) {
        SERVER.warn(message);
    }

    /** The line of a command where no agent is told apart: a server with one agent, and tests. */
    static void command(String id, String session, String action, long millis, String errorCode) {
        command(null, id, session, action, millis, errorCode);
    }

    private static void command(String agent, String id, String session, String action, long millis, String errorCode) {
        StringBuilder line = new StringBuilder("command id=").append(id)
                .append(" session=").append(session == null ? "-" : session)
                .append(" action=").append(action).append(" ms=").append(millis);
        if (errorCode == null) {
            // Written at debug only: a line for every call is too much for an agent's log of the
            // server. Kept for the panel all the same, which is where the user looks for what the
            // agent did: without it the panel's log has the calls that failed and none that worked.
            emit(0, "debug", line.append(" outcome=ok").toString(), session, agent, true);
            return;
        }
        String category = Protocol.category(errorCode);
        line.append(" outcome=error code=").append(errorCode).append(" category=").append(category);
        if (category.equals("SCOPE")) {
            line.append(" scope_violation=true");
        }
        emit(1, "info", line.toString(), session, agent, true);
    }

    /**
     * One line: written if the level asks for it, and kept for the panel if it is written or if it
     * is kept whatever the level says.
     */
    private static void emit(int level, String name, String message, String session, String agent, boolean keepAnyway) {
        boolean written = LEVEL <= level;
        if (written) {
            System.err.println("[browser-context-mcp] " + message);
            for (BiConsumer<String, String> to : WRITTEN) {
                to.accept(agent, message);
            }
        }
        if (written || keepAnyway) {
            remember(name, message, session, agent);
        }
    }

    /**
     * Has every line that is written from now on handed to {@code to} as well, with the id of the
     * agent it belongs to, or null for a line of the server itself. The one server has no log of
     * its own that anybody reads: each agent's program keeps the log of the process it started,
     * and that is where an agent's lines have to go.
     */
    static void written(BiConsumer<String, String> to) {
        WRITTEN.add(to);
    }

    /** No longer hands the lines to {@code to}. */
    static void unwritten(BiConsumer<String, String> to) {
        WRITTEN.remove(to);
    }

    /**
     * Keeps the last {@code lines} lines from now on, for the panel. What is kept is what is logged at
     * info and above whatever BCMCP_LOG says, so that the panel has something to show where the
     * agent's program throws stderr away, and the line of each finished call. Other debug lines
     * are kept only when they are asked for.
     */
    static synchronized void keep(int lines) {
        keep = Math.max(0, lines);
        trim();
    }

    private static synchronized void remember(String level, String message, String session, String agent) {
        if (keep == 0) {
            return;
        }
        KEPT.addLast(new Line(System.currentTimeMillis(), level, message, session, agent));
        count++;
        trim();
    }

    private static void trim() {
        while (KEPT.size() > keep) {
            KEPT.removeFirst();
        }
    }

    /** The lines that are kept, oldest first. */
    static synchronized List<Line> recent() {
        return List.copyOf(KEPT);
    }

    /** How many lines were kept so far, the dropped ones included. */
    static synchronized long count() {
        return count;
    }
}
