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

    /** Reads the pairing token, creating a new random one on first use. */
    static String loadOrCreateToken(Path file) throws IOException {
        if (Files.exists(file)) {
            String token = Files.readString(file, StandardCharsets.UTF_8).trim();
            if (token.length() >= 32) {
                return token;
            }
        }
        return rotateToken(file);
    }

    /**
     * Replaces the pairing token with a new random one. Every server reading this file stops
     * accepting the old token, so the extension has to be paired again.
     */
    static String rotateToken(Path file) throws IOException {
        String token = randomHex(32);
        Files.createDirectories(file.getParent());
        Files.writeString(file, token, StandardCharsets.UTF_8);
        try {
            Files.setPosixFilePermissions(file, PosixFilePermissions.fromString("rw-------"));
        } catch (UnsupportedOperationException e) {
            // Windows: the file inherits the user-profile ACL, which is already per-user.
        }
        return token;
    }

    /**
     * The current token of a file, re-read when the file changes, so a rotation takes effect in
     * servers that are already running. Falls back to the last known token if the file is unreadable.
     */
    static java.util.function.Supplier<String> tokenSource(Path file, String initial) {
        return new java.util.function.Supplier<>() {
            private String token = initial;
            private long seen = modified();

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
                if (now != seen) {
                    seen = now;
                    try {
                        String read = Files.readString(file, StandardCharsets.UTF_8).trim();
                        if (read.length() >= 32) {
                            token = read;
                        }
                    } catch (IOException e) {
                        // keep the last known token
                    }
                }
                return token;
            }
        };
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
