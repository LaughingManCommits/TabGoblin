package tabgoblin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import tabgoblin.McpMain.Options;
import tabgoblin.McpMain.UsageException;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class McpMainTest {

    @Test
    void theHelpOfADownloadSaysThatItsCommandStandsForTheLongOne() {
        String plain = McpMain.usage(false);
        assertTrue(plain.startsWith("TabGoblin MCP server (tabgoblin)\n\nCommands you run yourself:"), plain);
        assertFalse(plain.contains("the command is tabgoblin"), plain);
        assertTrue(plain.contains("--setup <agent>"), plain);
        String download = McpMain.usage(true);
        assertTrue(download.startsWith("TabGoblin MCP server (tabgoblin)\n\nIn this folder the command is tabgoblin: "
                + "it stands for \"java -jar tabgoblin.jar\" below.\n\nCommands you run yourself:"), download);
        // The rest is the same help.
        assertTrue(download.endsWith(plain.substring(plain.indexOf("Commands you run yourself:"))), download);
    }

    private static Options parse(Map<String, String> environment, String... args) throws UsageException {
        return Options.parse(args, environment::get);
    }

    @Test
    void anOptionComesBeforeTheEnvironmentAndThatBeforeTheDefault() throws Exception {
        Options defaults = parse(Map.of());
        assertEquals(McpMain.DEFAULT_PORT, defaults.port());
        assertEquals(Pairing.defaultTokenFile(), defaults.tokenFile());
        assertEquals(McpMain.DEFAULT_EXTENSION_ORIGIN, defaults.extensionOrigin());
        assertEquals(Pairing.defaultTokenFile().toAbsolutePath().resolveSibling("tabgoblin.properties"), defaults.settings(),
                "beside the pairing token");
        // A server with a token of its own has settings of its own, beside that token.
        assertEquals(Path.of("elsewhere", "tabgoblin.properties").toAbsolutePath(),
                parse(Map.of(), "--token-file", Path.of("elsewhere", "token").toString()).settings());
        assertFalse(defaults.help() || defaults.showToken() || defaults.rotateToken());

        Map<String, String> environment = Map.of("TABGOBLIN_PORT", "5000", "TABGOBLIN_TOKEN_FILE", "from-env", "TABGOBLIN_EXTENSION_ORIGIN", "chrome-extension://env");
        Options fromEnvironment = parse(environment);
        assertEquals(5000, fromEnvironment.port());
        assertEquals(Path.of("from-env"), fromEnvironment.tokenFile());
        assertEquals("chrome-extension://env", fromEnvironment.extensionOrigin());

        Options fromOptions = parse(environment, "--port", "6000", "--token-file", "given", "--extension-origin", "chrome-extension://given");
        assertEquals(6000, fromOptions.port());
        assertEquals(Path.of("given"), fromOptions.tokenFile());
        assertEquals("chrome-extension://given", fromOptions.extensionOrigin());
        assertEquals(Path.of("env.properties"), parse(Map.of("TABGOBLIN_SETTINGS", "env.properties")).settings());
        assertEquals(Path.of("given.properties"),
                parse(Map.of("TABGOBLIN_SETTINGS", "env.properties"), "--settings", "given.properties").settings());

        assertTrue(parse(Map.of(), "--help").help());
        assertTrue(parse(Map.of(), "-h").help());
        assertTrue(parse(Map.of(), "--show-token", "--port", "6000").showToken());
        assertTrue(parse(Map.of(), "--rotate-token").rotateToken());

        // A skill is asked for by its agent's name; without the option none is installed.
        assertEquals(null, defaults.installSkill());
        assertEquals(Skills.Agent.CODEX, parse(Map.of(), "--install-skill", "codex").installSkill());
        Options replacing = parse(Map.of(), "--install-skill", "claude-code", "--replace");
        assertEquals(Skills.Agent.CLAUDE_CODE, replacing.installSkill());
        assertTrue(replacing.replace());
        assertFalse(parse(Map.of(), "--install-skill", "copilot").replace());
    }

    @Test
    void aCommandLineThatIsNotUnderstoodIsRefusedAndSaysWhy() throws Exception {
        // A mistyped command used to start a server that waits for a client.
        assertEquals("Unknown option: --show-tokn",
                assertThrows(UsageException.class, () -> parse(Map.of(), "--show-tokn")).getMessage());
        assertEquals("There is no skill for \"cursor\". There is one for each of: claude-code, codex, copilot.",
                assertThrows(UsageException.class, () -> parse(Map.of(), "--install-skill", "cursor")).getMessage());
        assertEquals("--install-skill needs a value.",
                assertThrows(UsageException.class, () -> parse(Map.of(), "--install-skill")).getMessage());
        assertEquals("--replace goes with --setup or --install-skill.",
                assertThrows(UsageException.class, () -> parse(Map.of(), "--replace")).getMessage());

        // Setup, for the same agents as the skills.
        assertNull(parse(Map.of()).setup());
        assertEquals(Skills.Agent.COPILOT, parse(Map.of(), "--setup", "copilot").setup());
        Options again = parse(Map.of(), "--setup", "claude-code", "--replace");
        assertEquals(Skills.Agent.CLAUDE_CODE, again.setup());
        assertTrue(again.replace());
        assertNull(again.installSkill());
        assertEquals("There is no setup for \"cursor\". There is one for each of: claude-code, codex, copilot.",
                assertThrows(UsageException.class, () -> parse(Map.of(), "--setup", "cursor")).getMessage());
        assertEquals("--setup needs a value.",
                assertThrows(UsageException.class, () -> parse(Map.of(), "--setup")).getMessage());
        assertEquals("--setup installs the skill as well: leave --install-skill out.",
                assertThrows(UsageException.class, () -> parse(Map.of(), "--setup", "codex", "--install-skill", "codex")).getMessage());
        assertEquals("Unknown option: status",
                assertThrows(UsageException.class, () -> parse(Map.of(), "status")).getMessage());
        assertEquals("--port needs a value.",
                assertThrows(UsageException.class, () -> parse(Map.of(), "--port")).getMessage());
        assertEquals("--token-file needs a value.",
                assertThrows(UsageException.class, () -> parse(Map.of(), "--token-file", "--show-token")).getMessage());
        assertTrue(assertThrows(UsageException.class, () -> parse(Map.of(), "--port", "abc")).getMessage().contains("must be a number"));
        assertTrue(assertThrows(UsageException.class, () -> parse(Map.of("TABGOBLIN_PORT", "70000"))).getMessage().contains("between 1 and"));
        assertTrue(assertThrows(UsageException.class, () -> parse(Map.of(), "--port", "0")).getMessage().contains("between 1 and"));
    }

    @Test
    void thePanelIsAskedForAndIsOffWithoutThat() throws Exception {
        // Headless is what a server is unless it is told otherwise: agents, CI and machines without a display.
        assertFalse(parse(Map.of()).panel());
        assertTrue(parse(Map.of(), "--panel").panel());
        assertTrue(parse(Map.of(), "--port", "6000", "--panel").panel());
        for (String on : List.of("1", "true", "yes", "on", "ON", " 1 ")) {
            assertTrue(parse(Map.of("TABGOBLIN_PANEL", on)).panel(), on);
        }
        for (String off : List.of("0", "false", "no", "off", "", "  ")) {
            assertFalse(parse(Map.of("TABGOBLIN_PANEL", off)).panel(), off);
        }
        // The option is enough where the environment says no: an option comes before the environment.
        assertTrue(parse(Map.of("TABGOBLIN_PANEL", "0"), "--panel").panel());
        // A value that is neither is not taken for one of them.
        assertEquals("TABGOBLIN_PANEL must be 1 or 0, not \"maybe\".",
                assertThrows(UsageException.class, () -> parse(Map.of("TABGOBLIN_PANEL", "maybe"))).getMessage());
        assertEquals("Unknown option: --panel=1",
                assertThrows(UsageException.class, () -> parse(Map.of(), "--panel=1")).getMessage());

        // Whether the window may come up by itself when the browser holds another token: it may, unless it is said not to.
        assertFalse(parse(Map.of()).quiet());
        assertFalse(parse(Map.of(), "--panel").quiet());
        assertFalse(parse(Map.of("TABGOBLIN_PANEL", "1")).quiet());
        assertFalse(parse(Map.of("TABGOBLIN_PANEL", " ")).quiet());
        assertTrue(parse(Map.of(), "--no-panel").quiet());
        assertFalse(parse(Map.of(), "--no-panel").panel());
        for (String off : new String[] {"0", "false", "no", "OFF"}) {
            assertTrue(parse(Map.of("TABGOBLIN_PANEL", off)).quiet(), off);
        }
        // The command line wins over the environment, either way.
        assertFalse(parse(Map.of("TABGOBLIN_PANEL", "0"), "--panel").quiet());
        Options silenced = parse(Map.of("TABGOBLIN_PANEL", "1"), "--no-panel");
        assertTrue(silenced.quiet());
        assertFalse(silenced.panel());
        assertEquals("--panel and --no-panel exclude each other.",
                assertThrows(UsageException.class, () -> parse(Map.of(), "--panel", "--no-panel")).getMessage());
    }

    @Test
    void thePairingTokenGoesToTheClipboardAndNowhereElse() {
        String token = "5e".repeat(32);
        var clipboard = new java.util.ArrayList<String>();
        var asked = new java.util.concurrent.atomic.AtomicInteger();
        Log.keep(20);
        try {
            // The bridge is not looked at: a copy is between the token and the clipboard.
            McpMain.carryOut(new Panel.Command.CopyToken(), null, () -> {
                asked.incrementAndGet();
                return token;
            }, clipboard::add, () -> false);
            assertEquals(List.of(token), clipboard);
            assertEquals(1, asked.get(), "the token is read when it is asked for, once");
            // The log says that it happened and has nothing of the token.
            Log.Line said = Log.recent().get(Log.recent().size() - 1);
            assertEquals("pairing token copied to the clipboard in the panel", said.text());
            for (Log.Line line : Log.recent()) {
                assertFalse(line.text().contains(token.substring(0, 8)), line.text());
            }
        } finally {
            Log.keep(0);
        }
    }

    @Test
    void withoutADisplayTheServerRunsWithoutItsPanelAndSaysSo() {
        Log.keep(20);
        try {
            long before = Log.count();
            // No window system is touched: the bridge is not even looked at.
            assertFalse(McpMain.showPanel(() -> null, command -> { }, () -> false));
            assertEquals(before + 1, Log.count());
            Log.Line said = Log.recent().get(Log.recent().size() - 1);
            assertEquals("warn", said.level());
            assertEquals("panel not shown reason=no_display", said.text());
        } finally {
            Log.keep(0);
        }
    }

    @Test
    void editInTheWindowOpensTheSettingsFileAndTheLogSaysWhetherItDidAndNotWhereItIs() {
        Log.keep(20);
        try {
            var asked = new java.util.concurrent.atomic.AtomicInteger();
            McpMain.carryOut(new Panel.Command.EditSettings(), null, null, null, () -> asked.incrementAndGet() > 0);
            assertEquals(1, asked.get());
            assertEquals("settings file opened in an editor on the user's word in the panel",
                    Log.recent().get(Log.recent().size() - 1).text());
            McpMain.carryOut(new Panel.Command.EditSettings(), null, null, null, () -> false);
            Log.Line failed = Log.recent().get(Log.recent().size() - 1);
            assertEquals("warn", failed.level());
            assertTrue(failed.text().startsWith("settings file not opened: no editor could be started."), failed.text());
        } finally {
            Log.keep(0);
        }
    }

    @Test
    void anAgentIsNamedByAnOptionOrTheEnvironmentAndOnlyByAShortPlainName() throws Exception {
        assertNull(parse(Map.of()).agent(), "an agent that is not named has no key");
        assertEquals("claude-code", parse(Map.of(), "--agent", "Claude-Code").agent());
        assertEquals("codex", parse(Map.of("TABGOBLIN_AGENT", "codex")).agent());
        assertEquals("given", parse(Map.of("TABGOBLIN_AGENT", "codex"), "--agent", "given").agent());
        // A label becomes a file name: nothing that could name another file is one.
        for (String bad : new String[] {"../pairing-token", "a/b", "a b", ".hidden", "", "x".repeat(41), "a..b"}) {
            assertThrows(UsageException.class, () -> parse(Map.of(), "--agent", bad), bad);
            assertThrows(UsageException.class, () -> parse(Map.of(), "--revoke-agent", bad), bad);
        }
        assertThrows(UsageException.class, () -> parse(Map.of(), "--agent"));
        assertEquals("ide", parse(Map.of(), "--revoke-agent", "ide").revokeAgent());
        assertEquals("ide", parse(Map.of(), "--allow-agent", "ide").allowAgent());
        assertTrue(parse(Map.of(), "--list-agents").listAgents());
    }

    @Test
    void aProcessThatServesItsAgentAloneKnowsItByItsKeyAsWell(@org.junit.jupiter.api.io.TempDir Path keys) throws Exception {
        AgentKeys.Identity none = McpMain.identityAlone(null, keys);
        assertFalse(none.persistent());
        assertTrue(none.id().startsWith("c-"));
        AgentKeys.Identity first = McpMain.identityAlone("ide", keys);
        assertTrue(first.persistent());
        assertEquals(first.id(), McpMain.identityAlone("ide", keys).id(), "the same at every start");
        AgentKeys.revoke(keys, "ide");
        AgentKeys.Identity revoked = McpMain.identityAlone("ide", keys);
        assertTrue(revoked.revoked().getAsBoolean());
        assertFalse(revoked.persistent());
        assertFalse(revoked.id().equals(first.id()));
    }

    @Test
    void aPortIsTheUsersOwnOnlyWhenTheOptionOrTheVariableNamesOne() throws Exception {
        assertFalse(parse(Map.of()).portChosen(), "none named: the list of ports holds");
        assertEquals(McpMain.DEFAULT_PORT, parse(Map.of()).port());
        assertTrue(parse(Map.of(), "--port", "5000").portChosen());
        assertTrue(parse(Map.of("TABGOBLIN_PORT", "5000")).portChosen());
        assertTrue(parse(Map.of(), "--port", String.valueOf(McpMain.DEFAULT_PORT)).portChosen(), "also the usual one, when it is named");
        assertFalse(parse(Map.of("TABGOBLIN_PORT", " ")).portChosen(), "a variable that is empty names none");
    }

    @Test
    void setupTakesTheWayTheAgentIsToReachTheToolsAndIsAsItWasWithoutOne() throws Exception {
        assertFalse(parse(Map.of(), "--setup", "claude-code").commandLine(), "as before there was a choice");
        assertFalse(parse(Map.of(), "--setup", "claude-code", "--mode", "mcp").commandLine());
        assertTrue(parse(Map.of(), "--setup", "codex", "--mode", "cli").commandLine());
        assertEquals("--mode is mcp or cli, not \"rest\".",
                assertThrows(UsageException.class, () -> parse(Map.of(), "--setup", "codex", "--mode", "rest")).getMessage());
        assertEquals("--mode goes with --setup or --install-skill.",
                assertThrows(UsageException.class, () -> parse(Map.of(), "--mode", "cli")).getMessage());
        assertTrue(parse(Map.of(), "--install-skill", "copilot", "--mode", "cli").commandLine());
        assertFalse(parse(Map.of(), "--install-skill", "copilot").commandLine());
        assertEquals("--mode needs a value.",
                assertThrows(UsageException.class, () -> parse(Map.of(), "--setup", "codex", "--mode")).getMessage());
    }

    @Test
    void howLongAnAgentOfTheCommandLineIsKeptIsTenMinutesOrWhatTheVariableSays() throws Exception {
        assertEquals(600_000, parse(Map.of()).commandIdleMs());
        assertEquals(30_000, parse(Map.of("TABGOBLIN_COMMAND_IDLE_SECONDS", "30")).commandIdleMs());
        for (String wrong : List.of("0", "-5", "soon", "86401")) {
            assertThrows(UsageException.class, () -> parse(Map.of("TABGOBLIN_COMMAND_IDLE_SECONDS", wrong)), wrong);
        }
    }

    @Test
    void aCommandLineThatBeginsWithAWordIsACommandAndTheServersOwnBeginWithAnOption() {
        assertTrue(Cli.handles(new String[] {"status", "--agent", "ide"}));
        assertTrue(Cli.handles(new String[] {"tools"}));
        for (String[] own : List.of(new String[0], new String[] {"--agent", "ide"}, new String[] {"--panel"},
                new String[] {"--setup", "codex", "--mode", "cli"}, new String[] {"-h"})) {
            assertFalse(Cli.handles(own), String.join(" ", own));
        }
        // The help names both ways, and the command line's exit codes.
        String help = McpMain.usage(false);
        assertTrue(help.contains("tools --json") && help.contains("--mode <mcp or cli>") && help.contains("4: sent, and"), help);
    }

    @Test
    void aDoubleClickOnTheDownloadsProgramIsAPersonAsATerminalIs() {
        assertTrue(McpMain.byHand(true, null));
        assertTrue(McpMain.byHand(false, "C:/somewhere/tabgoblin/TabGoblin.exe"));
        // An agent's process: pipes, and Java's own program.
        assertFalse(McpMain.byHand(false, null));
        assertFalse(McpMain.byHand(false, " "));
    }

    @Test
    void theDownloadsProgramMeansTheWindowWhateverItsArguments() {
        assertTrue(McpMain.wantsWindow(true, null));
        // Its own arguments replace the default --panel: it still means the window.
        assertTrue(McpMain.wantsWindow(false, "C:/somewhere/tabgoblin/TabGoblin.exe"));
        assertFalse(McpMain.wantsWindow(false, null));
        assertFalse(McpMain.wantsWindow(false, " "));
    }

    @Test
    void theOneServerIsStartedWithJavaEvenWhenThisProcessIsTheDownloadsProgram() {
        Path home = Path.of("download", "runtime");
        Path bin = home.resolve("bin");
        java.util.Set<Path> files = java.util.Set.of(bin.resolve("java.exe"), bin.resolve("javaw.exe"));
        // Java with a console: its sibling without one, so that no console stays with the server.
        assertEquals(bin.resolve("javaw.exe"), McpMain.launcher(bin.resolve("java.exe"), home, files::contains));
        assertEquals(bin.resolve("javaw.exe"), McpMain.launcher(bin.resolve("javaw.exe"), home, files::contains));
        // The program with the icon takes none of Java's arguments: the Java it runs on is taken.
        assertEquals(bin.resolve("javaw.exe"), McpMain.launcher(Path.of("download", "TabGoblin.exe"), home, files::contains));
        // Elsewhere there is one Java program, and it is the one running.
        Path unix = Path.of("jdk", "bin", "java");
        assertEquals(unix, McpMain.launcher(unix, Path.of("jdk"), unix::equals));
        assertEquals(Path.of("jdk", "bin", "java"), McpMain.launcher(Path.of("app", "bin", "TabGoblin"), Path.of("jdk"), unix::equals));
    }

    @Test
    void javaFxTakesItsNativeFilesFromTheDownloadsRuntimeOnly() {
        // A download's runtime holds them, and JavaFX is sent there instead of the home folder.
        Path runtime = Path.of("download", "runtime");
        Path folder = runtime.resolve("tabgoblin-javafx");
        assertEquals(folder, McpMain.nativeFiles(runtime, folder::equals));
        // Any other Java has none: JavaFX does as it always did.
        assertNull(McpMain.nativeFiles(Path.of("jdk"), path -> false));
    }

    @Test
    void whatIsSaidWhenAnInterfaceIsOffNamesTheFileAndTheEntry() {
        Path file = Path.of("somewhere", "tabgoblin.properties");
        String off = McpMain.mcpOff(file);
        assertTrue(off.contains("MCP is off") && off.contains(file.toAbsolutePath().toString()) && off.contains("interfaces = cli"), off);
        assertTrue(off.contains("Only the user can change that"), off);
        String setup = McpMain.interfaceOffForSetup(false, file);
        assertTrue(setup.contains("MCP is off") && setup.contains("--mode cli"), setup);
        assertTrue(McpMain.interfaceOffForSetup(true, file).contains("--mode mcp"));
    }
}
