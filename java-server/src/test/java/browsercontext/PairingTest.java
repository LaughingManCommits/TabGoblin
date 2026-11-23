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
    void aRotationReplacesTheFileAndLeavesNothingBesideIt(@TempDir Path dir) throws Exception {
        Path file = dir.resolve("pairing-token");
        String first = Pairing.loadOrCreateToken(file);
        String second = Pairing.rotateToken(file);
        assertNotEquals(first, second);
        assertEquals(second, Files.readString(file));
        assertEquals(second, Pairing.loadOrCreateToken(file));
        // The file was replaced in one step: no other file is left in its folder.
        try (var files = Files.list(dir)) {
            assertEquals(java.util.List.of("pairing-token"), files.map(found -> found.getFileName().toString()).toList());
        }
    }

    @Test
    void aProcessThatRunsTakesTheNewTokenAtOnceAlsoWhereTheFilesTimeDoesNotMove(@TempDir Path dir) throws Exception {
        Path file = dir.resolve("pairing-token");
        String first = Pairing.rotateToken(file);
        Pairing.Tokens running = Pairing.tokenSource(file, first);
        assertEquals(first, running.get());

        // Another process rotates it. Some file systems keep a file's time to two seconds: the
        // time is put back to what it was, as if the change fell inside them.
        var before = Files.getLastModifiedTime(file);
        String second = Pairing.rotateToken(file);
        Files.setLastModifiedTime(file, before);
        assertEquals(second, running.get(), "a file changed moments ago is read whatever its time says");
    }

    @Test
    void aTextThatIsNoTokenIsNotTakenForOne(@TempDir Path dir) throws Exception {
        Path file = dir.resolve("pairing-token");
        Files.writeString(file, "short");
        assertEquals("", Pairing.readToken(file));
        // A process keeps the token it knew when the file is spoiled.
        String good = Pairing.rotateToken(file);
        Pairing.Tokens running = Pairing.tokenSource(file, good);
        Files.writeString(file, "");
        assertEquals(good, running.get());
    }

    @Test
    void comparisonIsExact() {
        assertTrue(Pairing.constantTimeEquals("abc", "abc"));
        assertFalse(Pairing.constantTimeEquals("abc", "abd"));
        assertFalse(Pairing.constantTimeEquals("abc", "ab"));
    }
}
