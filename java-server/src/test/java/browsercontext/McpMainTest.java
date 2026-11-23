package browsercontext;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import browsercontext.McpMain.Options;
import browsercontext.McpMain.UsageException;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class McpMainTest {

    @Test
    void theTokenIsShownWithWhoseItIsAndNoneIsMadeForTheAsking() {
        String token = "0123456789abcdef".repeat(4);
        // A server runs: this is its token.
        assertEquals("Pairing token: " + token + "\nPort:          47821\n"
                + "It is the token of the server that is running now. A server makes a new one every time it starts.",
                McpMain.tokenShown(token, 47821, true));
        // None answers: the token in the file is from an earlier start, and the next start replaces it.
        String stale = McpMain.tokenShown(token, 47821, false);
        assertTrue(stale.startsWith("Pairing token: " + token + "\nPort:          47821\n"), stale);
        assertTrue(stale.contains("No TabGoblin server answers on port 47829."), stale);
        assertTrue(stale.contains("this token is of no use"), stale);
        // No token yet: nothing is printed that could be pasted.
        String none = McpMain.tokenShown("", 47821, false);
        assertTrue(none.startsWith("There is no pairing token yet: a server makes one when it starts."), none);
        assertFalse(none.contains("Pairing token:"), none);
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

        Map<String, String> environment = Map.of("BCMCP_PORT", "5000", "BCMCP_TOKEN_FILE", "from-env", "BCMCP_EXTENSION_ORIGIN", "chrome-extension://env");
        Options fromEnvironment = parse(environment);
        assertEquals(5000, fromEnvironment.port());
        assertEquals(Path.of("from-env"), fromEnvironment.tokenFile());
        assertEquals("chrome-extension://env", fromEnvironment.extensionOrigin());

        Options fromOptions = parse(environment, "--port", "6000", "--token-file", "given", "--extension-origin", "chrome-extension://given");
        assertEquals(6000, fromOptions.port());
        assertEquals(Path.of("given"), fromOptions.tokenFile());
        assertEquals("chrome-extension://given", fromOptions.extensionOrigin());
        assertEquals(Path.of("env.properties"), parse(Map.of("BCMCP_SETTINGS", "env.properties")).settings());
        assertEquals(Path.of("given.properties"),
                parse(Map.of("BCMCP_SETTINGS", "env.properties"), "--settings", "given.properties").settings());

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
    void aCommandLineThatIsNotUnderstoodIsRefusedAndSaysWhy() {
        // A mistyped command used to start a server that waits for a client.
        assertEquals("Unknown option: --show-tokn",
                assertThrows(UsageException.class, () -> parse(Map.of(), "--show-tokn")).getMessage());
        assertEquals("There is no skill for \"cursor\". There is one for each of: claude-code, codex, copilot.",
                assertThrows(UsageException.class, () -> parse(Map.of(), "--install-skill", "cursor")).getMessage());
        assertEquals("--install-skill needs a value.",
                assertThrows(UsageException.class, () -> parse(Map.of(), "--install-skill")).getMessage());
        assertEquals("--replace goes with --install-skill.",
                assertThrows(UsageException.class, () -> parse(Map.of(), "--replace")).getMessage());
        assertEquals("Unknown option: status",
                assertThrows(UsageException.class, () -> parse(Map.of(), "status")).getMessage());
        assertEquals("--port needs a value.",
                assertThrows(UsageException.class, () -> parse(Map.of(), "--port")).getMessage());
        assertEquals("--token-file needs a value.",
                assertThrows(UsageException.class, () -> parse(Map.of(), "--token-file", "--show-token")).getMessage());
        assertTrue(assertThrows(UsageException.class, () -> parse(Map.of(), "--port", "abc")).getMessage().contains("must be a number"));
        assertTrue(assertThrows(UsageException.class, () -> parse(Map.of("BCMCP_PORT", "70000"))).getMessage().contains("between 1 and"));
        assertTrue(assertThrows(UsageException.class, () -> parse(Map.of(), "--port", "0")).getMessage().contains("between 1 and"));
    }

    @Test
    void thePanelIsAskedForAndIsOffWithoutThat() throws Exception {
        // Headless is what a server is unless it is told otherwise: agents, CI and machines without a display.
        assertFalse(parse(Map.of()).panel());
        assertTrue(parse(Map.of(), "--panel").panel());
        assertTrue(parse(Map.of(), "--port", "6000", "--panel").panel());
        for (String on : List.of("1", "true", "yes", "on", "ON", " 1 ")) {
            assertTrue(parse(Map.of("BCMCP_PANEL", on)).panel(), on);
        }
        for (String off : List.of("0", "false", "no", "off", "", "  ")) {
            assertFalse(parse(Map.of("BCMCP_PANEL", off)).panel(), off);
        }
        // The option is enough where the environment says no: an option comes before the environment.
        assertTrue(parse(Map.of("BCMCP_PANEL", "0"), "--panel").panel());
        // A value that is neither is not taken for one of them.
        assertEquals("BCMCP_PANEL must be 1 or 0, not \"maybe\".",
                assertThrows(UsageException.class, () -> parse(Map.of("BCMCP_PANEL", "maybe"))).getMessage());
        assertEquals("Unknown option: --panel=1",
                assertThrows(UsageException.class, () -> parse(Map.of(), "--panel=1")).getMessage());

        // Whether the window may come up by itself when the browser has to be paired: it may, unless it is said not to.
        assertFalse(parse(Map.of()).quiet());
        assertFalse(parse(Map.of(), "--panel").quiet());
        assertFalse(parse(Map.of("BCMCP_PANEL", "1")).quiet());
        assertFalse(parse(Map.of("BCMCP_PANEL", " ")).quiet());
        assertTrue(parse(Map.of(), "--no-panel").quiet());
        assertFalse(parse(Map.of(), "--no-panel").panel());
        for (String off : new String[] {"0", "false", "no", "OFF"}) {
            assertTrue(parse(Map.of("BCMCP_PANEL", off)).quiet(), off);
        }
        // The command line wins over the environment, either way.
        assertFalse(parse(Map.of("BCMCP_PANEL", "0"), "--panel").quiet());
        Options silenced = parse(Map.of("BCMCP_PANEL", "1"), "--no-panel");
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
}
