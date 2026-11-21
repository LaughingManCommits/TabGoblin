package browsercontext;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import browsercontext.McpMain.Options;
import browsercontext.McpMain.UsageException;
import java.nio.file.Path;
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
}
