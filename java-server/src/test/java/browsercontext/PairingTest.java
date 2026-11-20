package browsercontext;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class PairingTest {

    // The same vector is asserted in chrome-extension/test/pairing.test.ts.
    static final String TOKEN = "test-token-0123456789abcdef0123456789abcdef";
    static final String SERVER_NONCE = "a".repeat(32);
    static final String CLIENT_NONCE = "b".repeat(32);

    @Test
    void proofsMatchTheExtensionImplementation() {
        assertEquals("1b283b3c3fd92227a87cc559a6d5f81c7cabc594184c68852e6e5400e36b34c1",
                Pairing.clientProof(TOKEN, SERVER_NONCE, CLIENT_NONCE));
        assertEquals("978cb739f5d247e07e34d81c745996bb325a7a3fdd05e739ea357706a4e5b094",
                Pairing.serverProof(TOKEN, SERVER_NONCE, CLIENT_NONCE));
    }

    @Test
    void tokenIsCreatedOnceAndThenReused(@TempDir Path dir) throws Exception {
        Path file = dir.resolve("nested").resolve("pairing-token");
        String first = Pairing.loadOrCreateToken(file);
        assertEquals(64, first.length());
        assertTrue(first.matches("[0-9a-f]+"));
        assertEquals(first, Pairing.loadOrCreateToken(file));
        assertEquals(first, Files.readString(file));
        assertNotEquals(first, Pairing.loadOrCreateToken(dir.resolve("other-token")));
    }

    @Test
    void comparisonIsExact() {
        assertTrue(Pairing.constantTimeEquals("abc", "abc"));
        assertFalse(Pairing.constantTimeEquals("abc", "abd"));
        assertFalse(Pairing.constantTimeEquals("abc", "ab"));
    }
}
