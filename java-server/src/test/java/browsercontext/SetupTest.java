package browsercontext;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Setup: the skill in its place, and the rest said with the paths of the server that is asked. */
class SetupTest {

    /** A download as it lies on the disk once it is unpacked, in a folder with a space in its name. */
    private static Path download(Path dir, boolean windows) throws Exception {
        Path folder = dir.resolve("my tools").resolve("tabgoblin");
        Files.createDirectories(folder.resolve("runtime").resolve("bin"));
        Files.createDirectories(folder.resolve("extension"));
        Files.writeString(folder.resolve("extension").resolve("manifest.json"), "{}");
        Files.writeString(folder.resolve("browser-context-mcp.jar"), "jar");
        Files.writeString(folder.resolve(windows ? "tabgoblin.cmd" : "tabgoblin"), "launcher");
        for (String java : windows ? new String[] {"java.exe", "javaw.exe"} : new String[] {"java"}) {
            Files.writeString(folder.resolve("runtime").resolve("bin").resolve(java), "java");
        }
        return folder;
    }

    @Test
    void aDownloadKnowsItsLauncherItsExtensionAndTheJavaAnAgentHasToStart(@TempDir Path dir) throws Exception {
        Path folder = download(dir, true);
        Path bin = folder.resolve("runtime").resolve("bin");
        // The window's own process runs on the Java without a console. An agent talks through
        // input and output, and is told the one with a console.
        Setup.Self self = Setup.Self.at(bin.resolve("javaw.exe"), folder.resolve("browser-context-mcp.jar"), "Windows 11");
        assertEquals(bin.resolve("java.exe"), self.java());
        assertEquals(folder.resolve("tabgoblin.cmd"), self.launcher());
        assertEquals(folder.resolve("extension"), self.extension());
        // Every path in quotes: the folder has a space in its name.
        assertEquals("\"" + bin.resolve("java.exe") + "\" -jar \"" + folder.resolve("browser-context-mcp.jar") + "\"", self.command());
        assertEquals("\"" + folder.resolve("tabgoblin.cmd") + "\" --panel", self.forAPerson("--panel"));

        Path unix = download(dir.resolve("other"), false);
        Setup.Self there = Setup.Self.at(unix.resolve("runtime").resolve("bin").resolve("java"), unix.resolve("browser-context-mcp.jar"), "Linux");
        assertEquals(unix.resolve("runtime").resolve("bin").resolve("java"), there.java());
        assertEquals(unix.resolve("tabgoblin"), there.launcher());
    }

    @Test
    void aBuildFromSourceHasItsExtensionInTheCheckoutAndNoLauncher(@TempDir Path dir) throws Exception {
        Path target = dir.resolve("java-server").resolve("target");
        Files.createDirectories(target);
        Path jar = Files.writeString(target.resolve("browser-context-mcp.jar"), "jar");
        Path java = Files.writeString(dir.resolve("java"), "java");
        // Before the extension is built there is none to point to.
        Setup.Self without = Setup.Self.at(java, jar, "Linux");
        assertNull(without.extension());
        assertNull(without.launcher());
        // A person is given the whole command then.
        assertEquals("\"" + java + "\" -jar \"" + jar + "\" --panel", without.forAPerson("--panel"));

        Path dist = dir.resolve("chrome-extension").resolve("dist");
        Files.createDirectories(dist);
        Files.writeString(dist.resolve("manifest.json"), "{}");
        assertEquals(dist, Setup.Self.at(java, jar, "Linux").extension());
    }

    @Test
    void eachAgentIsToldAboutTheServerByItsOwnCommand(@TempDir Path dir) throws Exception {
        Path folder = download(dir, false);
        Setup.Self self = Setup.Self.at(folder.resolve("runtime").resolve("bin").resolve("java"), folder.resolve("browser-context-mcp.jar"), "Linux");
        String server = " tabgoblin -- " + self.command();
        // For the user, and so for every project.
        // And each is named to the server, so that it is the same agent at every start.
        assertEquals("claude mcp add --scope user" + server + " --agent claude-code", Setup.registration(Skills.Agent.CLAUDE_CODE, self));
        assertEquals("codex mcp add" + server + " --agent codex", Setup.registration(Skills.Agent.CODEX, self));
        assertEquals("copilot mcp add" + server + " --agent copilot", Setup.registration(Skills.Agent.COPILOT, self));
    }

    @Test
    void whatIsSaidHasTheFourStepsWithThisServersOwnPaths(@TempDir Path dir) throws Exception {
        Path folder = download(dir, true);
        Setup.Self self = Setup.Self.at(folder.resolve("runtime").resolve("bin").resolve("java.exe"),
                folder.resolve("browser-context-mcp.jar"), "Windows 11");
        Path home = dir.resolve("home");
        Skills.Result skill = Skills.install(Skills.Agent.CLAUDE_CODE, home, false);
        String said = Setup.says(skill, self);
        assertTrue(said.startsWith("TabGoblin setup for Claude Code\n"), said);
        assertTrue(said.contains("1. The skill, which tells the agent how to use the tools: installed in "
                + home.resolve(".claude").resolve("skills").resolve("tabgoblin")), said);
        assertTrue(said.contains("2. The server. Run this line once, so that Claude Code knows it:\n\n     "
                + Setup.registration(Skills.Agent.CLAUDE_CODE, self) + "\n"), said);
        assertTrue(said.contains("Load unpacked and choose this folder:\n\n     " + folder.resolve("extension") + "\n"), said);
        assertTrue(said.contains("4. Pair, once. Open the server's window:\n\n     \"" + folder.resolve("tabgoblin.cmd") + "\" --panel\n"), said);
        assertFalse(said.contains("VS Code"), "that is said to Copilot's users only");
        // The pairing token is not Setup's to know, and is in nothing it says.
        assertFalse(said.toLowerCase().matches("(?s).*[0-9a-f]{32}.*"), said);

        // Asked again, nothing is written, and it says so.
        assertTrue(Setup.says(Skills.install(Skills.Agent.CLAUDE_CODE, home, false), self).contains("tools: already in "), said);

        // A skill that is there and is not this one is left alone, and the first step says what to do.
        Path codex = Skills.Agent.CODEX.folder(home);
        Files.createDirectories(codex);
        Files.writeString(codex.resolve("SKILL.md"), "the user's own");
        Skills.Result left = Skills.install(Skills.Agent.CODEX, home, false);
        assertFalse(left.ok());
        String refused = Setup.says(left, self);
        assertTrue(refused.contains("NOT installed. There is a skill in " + codex + " that is not this one"), refused);
        assertTrue(refused.contains("run this command again with --replace"), refused);
        assertEquals("the user's own", Files.readString(codex.resolve("SKILL.md")));
        // The other steps are said all the same: they do not depend on the skill.
        assertTrue(refused.contains("codex mcp add tabgoblin -- "), refused);

        // Copilot has two places, and both are said.
        String copilot = Setup.says(Skills.install(Skills.Agent.COPILOT, home, false), self);
        assertTrue(copilot.contains("copilot mcp add tabgoblin -- "), copilot);
        assertTrue(copilot.contains("In VS Code, run \"MCP: Add Server\" from the Command Palette"), copilot);

        // A server that has no extension beside it says where one is to be had.
        Setup.Self bare = new Setup.Self(self.java(), self.jar(), null, null);
        String without = Setup.says(skill, bare);
        assertTrue(without.contains("(not found beside this server"), without);
        assertTrue(without.contains("     " + bare.command() + " --panel\n"), without);
    }
}
