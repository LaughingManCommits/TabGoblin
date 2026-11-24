package browsercontext;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Instant;

/**
 * A record on this machine of what agents did, for the user or whoever is answerable for the
 * machine: one line of JSON for each tool call, written to a file beside the settings. It is off
 * unless the settings file asks for it ({@code audit.log = on}).
 *
 * <p>A line has the time, the agent's id, the session, the action, how long it took and how it
 * ended. It has nothing of a page, of an address or of entered text: the same limit as the log.
 * Nothing is sent anywhere. The file is the record and its export: it can be read by any tool
 * that reads JSON lines.
 *
 * <p>The file is kept from growing without end: at five megabytes it becomes
 * {@code audit.1.jsonl}, which replaces the one from before, and a new file is begun.
 */
final class Audit {

    static final String KEY = "audit.log";
    static final String FILE = "audit.jsonl";
    static final long MAX_BYTES = 5L * 1024 * 1024;

    private static volatile Path file;

    private Audit() {
    }

    /** Where the lines go from now on, or null for nowhere. */
    static void to(Path target) {
        Path before = file;
        file = target;
        if (target != null && !target.equals(before)) {
            Log.info("audit log: on");
        } else if (target == null && before != null) {
            Log.info("audit log: off");
        }
    }

    static Path target() {
        return file;
    }

    /** One tool call. Never thrown from: a record that cannot be written must not stop a tool. */
    static synchronized void command(String agent, String session, String action, long millis, String errorCode) {
        Path target = file;
        if (target == null) {
            return;
        }
        String line = "{\"time\":\"" + Instant.now() + "\""
                + ",\"agent\":" + text(agent)
                + ",\"session\":" + text(session)
                + ",\"action\":" + text(action)
                + ",\"ms\":" + Math.max(0, millis)
                + ",\"outcome\":" + text(errorCode == null ? "ok" : errorCode)
                + (errorCode == null ? "" : ",\"category\":" + text(Protocol.category(errorCode)))
                + "}\n";
        try {
            if (Files.exists(target) && Files.size(target) >= MAX_BYTES) {
                Files.move(target, target.resolveSibling("audit.1.jsonl"), StandardCopyOption.REPLACE_EXISTING);
            }
            boolean fresh = !Files.exists(target);
            Files.writeString(target, line, StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
            if (fresh) {
                try {
                    Files.setPosixFilePermissions(target, PosixFilePermissions.fromString("rw-------"));
                } catch (UnsupportedOperationException e) {
                    // Windows: the user's folder is per-user already.
                }
            }
        } catch (IOException | RuntimeException e) {
            // Said once in the log, and the tool goes on.
            file = null;
            Log.warn("audit log: cannot be written, switched off reason=" + e.getClass().getSimpleName());
        }
    }

    /** A value as JSON text. Ids, action names and codes only come here; anything else is made harmless. */
    private static String text(String value) {
        if (value == null) {
            return "null";
        }
        StringBuilder out = new StringBuilder("\"");
        for (char c : value.toCharArray()) {
            if (c == '"' || c == '\\') {
                out.append('\\').append(c);
            } else if (c < 0x20) {
                out.append(' ');
            } else {
                out.append(c);
            }
        }
        return out.append('"').toString();
    }
}
