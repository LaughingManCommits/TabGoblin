package browsercontext;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** The sites no agent may work on: what an entry blocks, and how the list is read. */
class BlockedSitesTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    /** The cases that the extension's rule is held to as well. */
    private static JsonNode cases() throws Exception {
        try (InputStream in = BlockedSitesTest.class.getResourceAsStream("/browsercontext/blocked-sites-cases.json")) {
            return JSON.readTree(in);
        }
    }

    private static String text(JsonNode node) {
        return node.isNull() ? null : node.asString();
    }

    @Test
    void anAddressIsTakenDownToItsHostInOneForm() throws Exception {
        for (JsonNode c : cases().path("hosts")) {
            assertEquals(text(c.path("host")), BlockedSites.host(c.path("address").asString()), c.path("address").asString());
        }
        assertNull(BlockedSites.host(null));
        assertNull(BlockedSites.host("https:///"));
        assertNull(BlockedSites.host("about:blank"));
    }

    @Test
    void whatAUserMayPasteIsTakenDownToADomainAndWhatIsNoDomainIsNotTakenForOne() throws Exception {
        for (JsonNode c : cases().path("entries")) {
            assertEquals(text(c.path("domain")), BlockedSites.domain(c.path("entry").asString()),
                    "entry \"" + c.path("entry").asString() + "\"");
        }
    }

    @Test
    void anEntryBlocksItsDomainWithEverySubdomainAndNoLookAlike() throws Exception {
        for (JsonNode c : cases().path("matches")) {
            List<String> blocked = new ArrayList<>();
            c.path("blocked").forEach(entry -> blocked.add(entry.asString()));
            assertEquals(text(c.path("by")), new BlockedSites.Rule(blocked, null).blocking(c.path("host").asString()),
                    c.path("host").asString() + " against " + blocked);
        }
        assertNull(new BlockedSites.Rule(List.of("example.org"), null).blocking(null));
    }

    @Test
    void theListIsReadFromAFileOfPropertiesAndAFileThatIsNotThereBlocksNothing(@TempDir Path dir) throws Exception {
        Path file = dir.resolve(BlockedSites.FILE);
        assertEquals(BlockedSites.Rule.NONE, BlockedSites.read(file));

        Files.writeString(file, """
                # Sites no agent may work on.
                blocked.sites = Example.org, https://bank.example/login  *.intranet.example
                something.else = left alone
                """, StandardCharsets.UTF_8);
        BlockedSites.Rule rule = BlockedSites.read(file);
        assertEquals(List.of("bank.example", "example.org", "intranet.example"), rule.domains());
        assertFalse(rule.everything());
        assertEquals("example.org", rule.blocking("mail.example.org"));
        assertNull(rule.blocking("docs.example.net"));

        // A file with no entry, or without the key, blocks nothing.
        Files.writeString(file, "blocked.sites =\n", StandardCharsets.UTF_8);
        assertEquals(BlockedSites.Rule.NONE, BlockedSites.read(file));
        Files.writeString(file, "# nothing yet\n", StandardCharsets.UTF_8);
        assertEquals(BlockedSites.Rule.NONE, BlockedSites.read(file));
    }

    @Test
    void aFileThatCannotBeTakenAsAListBlocksEverythingAndSaysWhy(@TempDir Path dir) throws Exception {
        // An entry that is no domain: the site it was meant for must not be open without a word.
        Path file = dir.resolve(BlockedSites.FILE);
        Files.writeString(file, "blocked.sites = example.org, exam_ple.org\n", StandardCharsets.UTF_8);
        BlockedSites.Rule slip = BlockedSites.read(file);
        assertTrue(slip.everything());
        assertEquals("\"exam_ple.org\" in blocked.sites is no domain", slip.unreadable());
        assertEquals(List.of(), slip.domains());

        // A file that is not a text of properties.
        Files.writeString(file, "blocked.sites = example.org \\u12", StandardCharsets.UTF_8);
        assertTrue(BlockedSites.read(file).everything());

        // Something in the file's place that cannot be read at all.
        Path folder = dir.resolve("a-folder");
        Files.createDirectory(folder);
        BlockedSites.Rule unreadable = BlockedSites.read(folder);
        assertTrue(unreadable.everything());
        assertTrue(unreadable.unreadable().matches("it cannot be read \\(\\w+\\)"), unreadable.unreadable());
    }

    @Test
    void aChangedFileIsInForceWithoutTheServerBeingStarted(@TempDir Path dir) throws Exception {
        Path file = dir.resolve(BlockedSites.FILE);
        Supplier<BlockedSites.Rule> rule = BlockedSites.source(file);
        assertEquals(BlockedSites.Rule.NONE, rule.get());

        Files.writeString(file, "blocked.sites = example.org\n", StandardCharsets.UTF_8);
        awaitRule(rule, List.of("example.org"));
        // Changed, with a later time of change: file systems keep that time coarsely.
        Files.writeString(file, "blocked.sites = example.org, docs.example\n", StandardCharsets.UTF_8);
        Files.setLastModifiedTime(file, FileTime.fromMillis(System.currentTimeMillis() + 5_000));
        awaitRule(rule, List.of("docs.example", "example.org"));
        // Taken away again: nothing is blocked.
        Files.delete(file);
        awaitRule(rule, List.of());
        assertFalse(rule.get().everything());
    }

    private static void awaitRule(Supplier<BlockedSites.Rule> rule, List<String> domains) throws InterruptedException {
        for (int i = 0; i < 100 && !rule.get().domains().equals(domains); i++) {
            Thread.sleep(50);
        }
        assertEquals(domains, rule.get().domains());
    }

    @Test
    void aSettingsFileThatIsNotThereIsMadeWithWhatItCanHoldAndOneThatIsThereIsLeftAlone(@TempDir Path dir) throws Exception {
        Path file = dir.resolve("a-folder-not-there-yet").resolve(BlockedSites.FILE);
        BlockedSites.ensure(file);
        String made = Files.readString(file, StandardCharsets.UTF_8);
        assertEquals(BlockedSites.TEMPLATE, made);
        // It names the key and says what an entry blocks; and as it stands it blocks nothing.
        assertTrue(made.contains("# blocked.sites = "), made);
        assertEquals(BlockedSites.Rule.NONE, BlockedSites.read(file));

        Files.writeString(file, "blocked.sites = example.org\n", StandardCharsets.UTF_8);
        BlockedSites.ensure(file);
        assertEquals("blocked.sites = example.org\n", Files.readString(file, StandardCharsets.UTF_8));
    }

    @Test
    void theFileIsOpenedWithTheSystemsOwnEditorForText() {
        Path file = Path.of("some", BlockedSites.FILE);
        String path = file.toAbsolutePath().toString();
        assertEquals(List.of("notepad.exe", path), BlockedSites.editor("Windows 11", file));
        assertEquals(List.of("open", "-t", path), BlockedSites.editor("Mac OS X", file));
        assertEquals(List.of("xdg-open", path), BlockedSites.editor("Linux", file));
    }
}
