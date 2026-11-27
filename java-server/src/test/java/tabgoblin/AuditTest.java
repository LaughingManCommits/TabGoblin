package tabgoblin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

class AuditTest {

    @AfterEach
    void off() {
        Audit.to(null);
    }

    @Test
    void nothingIsWrittenUnlessTheSettingsAskForIt(@TempDir Path dir) throws Exception {
        Path settings = dir.resolve(BlockedSites.FILE);
        assertFalse(BlockedSites.audits(settings), "no file");
        Files.writeString(settings, "blocked.sites = example.org\n");
        assertFalse(BlockedSites.audits(settings));
        Files.writeString(settings, "audit.log = yes\n");
        assertFalse(BlockedSites.audits(settings), "only a plain on");
        Files.writeString(settings, "audit.log = ON\n");
        assertTrue(BlockedSites.audits(settings));

        Log.command("1", "s1", "snapshot", 12, null);
        assertNull(Audit.target());
        assertFalse(Files.exists(dir.resolve(Audit.FILE)));
        // The settings are looked at, and from then on each call has its line.
        BlockedSites.source(settings).get();
        assertEquals(dir.resolve(Audit.FILE).toAbsolutePath(), Audit.target());
    }

    @Test
    void eachCallIsOneLineOfJsonWithIdsAndOutcomesAndNothingElse(@TempDir Path dir) throws Exception {
        Path file = dir.resolve(Audit.FILE);
        Audit.to(file);
        Log.of("a-0123456789ab").command("17", "s2", "click", 132, null);
        Log.of("a-0123456789ab").command("18", "s2", "navigate", 3, "SITE_BLOCKED");
        Log.of("c-1a2b3c4d").command("-", null, "browser_status", 0, "AGENT_REVOKED");

        List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
        assertEquals(3, lines.size());
        ObjectMapper json = new ObjectMapper();
        JsonNode first = json.readTree(lines.get(0));
        assertEquals(List.of("time", "agent", "session", "action", "ms", "outcome"), List.copyOf(first.propertyNames()));
        assertEquals("a-0123456789ab", first.path("agent").asString());
        assertEquals("s2", first.path("session").asString());
        assertEquals("click", first.path("action").asString());
        assertEquals(132, first.path("ms").asInt());
        assertEquals("ok", first.path("outcome").asString());
        assertTrue(java.time.Instant.parse(first.path("time").asString()).isBefore(java.time.Instant.now().plusSeconds(1)));
        JsonNode second = json.readTree(lines.get(1));
        assertEquals("SITE_BLOCKED", second.path("outcome").asString());
        assertEquals("SCOPE", second.path("category").asString());
        JsonNode third = json.readTree(lines.get(2));
        assertTrue(third.path("session").isNull());
        assertEquals("AUTHORIZATION", third.path("category").asString());
        try {
            assertEquals("rw-------", java.nio.file.attribute.PosixFilePermissions.toString(Files.getPosixFilePermissions(file)));
        } catch (UnsupportedOperationException e) {
            // Windows
        }
    }

    @Test
    void aValueCannotBreakALineAndAFileThatCannotBeWrittenStopsNoTool(@TempDir Path dir) throws Exception {
        Path file = dir.resolve(Audit.FILE);
        Audit.to(file);
        Audit.command("a\"b\\c\nd", "s1", "click", -5, null);
        List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
        assertEquals(1, lines.size(), "a line break in a value does not make a second line");
        JsonNode read = new ObjectMapper().readTree(lines.get(0));
        // The value comes back as it was: the line break is written as two characters, not as a break.
        assertEquals("a\"b\\c\nd", read.path("agent").asString());
        assertEquals(0, read.path("ms").asInt());

        // The place is no file: the record is switched off, and the call that found it so goes on.
        Audit.to(dir);
        Audit.command("a-0123456789ab", "s1", "click", 1, null);
        assertNull(Audit.target());
    }

    @Test
    void theFileIsBegunAnewWhenItIsFullAndTheOneBeforeIsKept(@TempDir Path dir) throws Exception {
        Path file = dir.resolve(Audit.FILE);
        Files.write(file, new byte[(int) Audit.MAX_BYTES]);
        Audit.to(file);
        Audit.command("a-0123456789ab", "s1", "click", 1, null);
        assertEquals(Audit.MAX_BYTES, Files.size(dir.resolve("audit.1.jsonl")));
        assertEquals(1, Files.readAllLines(file, StandardCharsets.UTF_8).size());
    }
}
