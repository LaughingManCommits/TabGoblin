package browsercontext;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Pairing token storage and the HMAC challenge-response used on the WebSocket.
 *
 * <p>The token is a shared secret between this server and the extension. It never travels over the
 * socket: each side proves knowledge of it by signing the other side's nonce. Never log it.
 */
final class Pairing {

    private static final SecureRandom RANDOM = new SecureRandom();

    private Pairing() {
    }

    static Path defaultTokenFile() {
        return Path.of(System.getProperty("user.home"), ".browser-context-mcp", "pairing-token");
    }

    /** Shortest text that is taken for a token. */
    private static final int MIN_TOKEN_LENGTH = 32;
    /**
     * How long after its last change a file is read at every asking. Some file systems keep that
     * time to two seconds only: a second change inside them would look like none.
     */
    private static final long YOUNG_MS = 3_000;

    /** Reads the pairing token, creating a new random one on first use. */
    static String loadOrCreateToken(Path file) throws IOException {
        String token = readToken(file);
        return token.isEmpty() ? rotateToken(file) : token;
    }

    /** The token that is in the file, or nothing if there is none: nothing is made here. */
    static String readToken(Path file) {
        try {
            String token = Files.readString(file, StandardCharsets.UTF_8).trim();
            return token.length() >= MIN_TOKEN_LENGTH ? token : "";
        } catch (IOException e) {
            return "";
        }
    }

    /**
     * Replaces the pairing token with a new random one. Every server reading this file stops
     * accepting the old token, so the extension has to be paired again.
     *
     * <p>The file is replaced in one step where the system can do that, so that a process that
     * reads it at that moment finds the old token or the new one, and never half of one.
     */
    static String rotateToken(Path file) throws IOException {
        String token = randomHex(32);
        Path folder = file.toAbsolutePath().getParent();
        Files.createDirectories(folder);
        Path fresh = Files.createTempFile(folder, "pairing-token", ".new");
        try {
            Files.writeString(fresh, token, StandardCharsets.UTF_8);
            try {
                Files.setPosixFilePermissions(fresh, PosixFilePermissions.fromString("rw-------"));
            } catch (UnsupportedOperationException e) {
                // Windows: the file inherits the user-profile ACL, which is already per-user.
            }
            try {
                Files.move(fresh, file, java.nio.file.StandardCopyOption.ATOMIC_MOVE, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            } catch (java.nio.file.AtomicMoveNotSupportedException e) {
                Files.move(fresh, file, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
        } finally {
            Files.deleteIfExists(fresh);
        }
        return token;
    }

    /**
     * The token of a file as it is now: read again when the file changes, so that a new token takes
     * effect in the processes that are already running. Keeps the last one it knew if the file
     * cannot be read.
     */
    static final class Tokens implements java.util.function.Supplier<String> {
        private final Path file;
        private String token;
        private long seen;

        private Tokens(Path file, String initial) {
            this.file = file;
            this.token = initial;
            this.seen = modified();
        }

        private long modified() {
            try {
                return Files.getLastModifiedTime(file).toMillis();
            } catch (IOException e) {
                return -1;
            }
        }

        @Override
        public synchronized String get() {
            long now = modified();
            if (now != seen || (now >= 0 && Math.abs(System.currentTimeMillis() - now) < YOUNG_MS)) {
                seen = now;
                String read = readToken(file);
                if (!read.isEmpty()) {
                    token = read;
                }
            }
            return token;
        }
    }

    /** The token of a file, beginning with one that is known. */
    static Tokens tokenSource(Path file, String initial) {
        return new Tokens(file, initial);
    }

    static String randomHex(int bytes) {
        byte[] buf = new byte[bytes];
        RANDOM.nextBytes(buf);
        return HexFormat.of().formatHex(buf);
    }

    static String clientProof(String token, String serverNonce, String clientNonce) {
        return hmacHex(token, "client:" + serverNonce + ":" + clientNonce);
    }

    static String serverProof(String token, String serverNonce, String clientNonce) {
        return hmacHex(token, "server:" + serverNonce + ":" + clientNonce);
    }

    /**
     * What a process that an agent started proves to the one server before it may pass its agent's
     * messages on. The words in front differ from those of the extension's pairing, so that a proof
     * made for the one is no proof for the other.
     */
    static String linkProof(String token, String serverNonce, String linkNonce) {
        return hmacHex(token, "link:" + serverNonce + ":" + linkNonce);
    }

    /** What the one server proves in return: that it knows the token too, and is no other program on that port. */
    static String hubProof(String token, String serverNonce, String linkNonce) {
        return hmacHex(token, "hub:" + serverNonce + ":" + linkNonce);
    }

    static String hmacHex(String token, String message) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(token.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(message.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("HMAC-SHA256 unavailable", e);
        }
    }

    static boolean constantTimeEquals(String a, String b) {
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
}
