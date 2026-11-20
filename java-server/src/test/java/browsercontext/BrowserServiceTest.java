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

    private JsonNode lastParams() {
        return lastCommand().path("params");
    }

    @Test
    void routesEveryToolToItsGenericAction() {
        service.call("browser_snapshot", args().put("interactive_only", true).put("viewport_only", true)
                .put("ref", 9).put("max_lines", 50).put("start_line", 100).put("diff", true));
        assertEquals("snapshot", lastCommand().path("action").asString());
        assertTrue(lastParams().path("interactiveOnly").asBoolean());
        assertTrue(lastParams().path("viewportOnly").asBoolean());
        assertTrue(lastParams().path("diff").asBoolean());
        assertEquals(9, lastParams().path("ref").asInt());
        assertEquals(50, lastParams().path("maxLines").asInt());
        assertEquals(100, lastParams().path("startLine").asInt());

        service.call("browser_extract", args().put("max_chars", 1000).put("offset", 50).put("outline", true)
                .put("ref", 4).put("main_only", true).put("links", "url"));
        assertEquals("extract", lastCommand().path("action").asString());
        assertEquals(1000, lastParams().path("maxChars").asInt());
        assertEquals(50, lastParams().path("offset").asInt());
        assertTrue(lastParams().path("outline").asBoolean());
        assertTrue(lastParams().path("mainOnly").asBoolean());
        assertEquals("url", lastParams().path("links").asString());
        assertEquals(4, lastParams().path("ref").asInt());

        service.call("browser_click", args().put("ref", 7));
        assertEquals("click", lastCommand().path("action").asString());
        assertEquals(7, lastParams().path("ref").asInt());
        assertEquals("interact", lastParams().path("intent").asString());
        service.call("browser_click", args().put("ref", 8).put("intent", "submit"));
        assertEquals("submit", lastParams().path("intent").asString());

        service.call("browser_fill", args().put("ref", 3).put("text", "hello"));
        assertEquals("fill", lastCommand().path("action").asString());
        assertEquals("hello", lastParams().path("text").asString());
        assertFalse(lastParams().path("append").asBoolean());
        assertEquals("set", lastParams().path("method").asString());
        service.call("browser_fill", args().put("ref", 3).put("text", "").put("method", "type"));
        assertEquals("type", lastParams().path("method").asString());

        service.call("browser_press_key", args().put("key", "Enter").put("ref", 3).put("intent", "submit"));
        assertEquals("press_key", lastCommand().path("action").asString());
        assertEquals("Enter", lastParams().path("key").asString());
        assertEquals(3, lastParams().path("ref").asInt());
        assertEquals("submit", lastParams().path("intent").asString());

        service.call("browser_scroll", args().put("direction", "up").put("amount", 300).put("ref", 4));
        assertEquals("scroll", lastCommand().path("action").asString());
        assertEquals("up", lastParams().path("direction").asString());
        assertEquals(300, lastParams().path("amount").asInt());

        service.call("browser_navigate", args().put("url", "/page2"));
        assertEquals("navigate", lastCommand().path("action").asString());
        assertEquals("/page2", lastParams().path("url").asString());
        service.call("browser_navigate", args().put("history", "back"));
        assertEquals("back", lastParams().path("history").asString());
        assertFalse(lastParams().has("url"));

        service.call("browser_wait_for", args().put("text", "Saved").put("timeout_ms", 1500));
        assertEquals("wait_for", lastCommand().path("action").asString());
        assertEquals("Saved", lastParams().path("text").asString());
        assertEquals("visible", lastParams().path("condition").asString());
        assertEquals(1500, lastParams().path("timeoutMs").asInt());
        service.call("browser_wait_for", args().put("ref", 5).put("condition", "enabled"));
        assertEquals("enabled", lastParams().path("condition").asString());
        service.call("browser_wait_for", args().put("text", "Loading").put("gone", true));
        assertEquals("gone", lastParams().path("condition").asString());

        assertEquals(13, ext.commands.size());
    }

    @Test
    void everyToolIsBoundToTheSessionTheAgentNames() {
        service.call("browser_snapshot", args().put("session", "s2"));
        assertEquals("s2", lastCommand().path("session").asString());
        service.call("browser_click", args().put("session", "s7").put("ref", 1));
        assertEquals("s7", lastCommand().path("session").asString());
        service.call("browser_screenshot", args().put("session", "s3"));
        assertEquals("s3", lastCommand().path("session").asString());

        // Without a session the extension resolves this agent's only session.
        service.call("browser_snapshot", args());
        assertFalse(lastCommand().has("session"));

        int sent = ext.commands.size();
        for (String bad : List.of("1", "S1", "s", "s1; drop", "../s1", "tab-41")) {
            assertTrue(service.call("browser_snapshot", args().put("session", bad)).text()
                    .startsWith("Error [INVALID_ARGUMENT]"), bad);
        }
        assertEquals(sent, ext.commands.size());
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
        assertTrue(service.call("browser_fill", args().put("ref", 1).put("method", "type")
                .put("text", "x".repeat(BrowserService.MAX_TYPE_CHARS + 1))).isError());
        assertTrue(service.call("browser_fill", args().put("ref", 1).put("text", "x").put("method", "paste")).isError());
        assertTrue(service.call("browser_press_key", args()).isError());
        assertTrue(service.call("browser_press_key", args().put("key", "x".repeat(40))).isError());
        assertTrue(service.call("browser_scroll", args().put("direction", "sideways")).isError());
        assertTrue(service.call("browser_navigate", args()).isError());
        assertTrue(service.call("browser_navigate", args().put("url", "/a").put("history", "back")).isError());
        assertTrue(service.call("browser_navigate", args().put("history", "sideways")).isError());
        assertTrue(service.call("browser_snapshot", args().put("max_lines", 5)).isError());
        assertTrue(service.call("browser_extract", args().put("links", "html")).isError());
        assertTrue(service.call("browser_wait_for", args()).isError());
        assertTrue(service.call("browser_wait_for", args().put("text", "a").put("ref", 1)).isError());
        assertTrue(service.call("browser_wait_for", args().put("text", "a").put("timeout_ms", 999_999)).isError());
        assertTrue(service.call("browser_wait_for", args().put("text", "a").put("condition", "enabled")).isError());
        assertTrue(service.call("browser_submit", args()).isError());
        assertTrue(service.call("browser_submit", args().put("ref", 1).put("submission_id", "has space")).isError());
        assertTrue(service.call("browser_submit", args().put("ref", 1).put("fields", "nope")).isError());
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
    void submitForwardsFieldsExpectationAndAnId() {
        ext.responder = cmd -> FakeExtension.ok(cmd, args().put("state", "CONFIRMED").put("submissionId",
                cmd.path("params").path("submissionId").asString()));
        ObjectNode a = args().put("ref", 12).put("expect_text", "Thanks for your comment").put("session", "s1");
        a.putArray("fields").addObject().put("ref", 10).put("text", "Looks good");
        BrowserService.ToolResult r = service.call("browser_submit", a);
        assertFalse(r.isError(), r.text());
        assertEquals("submit", lastCommand().path("action").asString());
        assertEquals("s1", lastCommand().path("session").asString());
        assertEquals(12, lastParams().path("ref").asInt());
        assertEquals("Thanks for your comment", lastParams().path("expectText").asString());
        assertEquals(10, lastParams().path("fields").get(0).path("ref").asInt());
        assertEquals("Looks good", lastParams().path("fields").get(0).path("text").asString());
        assertTrue(lastParams().path("submissionId").asString().matches("sub-[0-9a-f]{12}"));
        assertFalse(lastParams().path("repeat").asBoolean());
        assertTrue(r.text().contains("CONFIRMED"));
    }

    @Test
    void aSubmissionIdIsNeverSentTwice() {
        ext.responder = cmd -> FakeExtension.ok(cmd, args().put("state", "CONFIRMED"));
        ObjectNode a = args().put("ref", 12).put("submission_id", "comment-1");
        assertFalse(service.call("browser_submit", a).isError());
        assertEquals(1, ext.commands.size());

        BrowserService.ToolResult again = service.call("browser_submit", a);
        assertFalse(again.isError());
        assertTrue(again.text().contains("NOT sent again"), again.text());
        assertTrue(again.text().contains("CONFIRMED"));
        assertEquals(1, ext.commands.size(), "the same submission id must not reach the browser twice");

        assertFalse(service.call("browser_submit", args().put("ref", 12).put("submission_id", "comment-2")).isError());
        assertEquals(2, ext.commands.size());
    }

    @Test
    void anUnansweredSubmissionIsRecordedUncertainAndNotRepeated() throws Exception {
        ext.responder = cmd -> {
            ext.close();
            return null;
        };
        ObjectNode a = args().put("ref", 12).put("submission_id", "order-7");
        BrowserService.ToolResult lost = service.call("browser_submit", a);
        assertTrue(lost.text().startsWith("Error [CONNECTION_LOST]"), lost.text());
        assertTrue(lost.text().contains("recorded as UNCERTAIN"), lost.text());

        FakeExtension reconnected = FakeExtension.paired(bridge.getPort(), WebSocketBridgeTest.TOKEN);
        BrowserService.ToolResult again = service.call("browser_submit", a);
        assertTrue(again.text().contains("NOT sent again"), again.text());
        assertTrue(again.text().contains("UNCERTAIN"), again.text());
        assertTrue(reconnected.commands.isEmpty(), "an uncertain submission must never be repeated automatically");
    }

    @Test
    void aSubmissionRefusedBeforeDispatchMayBeTriedAgainWithTheSameId() {
        ext.responder = cmd -> FakeExtension.fail(cmd, "WRITE_NOT_AUTHORIZED", "Needs Write access.");
        ObjectNode a = args().put("ref", 12).put("submission_id", "comment-9");
        assertTrue(service.call("browser_submit", a).text().startsWith("Error [WRITE_NOT_AUTHORIZED]"));
        ext.responder = cmd -> FakeExtension.ok(cmd, args().put("state", "CONFIRMED"));
        assertTrue(service.call("browser_submit", a).text().contains("CONFIRMED"));
        assertEquals(2, ext.commands.size());
    }

    @Test
    void statusListsEverySessionOfThisAgent() {
        ext.responder = cmd -> {
            ObjectNode s = args().put("confirmSubmissions", true);
            ObjectNode one = s.putArray("sessions").addObject().put("session", "s1")
                    .put("origin", "https://example.com").put("mode", "write").put("paused", false).put("owner", "you");
            one.putObject("tab").put("title", "Example").put("url", "https://example.com/page");
            ((tools.jackson.databind.node.ArrayNode) s.path("sessions")).addObject().put("session", "s4")
                    .put("origin", "https://docs.example").put("mode", "explore").put("paused", true)
                    .put("owner", "unclaimed");
            return FakeExtension.ok(cmd, s);
        };
        String text = service.call("browser_status", args()).text();
        assertTrue(text.contains("Extension: connected (protocol 2)"), text);
        assertTrue(text.contains("This agent: " + bridge.clientId()));
        assertTrue(text.contains("Sessions: 2 (pass session=<id> to every tool)"));
        assertTrue(text.contains("Session s1\n  Authorized origin: https://example.com\n  Access: read/write\n  Paused: no"));
        assertTrue(text.contains("  URL: https://example.com/page"));
        assertTrue(text.contains("Session s4\n  Authorized origin: https://docs.example\n  Access: explore"));
        assertTrue(text.contains("  Paused: yes\n  Owner: not yet claimed"));
        assertFalse(lastCommand().has("session"));
    }

    @Test
    void statusWithoutSessionsTellsTheAgentWhatToAskFor() {
        ext.responder = cmd -> {
            ObjectNode s = args().put("confirmSubmissions", false);
            s.putArray("sessions");
            return FakeExtension.ok(cmd, s);
        };
        String text = service.call("browser_status", args()).text();
        assertTrue(text.contains("Authorized origin: none"));
        assertTrue(text.contains("Submissions need user confirmation: no"));
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
                "browser_fill", "browser_press_key", "browser_scroll", "browser_navigate", "browser_screenshot",
                "browser_wait_for", "browser_submit"),
                specs.stream().map(s -> s.tool().name()).toList());

        ext.responder = cmd -> FakeExtension.ok(cmd, args().put("text", "filled"));
        SyncToolSpecification fill = specs.stream()
                .filter(s -> s.tool().name().equals("browser_fill")).findFirst().orElseThrow();
        McpSchema.CallToolResult result = fill.callHandler().apply(null,
                new McpSchema.CallToolRequest("browser_fill", Map.of("ref", 5, "text", "hi", "session", "s2")));
        assertFalse(result.isError());
        assertEquals("filled", ((McpSchema.TextContent) result.content().get(0)).text());
        assertEquals("fill", lastCommand().path("action").asString());
        assertEquals("s2", lastCommand().path("session").asString());
        assertEquals(5, lastParams().path("ref").asInt());

        for (SyncToolSpecification spec : specs) {
            Map<String, Object> schema = spec.tool().inputSchema();
            assertEquals("object", schema.get("type"), spec.tool().name());
            if (!spec.tool().name().equals("browser_status")) {
                assertTrue(((Map<?, ?>) schema.get("properties")).containsKey("session"),
                        spec.tool().name() + " must be bindable to a session");
            }
        }
    }
}
