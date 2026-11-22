package browsercontext;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;

/**
 * Concise diagnostics on stderr (stdout is the MCP channel). Level from BCMCP_LOG: debug, info
 * (default), warn or off.
 *
 * <p>Lines carry ids, operation types, durations, outcomes and error categories. They never carry
 * page content, entered text, URLs with their query, cookies, headers or the pairing token.
 *
 * <p>For the server's panel the last lines can be kept in memory ({@link #keep}). What is kept is
 * the line as it is written here and when: nothing that the log does not carry. Without a panel
 * nothing is kept.
 */
final class Log {

    private static final int LEVEL = level(System.getenv("BCMCP_LOG"));

    /** One line as it was logged: when, at which level, and the text. */
    record Line(long at, String level, String text) {
    }

    private static final Deque<Line> KEPT = new ArrayDeque<>();
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

    static void debug(String message) {
        if (LEVEL <= 0) {
            write(message);
            remember("debug", message);
        }
    }

    static void info(String message) {
        if (LEVEL <= 1) {
            write(message);
        }
        remember("info", message);
    }

    static void warn(String message) {
        if (LEVEL <= 2) {
            write(message);
        }
        remember("warn", message);
    }

    /** One line per finished command. Failures and scope violations show at info, the rest at debug. */
    static void command(String id, String session, String action, long millis, String errorCode) {
        StringBuilder line = new StringBuilder("command id=").append(id)
                .append(" session=").append(session == null ? "-" : session)
                .append(" action=").append(action).append(" ms=").append(millis);
        if (errorCode == null) {
            debug(line.append(" outcome=ok").toString());
            return;
        }
        String category = Protocol.category(errorCode);
        line.append(" outcome=error code=").append(errorCode).append(" category=").append(category);
        if (category.equals("SCOPE")) {
            line.append(" scope_violation=true");
        }
        info(line.toString());
    }

    private static void write(String message) {
        System.err.println("[browser-context-mcp] " + message);
    }

    /**
     * Keeps the last {@code lines} lines from now on, for the panel. What is kept is what is logged at
     * info and above whatever BCMCP_LOG says, so that the panel has something to show where the
     * agent's program throws stderr away; debug lines are kept only when they are asked for.
     */
    static synchronized void keep(int lines) {
        keep = Math.max(0, lines);
        trim();
    }

    private static synchronized void remember(String level, String message) {
        if (keep == 0) {
            return;
        }
        KEPT.addLast(new Line(System.currentTimeMillis(), level, message));
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
