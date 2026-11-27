package tabgoblin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class AgentKeysTest {

    @Test
    void aLabelIsAShortPlainNameAndNothingThatCouldNameAnotherFile() {
        assertEquals("claude-code", AgentKeys.label(" Claude-Code "));
        assertEquals("ide_2.x", AgentKeys.label("ide_2.x"));
        for (String bad : new String[] {null, "", " ", "../x", "a/b", "a\\b", ".x", "-x", "a b", "a..b", "ä", "x".repeat(41), "a\nb"}) {
            assertNull(AgentKeys.label(bad), String.valueOf(bad));
        }
    }

    @Test
    void aKeyIsMadeOnceAndIsTheSameFromThenOn(@TempDir Path dir) throws Exception {
        Path keys = dir.resolve("agents");
        String key = AgentKeys.loadOrCreate(keys, "ide");
        assertTrue(key.matches("[0-9a-f]{64}"), "256 random bits, as text");
        assertEquals(key, AgentKeys.loadOrCreate(keys, "ide"));
        assertEquals(key, AgentKeys.read(keys, "ide"));
        assertNotEquals(key, AgentKeys.loadOrCreate(keys, "cli"), "each label has its own");
        assertTrue(AgentKeys.read(keys, "nobody").isEmpty(), "reading makes none");
        try {
            assertEquals("rw-------", java.nio.file.attribute.PosixFilePermissions.toString(
                    Files.getPosixFilePermissions(keys.resolve("ide.key"))), "for the user alone");
        } catch (UnsupportedOperationException e) {
            // Windows: the user's folder is per-user already.
        }
        // A file that holds something else is no key.
        Files.writeString(keys.resolve("odd.key"), "not a key");
        assertTrue(AgentKeys.read(keys, "odd").isEmpty());
    }

    @Test
    void theIdFollowsFromTheKeyAndSaysNothingOfIt(@TempDir Path dir) throws Exception {
        String key = AgentKeys.loadOrCreate(dir, "ide");
        String id = AgentKeys.idOf(key);
        assertTrue(id.matches("a-[0-9a-f]{12}"), id);
        assertEquals(id, AgentKeys.idOf(key));
        assertFalse(key.contains(id.substring(2)), "no piece of the key");
        assertNotEquals(id, AgentKeys.idOf(AgentKeys.loadOrCreate(dir, "cli")));
    }

    @Test
    void aProofIsForOneKeyAndOneExchangeAndIsNoProofOfThePairingToken(@TempDir Path dir) throws Exception {
        String key = AgentKeys.loadOrCreate(dir, "ide");
        String other = AgentKeys.loadOrCreate(dir, "cli");
        String proof = AgentKeys.proof(key, "server-nonce", "link-nonce");
        assertEquals(proof, AgentKeys.proof(key, "server-nonce", "link-nonce"));
        assertNotEquals(proof, AgentKeys.proof(other, "server-nonce", "link-nonce"), "another key");
        assertNotEquals(proof, AgentKeys.proof(key, "another-nonce", "link-nonce"), "another exchange: a proof that was heard is of no use later");
        assertNotEquals(proof, AgentKeys.proof(key, "server-nonce", "another-nonce"));
        // The same secret used as a pairing token gives other proofs: one kind is never taken for the other.
        assertNotEquals(proof, Pairing.linkProof(key, "server-nonce", "link-nonce"));
        assertNotEquals(proof, Pairing.hubProof(key, "server-nonce", "link-nonce"));
        assertNotEquals(proof, Pairing.clientProof(key, "server-nonce", "link-nonce"));
        assertNotEquals(proof, Pairing.serverProof(key, "server-nonce", "link-nonce"));
    }

    @Test
    void revokingTakesTheKeyAwayAndKeepsANewOneFromBeingMadeUntilAllowed(@TempDir Path dir) throws Exception {
        String key = AgentKeys.loadOrCreate(dir, "ide");
        AgentKeys.loadOrCreate(dir, "cli");
        assertFalse(AgentKeys.revoked(dir, "ide"));
        AgentKeys.revoke(dir, "ide");
        assertTrue(AgentKeys.revoked(dir, "ide"));
        assertTrue(AgentKeys.read(dir, "ide").isEmpty(), "the key is deleted: the id it had is nobody's");
        assertFalse(AgentKeys.revoked(dir, "cli"), "another agent is not touched");
        assertEquals(List.of("cli  " + AgentKeys.idOf(AgentKeys.read(dir, "cli")), "ide  revoked"), AgentKeys.list(dir));
        AgentKeys.revoke(dir, "ide");
        assertTrue(AgentKeys.allow(dir, "ide"));
        assertFalse(AgentKeys.allow(dir, "ide"), "it was not revoked any more");
        assertNotEquals(key, AgentKeys.loadOrCreate(dir, "ide"), "allowed again it is a new agent");
        // A label that never had a key can be revoked ahead of its first start.
        AgentKeys.revoke(dir.resolve("none-yet"), "later");
        assertTrue(AgentKeys.revoked(dir.resolve("none-yet"), "later"));
        assertTrue(AgentKeys.list(dir.resolve("not-there")).isEmpty());
    }

    @Test
    void theKeysAreBesideThePairingTokenAndAreNotTheToken(@TempDir Path dir) throws Exception {
        Path tokenFile = dir.resolve("pairing-token");
        String token = Pairing.loadOrCreateToken(tokenFile);
        Path keys = AgentKeys.folder(tokenFile);
        assertEquals(dir.toAbsolutePath().resolve("agents"), keys);
        String key = AgentKeys.loadOrCreate(keys, "ide");
        assertNotEquals(token, key);
        // A new pairing token leaves every agent who it was.
        Pairing.rotateToken(tokenFile);
        assertEquals(key, AgentKeys.read(keys, "ide"));
    }
}
