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
    void readingMakesNoTokenAndAServerThatStartsMakesANewOne(@TempDir Path dir) throws Exception {
        Path file = dir.resolve("nested").resolve("pairing-token");
        // Whoever only reads finds nothing, and leaves nothing behind.
        assertEquals("", Pairing.readToken(file));
        Pairing.Tokens tokens = Pairing.tokens(file);
        assertEquals("", tokens.get());
        assertFalse(Files.exists(file));

        // A server that starts makes one, in the file and in what it holds, at once.
        String first = tokens.renew();
        assertEquals(64, first.length());
        assertTrue(first.matches("[0-9a-f]+"));
        assertEquals(first, tokens.get());
        assertEquals(first, Files.readString(file));
        assertEquals(first, Pairing.readToken(file));

        // And the next start makes another: what was paired with the first is paired no longer.
        String second = Pairing.tokens(file).renew();
        assertNotEquals(first, second);
        assertEquals(second, Files.readString(file));
        // Nothing but the token is left in the folder: the file was replaced, not written beside.
        try (var files = Files.list(file.getParent())) {
            assertEquals(java.util.List.of("pairing-token"), files.map(found -> found.getFileName().toString()).toList());
        }
    }

    @Test
    void aProcessThatRunsTakesTheNewTokenAtOnceAlsoWhereTheFilesTimeDoesNotMove(@TempDir Path dir) throws Exception {
        Path file = dir.resolve("pairing-token");
        String first = Pairing.rotateToken(file);
        Pairing.Tokens running = Pairing.tokens(file);
        assertEquals(first, running.get());

        // Another process renews it, as a server that starts does. Some file systems keep a file's
        // time to two seconds: the time is put back to what it was, as if the change fell inside them.
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
        Pairing.Tokens running = Pairing.tokens(file);
        Files.writeString(file, "");
        assertEquals(good, running.get());
    }

    @Test
    void noTokenProvesNothing() {
        // Signed with no token, a proof matches nothing, not even itself.
        assertNotEquals(Pairing.clientProof("", SERVER_NONCE, CLIENT_NONCE), Pairing.clientProof("", SERVER_NONCE, CLIENT_NONCE));
        assertNotEquals(Pairing.linkProof("", SERVER_NONCE, CLIENT_NONCE), Pairing.hubProof("", SERVER_NONCE, CLIENT_NONCE));
    }

    @Test
    void comparisonIsExact() {
        assertTrue(Pairing.constantTimeEquals("abc", "abc"));
        assertFalse(Pairing.constantTimeEquals("abc", "abd"));
        assertFalse(Pairing.constantTimeEquals("abc", "ab"));
    }
}
