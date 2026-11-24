package browsercontext;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.nio.file.attribute.PosixFilePermissions;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.stream.Stream;

/**
 * Who an agent is: a key of its own, kept in a file, and the id that follows from it.
 *
 * <p>An agent's program names its agent with {@code --agent <label>}. The label picks a key file
 * in the folder {@code agents} beside the pairing token; the key is made at the agent's first
 * start. The process the agent starts proves to the server that it holds the key, and the server
 * gives the agent the id that the key has. So an agent that is started again is the same agent
 * to the extension, by what it holds and not by what it calls itself.
 *
 * <p>The key is not the pairing token, and the extension never holds it. Rotating the token
 * leaves every agent who it was; revoking one agent leaves the token and the other agents alone.
 *
 * <p>Where it stops: the keys have the protection of the user's home folder and no other, as the
 * pairing token has. A program that runs as the user can read one and be that agent.
 */
final class AgentKeys {

    /** What an agent is to a server: its id, the label of its key if it has one, and whether that label is revoked. */
    record Identity(String id, String label, boolean persistent, java.util.function.BooleanSupplier revoked) {

        /** An agent without a key: an id for this start, and nothing that comes back to it after. */
        static Identity ephemeral() {
            return new Identity("c-" + Pairing.randomHex(4), null, false, () -> false);
        }

        /** An agent whose label the user revoked: it is served, and every tool says so. */
        static Identity revoked(Path folder, String label) {
            return new Identity("c-" + Pairing.randomHex(4), label, false, () -> AgentKeys.revoked(folder, label));
        }
    }

    private static final String KEY = ".key";
    private static final String REVOKED = ".revoked";

    private AgentKeys() {
    }

    /** The folder of the agents' keys: beside the pairing token that is in use. */
    static Path folder(Path tokenFile) {
        Path beside = tokenFile.toAbsolutePath().getParent();
        return (beside == null ? Path.of(".") : beside).resolve("agents");
    }

    /** A label as it is used for a file name, or null if it is none: lower case letters, digits, dot, dash and underscore. */
    static String label(String given) {
        if (given == null) {
            return null;
        }
        String label = given.trim().toLowerCase(Locale.ROOT);
        return label.matches("[a-z0-9][a-z0-9._-]{0,39}") && !label.contains("..") ? label : null;
    }

    /** The key of a label, made at its first use. Nothing is made for a label that is revoked. */
    static String loadOrCreate(Path folder, String label) throws IOException {
        Path file = folder.resolve(label + KEY);
        String key = read(file);
        if (!key.isEmpty()) {
            return key;
        }
        Files.createDirectories(folder);
        try {
            folderForOwnerOnly(folder);
            String fresh = Pairing.randomHex(32);
            // Made only if it is not there: of two processes that start at once, one makes it and the other reads it.
            Files.writeString(file, fresh, StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
            try {
                Files.setPosixFilePermissions(file, PosixFilePermissions.fromString("rw-------"));
            } catch (UnsupportedOperationException e) {
                // Windows: the file inherits the user-profile ACL, which is already per-user.
            }
            return fresh;
        } catch (FileAlreadyExistsException e) {
            // The other process may still be writing it.
            for (int i = 0; i < 20; i++) {
                key = read(file);
                if (!key.isEmpty()) {
                    return key;
                }
                try {
                    Thread.sleep(25);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
            throw new IOException("The agent's key file cannot be read.");
        }
    }

    private static void folderForOwnerOnly(Path folder) throws IOException {
        try {
            Files.setPosixFilePermissions(folder, PosixFilePermissions.fromString("rwx------"));
        } catch (UnsupportedOperationException e) {
            // Windows: per-user already.
        }
    }

    /** The key that is in the file of a label, or nothing if there is none. */
    static String read(Path folder, String label) {
        return read(folder.resolve(label + KEY));
    }

    private static String read(Path file) {
        try {
            String key = Files.readString(file, StandardCharsets.UTF_8).trim();
            return key.matches("[0-9a-f]{64}") ? key : "";
        } catch (IOException e) {
            return "";
        }
    }

    /** Whether the user revoked this label. */
    static boolean revoked(Path folder, String label) {
        return Files.exists(folder.resolve(label + REVOKED));
    }

    /**
     * Revokes a label: its key is deleted, so that the id it had is nobody's any more, and a mark
     * is left, so that no new key is made for the label until the user allows it again.
     */
    static void revoke(Path folder, String label) throws IOException {
        Files.createDirectories(folder);
        Path mark = folder.resolve(label + REVOKED);
        if (!Files.exists(mark)) {
            Files.writeString(mark, "", StandardCharsets.UTF_8);
        }
        Files.deleteIfExists(folder.resolve(label + KEY));
    }

    /** Takes the mark off a label. Its next start makes a new key: a new agent, with no tab. Says whether there was a mark. */
    static boolean allow(Path folder, String label) throws IOException {
        return Files.deleteIfExists(folder.resolve(label + REVOKED));
    }

    /** Every label that has a key or is revoked, in order, each with its id or the word revoked. */
    static List<String> list(Path folder) {
        List<String> lines = new ArrayList<>();
        try (Stream<Path> files = Files.list(folder)) {
            for (Path file : files.sorted().toList()) {
                String name = file.getFileName().toString();
                if (name.endsWith(REVOKED)) {
                    lines.add(name.substring(0, name.length() - REVOKED.length()) + "  revoked");
                } else if (name.endsWith(KEY)) {
                    String label = name.substring(0, name.length() - KEY.length());
                    String key = read(file);
                    if (!key.isEmpty() && !revoked(folder, label)) {
                        lines.add(label + "  " + idOf(key));
                    }
                }
            }
        } catch (IOException e) {
            // No folder yet: no agent has a key.
        }
        return lines;
    }

    /** The id an agent with this key has. It says nothing of the key. */
    static String idOf(String key) {
        return "a-" + Pairing.hmacHex(key, "agent-id").substring(0, 12);
    }

    /**
     * What an agent's process proves to the server: that it holds the key of its label. The words
     * in front differ from those of every proof made with the pairing token.
     */
    static String proof(String key, String serverNonce, String nonce) {
        return Pairing.hmacHex(key, "agent:" + serverNonce + ":" + nonce);
    }
}
