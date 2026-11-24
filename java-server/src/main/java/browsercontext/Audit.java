package browsercontext;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Instant;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

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

    private static final ObjectMapper JSON = new ObjectMapper();

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
        ObjectNode entry = JSON.createObjectNode();
        entry.put("time", Instant.now().toString());
        entry.put("agent", agent);
        entry.put("session", session);
        entry.put("action", action);
        entry.put("ms", Math.max(0, millis));
        entry.put("outcome", errorCode == null ? "ok" : errorCode);
        if (errorCode != null) {
            entry.put("category", Protocol.category(errorCode));
        }
        // One entry, one line: the library escapes what a value holds.
        String line = JSON.writeValueAsString(entry) + "\n";
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
}
