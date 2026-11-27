package tabgoblin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * The command line and MCP are two adapters side by side over one core, and neither is built on
 * the other: the way of a command from the terminal to the browser runs through nothing of MCP.
 * This is what a user shows to an organisation that forbids MCP, so it is held here, by the sources.
 */
class SeparationTest {

    private static final Path SOURCES = Path.of("src", "main", "java", "tabgoblin");

    /** The classes a command runs through, from the command line to the extension's connection. */
    private static final List<String> COMMAND_LINE = List.of("Cli", "Link", "Hub", "Commands", "ToolDefs", "BrowserService",
            "WebSocketBridge", "BlockedSites", "AgentKeys", "Pairing", "Timings", "Ports");

    @Test
    void theCommandLinesWayToTheBrowserImportsNothingOfMcp() throws IOException {
        for (String name : COMMAND_LINE) {
            String source = Files.readString(SOURCES.resolve(name + ".java"), StandardCharsets.UTF_8);
            assertFalse(source.contains("io.modelcontextprotocol"), name + ".java speaks of MCP, and a command runs through it");
        }
    }

    @Test
    void onlyTheMcpAdapterImportsMcp() throws IOException {
        try (Stream<Path> files = Files.list(SOURCES)) {
            List<String> speaking = files.map(Path::getFileName).map(Path::toString).filter(file -> file.endsWith(".java"))
                    .filter(file -> {
                        try {
                            return Files.readString(SOURCES.resolve(file), StandardCharsets.UTF_8).contains("io.modelcontextprotocol");
                        } catch (IOException e) {
                            throw new java.io.UncheckedIOException(e);
                        }
                    }).sorted().toList();
            // The MCP conversation of an agent (Agent, Progress), the tool specifications and
            // the entry point that starts the jar as an MCP server (McpMain), and nothing else.
            assertEquals(List.of("Agent.java", "McpMain.java", "Progress.java"), speaking);
        }
    }

    @Test
    void bothAdaptersAreBuiltFromTheOneDefinitionOfTheTools() {
        List<String> defined = ToolDefs.ALL.stream().map(ToolDefs.Tool::name).toList();
        List<String> mcp = McpMain.toolSpecs(null, io.modelcontextprotocol.json.McpJsonDefaults.getMapper()).stream()
                .map(spec -> spec.tool().name()).toList();
        List<String> commands = Cli.tools().stream().map(ToolDefs.Tool::name).toList();
        assertEquals(defined, mcp);
        assertEquals(defined, commands);
        assertEquals(14, defined.size());
        for (ToolDefs.Tool tool : ToolDefs.ALL) {
            assertTrue(tool.title() != null && !tool.title().isBlank(), tool.name() + " has a title");
            assertTrue(tool.schema().path("properties").has("session") || tool.name().equals("browser_status"),
                    tool.name() + " takes a session");
        }
    }

    @Test
    void aToolsErrorHasItsCodeAsAFieldAndInFrontOfItsText() {
        BrowserService.ToolResult error = BrowserService.ToolResult.error("SITE_BLOCKED", "example.org is on the list.");
        assertTrue(error.isError());
        assertEquals("SITE_BLOCKED", error.code());
        assertEquals("Error [SITE_BLOCKED]: example.org is on the list.", error.text());
        BrowserService.ToolResult ok = BrowserService.ToolResult.ok("fine");
        assertFalse(ok.isError());
        assertEquals(null, ok.code());
    }
}
