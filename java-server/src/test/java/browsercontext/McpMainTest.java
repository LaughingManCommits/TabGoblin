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

    private static Options parse(Map<String, String> environment, String... args) throws UsageException {
        return Options.parse(args, environment::get);
    }

    @Test
    void anOptionComesBeforeTheEnvironmentAndThatBeforeTheDefault() throws Exception {
        Options defaults = parse(Map.of());
        assertEquals(McpMain.DEFAULT_PORT, defaults.port());
        assertEquals(Pairing.defaultTokenFile(), defaults.tokenFile());
        assertEquals(McpMain.DEFAULT_EXTENSION_ORIGIN, defaults.extensionOrigin());
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

        assertTrue(parse(Map.of(), "--help").help());
        assertTrue(parse(Map.of(), "-h").help());
        assertTrue(parse(Map.of(), "--show-token", "--port", "6000").showToken());
        assertTrue(parse(Map.of(), "--rotate-token").rotateToken());
    }

    @Test
    void aCommandLineThatIsNotUnderstoodIsRefusedAndSaysWhy() {
        // A mistyped command used to start a server that waits for a client.
        assertEquals("Unknown option: --show-tokn",
                assertThrows(UsageException.class, () -> parse(Map.of(), "--show-tokn")).getMessage());
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
            }, clipboard::add);
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
            assertFalse(McpMain.showPanel(null, null, () -> "not asked for", () -> false));
            assertEquals(before + 1, Log.count());
            Log.Line said = Log.recent().get(Log.recent().size() - 1);
            assertEquals("warn", said.level());
            assertEquals("panel not shown reason=no_display", said.text());
        } finally {
            Log.keep(0);
        }
    }
}
