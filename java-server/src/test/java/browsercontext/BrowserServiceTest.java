package browsercontext;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.modelcontextprotocol.json.McpJsonDefaults;
import io.modelcontextprotocol.server.McpServerFeatures.SyncToolSpecification;
import io.modelcontextprotocol.spec.McpSchema;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/** Tool routing: MCP tool call -> BrowserService -> WebSocket command -> rendered result. */
class BrowserServiceTest {

    WebSocketBridge bridge;
    BrowserService service;
    FakeExtension ext;

    @BeforeEach
    void start() throws Exception {
        bridge = new WebSocketBridge(0, WebSocketBridgeTest.TOKEN, FakeExtension.ORIGIN, 400);
        bridge.startAndWait();
        service = new BrowserService(bridge, null, Duration.ofMillis(500));
        ext = FakeExtension.paired(bridge.getPort(), WebSocketBridgeTest.TOKEN);
    }

    @AfterEach
    void stop() throws Exception {
        bridge.stop(500);
    }

    private static ObjectNode args() {
        return FakeExtension.JSON.createObjectNode();
    }

    private JsonNode lastCommand() {
        return ext.commands.get(ext.commands.size() - 1);
    }

    @Test
    void routesEveryToolToItsGenericAction() {
        service.call("browser_snapshot", args().put("interactive_only", true).put("viewport_only", true));
        assertEquals("snapshot", lastCommand().path("action").asString());
        assertTrue(lastCommand().path("params").path("interactiveOnly").asBoolean());
        assertTrue(lastCommand().path("params").path("viewportOnly").asBoolean());

        service.call("browser_extract", args().put("max_chars", 1000).put("offset", 50));
        assertEquals("extract", lastCommand().path("action").asString());
        assertEquals(1000, lastCommand().path("params").path("maxChars").asInt());
        assertEquals(50, lastCommand().path("params").path("offset").asInt());

        service.call("browser_click", args().put("ref", 7));
        assertEquals("click", lastCommand().path("action").asString());
        assertEquals(7, lastCommand().path("params").path("ref").asInt());
        assertEquals("interact", lastCommand().path("params").path("intent").asString());

        service.call("browser_click", args().put("ref", 8).put("intent", "submit"));
        assertEquals("submit", lastCommand().path("params").path("intent").asString());

        service.call("browser_fill", args().put("ref", 3).put("text", "hello"));
        assertEquals("fill", lastCommand().path("action").asString());
        assertEquals("hello", lastCommand().path("params").path("text").asString());
        assertFalse(lastCommand().path("params").path("append").asBoolean());

        service.call("browser_scroll", args().put("direction", "up").put("amount", 300).put("ref", 4));
        assertEquals("scroll", lastCommand().path("action").asString());
        assertEquals("up", lastCommand().path("params").path("direction").asString());
        assertEquals(300, lastCommand().path("params").path("amount").asInt());
        assertEquals(4, lastCommand().path("params").path("ref").asInt());

        service.call("browser_navigate", args().put("url", "/page2"));
        assertEquals("navigate", lastCommand().path("action").asString());
        assertEquals("/page2", lastCommand().path("params").path("url").asString());

        service.call("browser_wait_for", args().put("text", "Saved").put("timeout_ms", 1500));
        assertEquals("wait_for", lastCommand().path("action").asString());
        assertEquals("Saved", lastCommand().path("params").path("text").asString());
        assertEquals(1500, lastCommand().path("params").path("timeoutMs").asInt());

        assertEquals(8, ext.commands.size());
    }

    @Test
    void rendersTextResultsVerbatimAndOthersAsJson() {
        ext.responder = cmd -> FakeExtension.ok(cmd, args().put("text", "Page: Demo\n[1] Button: Go"));
        BrowserService.ToolResult snapshot = service.call("browser_snapshot", args());
        assertFalse(snapshot.isError());
        assertEquals("Page: Demo\n[1] Button: Go", snapshot.text());

        ext.responder = cmd -> FakeExtension.ok(cmd, args().put("dispatched", true));
        BrowserService.ToolResult click = service.call("browser_click", args().put("ref", 1));
        assertTrue(click.text().contains("\"dispatched\" : true"), click.text());
    }

    @Test
    void screenshotBecomesAnMcpImageResult() {
        ext.responder = cmd -> FakeExtension.ok(cmd, args().put("data", "QUJD").put("mimeType", "image/jpeg"));
        BrowserService.ToolResult r = service.call("browser_screenshot", args());
        assertEquals("QUJD", r.imageBase64());
        assertEquals("image/jpeg", r.imageMimeType());
        assertNull(r.text());

        McpSchema.CallToolResult mcp = McpMain.toMcp(r);
        McpSchema.ImageContent image = (McpSchema.ImageContent) mcp.content().get(0);
        assertEquals("QUJD", image.data());
        assertEquals("image/jpeg", image.mimeType());
    }

    @Test
    void screenshotCarriesTheCoverageNoteAheadOfTheImage() {
        String note = "This image shows only the visible viewport: 0-900px of a 6901px tall page (about 13%).";
        ext.responder = cmd -> FakeExtension.ok(cmd,
                args().put("data", "QUJD").put("mimeType", "image/jpeg").put("note", note));
        McpSchema.CallToolResult mcp = McpMain.toMcp(service.call("browser_screenshot", args()));
        assertEquals(2, mcp.content().size());
        assertEquals(note, ((McpSchema.TextContent) mcp.content().get(0)).text());
        assertEquals("QUJD", ((McpSchema.ImageContent) mcp.content().get(1)).data());
    }

