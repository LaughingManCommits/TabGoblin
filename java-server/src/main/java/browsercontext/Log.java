package browsercontext;

/**
 * Concise diagnostics on stderr (stdout is the MCP channel). Level from BCMCP_LOG: debug, info
 * (default), warn or off.
 *
 * <p>Lines carry ids, operation types, durations, outcomes and error categories. They never carry
 * page content, entered text, URLs with their query, cookies, headers or the pairing token.
 */
final class Log {

    private static final int LEVEL = level(System.getenv("BCMCP_LOG"));

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
        }
    }

    static void info(String message) {
        if (LEVEL <= 1) {
            write(message);
        }
    }

    static void warn(String message) {
        if (LEVEL <= 2) {
            write(message);
        }
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
}