    @Test
    void invalidArgumentsAreRejectedBeforeReachingTheBrowser() {
        assertTrue(service.call("browser_click", args()).text().startsWith("Error [INVALID_ARGUMENT]"));
        assertTrue(service.call("browser_click", args().put("ref", 1).put("intent", "yolo")).isError());
        assertTrue(service.call("browser_fill", args().put("ref", 1)).isError());
        assertTrue(service.call("browser_fill",
                args().put("ref", 1).put("text", "x".repeat(BrowserService.MAX_FILL_CHARS + 1))).isError());
        assertTrue(service.call("browser_scroll", args().put("direction", "sideways")).isError());
        assertTrue(service.call("browser_navigate", args()).isError());
        assertTrue(service.call("browser_wait_for", args()).isError());
        assertTrue(service.call("browser_wait_for", args().put("text", "a").put("ref", 1)).isError());
        assertTrue(service.call("browser_wait_for", args().put("text", "a").put("timeout_ms", 999_999)).isError());
        assertTrue(ext.commands.isEmpty());
    }

    @Test
    void thereIsNoScriptEvaluationOrCookieTool() {
        for (String forbidden : List.of("browser_evaluate", "browser_cookies", "browser_storage", "browser_request")) {
            BrowserService.ToolResult r = service.call(forbidden, args().put("script", "document.cookie"));
            assertTrue(r.text().startsWith("Error [UNKNOWN_TOOL]"), forbidden);
        }
        assertTrue(ext.commands.isEmpty());
    }

    @Test
    void extensionErrorsComeBackAsClearToolErrors() {
        ext.responder = cmd -> FakeExtension.fail(cmd, "NAVIGATION_BLOCKED",
                "Destination is outside the authorized origin.");
        BrowserService.ToolResult r = service.call("browser_navigate", args().put("url", "https://other.example/"));
        assertTrue(r.isError());
        assertEquals("Error [NAVIGATION_BLOCKED]: Destination is outside the authorized origin.", r.text());
    }

    @Test
    void timedOutClickIsReportedAndNeverRetried() throws Exception {
        ext.responder = cmd -> null;
        BrowserService.ToolResult r = service.call("browser_click", args().put("ref", 2));
        assertTrue(r.text().startsWith("Error [TIMEOUT]"), r.text());
        assertTrue(r.text().contains("not retried"));
        Thread.sleep(300);
        assertEquals(1, ext.commands.size());
    }

    @Test
    void statusDescribesAuthorizationReportedByTheExtension() {
        ext.responder = cmd -> {
            ObjectNode s = args().put("authorized", true).put("origin", "https://example.com").put("access", "write")
                    .put("paused", false).put("confirmSubmissions", true);
            s.putObject("tab").put("title", "Example").put("url", "https://example.com/page");
            return FakeExtension.ok(cmd, s);
        };
        String text = service.call("browser_status", args()).text();
        assertTrue(text.contains("Extension: connected"));
        assertTrue(text.contains("Authorized origin: https://example.com"));
        assertTrue(text.contains("Access: read/write"));
        assertTrue(text.contains("URL: https://example.com/page"));
    }

    @Test
    void withoutAnExtensionStatusExplainsAndOtherToolsFailClearly() throws Exception {
        ext.closeBlocking();
        for (int i = 0; i < 50 && bridge.isExtensionConnected(); i++) {
            Thread.sleep(20);
        }
        BrowserService.ToolResult status = service.call("browser_status", args());
        assertFalse(status.isError());
        assertTrue(status.text().contains("Extension: not connected"));
        assertTrue(service.call("browser_snapshot", args()).text().startsWith("Error [NOT_CONNECTED]"));
    }

    @Test
    void mcpLayerExposesExactlyTheGenericToolsAndRoutesCalls() {
        List<SyncToolSpecification> specs = McpMain.toolSpecs(service, McpJsonDefaults.getMapper());
        assertEquals(List.of("browser_status", "browser_snapshot", "browser_extract", "browser_click",
                "browser_fill", "browser_scroll", "browser_navigate", "browser_screenshot", "browser_wait_for"),
                specs.stream().map(s -> s.tool().name()).toList());

        ext.responder = cmd -> FakeExtension.ok(cmd, args().put("text", "filled"));
        SyncToolSpecification fill = specs.stream()
                .filter(s -> s.tool().name().equals("browser_fill")).findFirst().orElseThrow();
        McpSchema.CallToolResult result = fill.callHandler().apply(null,
                new McpSchema.CallToolRequest("browser_fill", Map.of("ref", 5, "text", "hi")));
        assertFalse(result.isError());
        assertEquals("filled", ((McpSchema.TextContent) result.content().get(0)).text());
        assertEquals("fill", lastCommand().path("action").asString());
        assertEquals(5, lastCommand().path("params").path("ref").asInt());

        for (SyncToolSpecification spec : specs) {
            assertEquals("object", spec.tool().inputSchema().get("type"));
        }
    }
}
