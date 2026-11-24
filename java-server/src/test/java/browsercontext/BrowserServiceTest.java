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

    /** Arguments with a list of refs. */
    private static ObjectNode refs(int... refs) {
        ObjectNode a = args();
        for (int ref : refs) {
            a.withArray("refs").add(ref);
        }
        if (refs.length == 0) {
            a.putArray("refs");
        }
        return a;
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
        // A plain extract carries none of the arguments for parts of a page.
        for (String name : List.of("find", "regex", "contextLines", "maxMatches", "kind", "refs")) {
            assertTrue(lastParams().path(name).isMissingNode(), name);
        }

        service.call("browser_extract", args().put("find", "ERROR").put("main_only", true));
        assertEquals("ERROR", lastParams().path("find").asString());
        assertFalse(lastParams().path("regex").asBoolean());
        assertEquals(2, lastParams().path("contextLines").asInt());
        assertEquals(20, lastParams().path("maxMatches").asInt());
        ObjectNode parts = args().put("find", "^\\s+at ").put("regex", true).put("context_lines", 0)
                .put("max_matches", 200).put("kind", "code").put("max_chars", 500);
        parts.putArray("refs").add(4).add(9);
        service.call("browser_extract", parts);
        assertEquals("^\\s+at ", lastParams().path("find").asString());
        assertTrue(lastParams().path("regex").asBoolean());
        assertEquals(0, lastParams().path("contextLines").asInt());
        assertEquals(200, lastParams().path("maxMatches").asInt());
        assertEquals("code", lastParams().path("kind").asString());
        assertEquals(List.of(4, 9), List.of(lastParams().path("refs").get(0).asInt(), lastParams().path("refs").get(1).asInt()));
        assertTrue(lastParams().path("ref").isMissingNode());
        // A search goes on from an offset, in the page or in one section.
        service.call("browser_extract", args().put("find", "x").put("offset", 700).put("ref", 4));
        assertEquals(700, lastParams().path("offset").asInt());
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

        assertEquals(16, ext.commands.size());
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

        McpSchema.CallToolResult mcp = McpMain.toMcp("browser_screenshot", r);
        McpSchema.ImageContent image = (McpSchema.ImageContent) mcp.content().get(0);
        assertEquals("QUJD", image.data());
        assertEquals("image/jpeg", image.mimeType());
    }

    @Test
    void screenshotCarriesTheCoverageNoteAheadOfTheImage() {
        String note = "This image shows only the visible viewport: 0-900px of a 6901px tall page (about 13%).";
        ext.responder = cmd -> FakeExtension.ok(cmd,
                args().put("data", "QUJD").put("mimeType", "image/jpeg").put("note", note));
        McpSchema.CallToolResult mcp = McpMain.toMcp("browser_screenshot", service.call("browser_screenshot", args()));
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
        int sent = ext.commands.size();
        for (ObjectNode bad : List.of(
                args().put("find", ""),
                args().put("find", "x".repeat(201)),
                args().put("find", 5),
                args().put("find", "x").put("outline", true),
                args().put("find", "x").put("context_lines", 21),
                args().put("find", "x").put("context_lines", -1),
                args().put("find", "x").put("max_matches", 0),
                args().put("find", "x").put("max_matches", 201),
                args().put("regex", true),
                args().put("kind", "pictures"),
                args().put("kind", "tables").put("outline", true),
                args().put("refs", 4),
                refs(),
                refs(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11),
                refs(4).put("ref", 4),
                refs(4).put("outline", true),
                refs(4).put("offset", 10),
                args().set("refs", args().arrayNode().add("4")))) {
            BrowserService.ToolResult refused = service.call("browser_extract", bad);
            assertTrue(refused.isError(), bad.toString());
            assertTrue(refused.text().contains("INVALID_ARGUMENT"), refused.text());
        }
        assertEquals(sent, ext.commands.size(), "a refused call sends nothing");
        assertTrue(service.call("browser_extract", args().put("find", "x").put("outline", true)).text()
                .contains("find cannot be combined with outline"));
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
    void statusSaysWhenASessionAsksDifferentlyFromTheGeneralSetting() {
        ext.responder = cmd -> {
            ObjectNode s = args().put("confirmSubmissions", false).put("confirmation", "never");
            tools.jackson.databind.node.ArrayNode sessions = s.putArray("sessions");
            sessions.addObject().put("session", "s1").put("origin", "https://chat.example").put("mode", "write")
                    .put("paused", false).put("owner", "you").put("confirmation", "auto");
            sessions.addObject().put("session", "s2").put("origin", "https://example.com").put("mode", "write")
                    .put("paused", false).put("owner", "you").put("confirmation", "never");
            // Without write access nothing can be submitted: the setting says nothing there.
            sessions.addObject().put("session", "s3").put("origin", "https://docs.example").put("mode", "explore")
                    .put("paused", false).put("owner", "you").put("confirmation", "always");
            return FakeExtension.ok(cmd, s);
        };
        String text = service.call("browser_status", args()).text();
        assertTrue(text.contains("Submissions need user confirmation: no (only high-impact ones are put to the user)\n"), text);
        assertTrue(text.contains("Session s1\n  Authorized origin: https://chat.example\n  Access: read/write\n  Paused: no\n"
                + "  Submissions need user confirmation in this session: yes, the first time for each control; "
                + "what the user allowed passes for a while\n"), text);
        assertEquals(1, text.split("in this session", -1).length - 1, text);
    }

    @Test
    void statusWithDiagnosticsSaysWhereTheTimeWent() {
        ext.responder = cmd -> {
            if (cmd.path("action").asString("").equals("status")) {
                ObjectNode s = args().put("confirmSubmissions", true);
                s.putArray("sessions");
                return FakeExtension.ok(cmd, s);
            }
            // A submission that ran for 2.4 seconds, of which the user took 2 to answer.
            ObjectNode answer = (ObjectNode) FakeExtension.ok(cmd, args().put("state", "CONFIRMED"));
            answer.putObject("timing").put("ran", 2400).put("queued", 0).put("asked", 2000);
            return answer;
        };
        assertFalse(service.call("browser_status", args().put("diagnostics", true)).text().contains("Where the time went"),
                "the call that asks is the first: there is nothing to report yet");
        assertTrue(service.call("browser_submit", args().put("ref", 12)).text().contains("CONFIRMED"));
        String text = service.call("browser_status", args().put("diagnostics", true)).text();
        assertTrue(text.contains("Where the time went, over the last 2 tool calls"), text);
        assertTrue(text.contains("waiting for the user's answer (median 1.0 s, longest 2.0 s)"), text);
        assertTrue(text.contains("  browser_submit "), text);
        assertTrue(text.contains(": user 2.0 s, extension and page 400 ms"), text);
        assertTrue(text.contains("  browser_status "), text);
        // Only when asked for.
        assertFalse(service.call("browser_status", args()).text().contains("Where the time went"));
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
    void withoutABrowserAToolSaysWhatTheUserHasToDoAndWhereTheTokenIs() throws Exception {
        // Whoever serves the agent is asked what is known of the browser, and may bring the window up.
        java.util.concurrent.atomic.AtomicInteger asked = new java.util.concurrent.atomic.AtomicInteger();
        java.util.concurrent.atomic.AtomicReference<BrowserService.Unpaired> known =
                new java.util.concurrent.atomic.AtomicReference<>(BrowserService.Unpaired.NOTHING_KNOWN);
        BrowserService asking = new BrowserService(bridge, null, Duration.ofMillis(500), Duration.ZERO, () -> {
            asked.incrementAndGet();
            return known.get();
        });
        // While a browser is paired, nobody is asked: a tool that works brings no window up.
        ext.responder = cmd -> FakeExtension.ok(cmd, FakeExtension.JSON.createObjectNode());
        asking.call("browser_status", args());
        assertEquals(0, asked.get());

        // The browser is gone, as when Chrome is closed, and nothing is wrong with its token.
        ext.closeBlocking();
        for (int i = 0; i < 50 && bridge.isExtensionConnected(); i++) {
            Thread.sleep(20);
        }
        String head = "Extension: not connected\nListening on: ws://127.0.0.1:" + bridge.getPort() + "\n";
        String waiting = "An extension that is paired finds this server within about 30 seconds, or at once when the "
                + "user opens the TabGoblin popup. If it is not paired yet, ask the user to load the TabGoblin extension "
                + "in Chrome, open its popup and paste this server's pairing token. ";
        String status = asking.call("browser_status", args()).text();
        assertEquals(1, asked.get());
        assertEquals(head + waiting + "The user sees the token by running the server's jar with --show-token in a terminal.", status);
        // Another tool says the same behind its error.
        String refused = asking.call("browser_snapshot", args()).text();
        assertEquals("Error [NOT_CONNECTED]: The Chrome extension is not connected. " + waiting
                + "The user sees the token by running the server's jar with --show-token in a terminal.", refused);
        // With the server's window open, the token is copied there.
        known.set(new BrowserService.Unpaired(false, false, true));
        assertEquals(head + waiting + "The TabGoblin server's window is open on the user's screen: Copy, next to "
                + "Pairing token, puts the token on the clipboard.", asking.call("browser_status", args()).text());

        // The browser is paired with the server by way of another agent: nothing to paste, only to wait for.
        known.set(new BrowserService.Unpaired(true, false, true));
        assertEquals(head + "The browser is paired with this server and finds this agent within about 30 seconds, "
                + "or at once when the user opens the TabGoblin popup. Try again then.", asking.call("browser_status", args()).text());

        // A browser came with another token: that is why none is paired, and pairing is what the user has to do.
        known.set(BrowserService.Unpaired.NOTHING_KNOWN);
        FakeExtension stale = new FakeExtension(bridge.getPort(), FakeExtension.ORIGIN, "f".repeat(64));
        stale.connectBlocking();
        for (int i = 0; i < 100 && bridge.lastCloseCode() != Protocol.CLOSE_UNAUTHORIZED; i++) {
            Thread.sleep(20);
        }
        String pair = "Ask the user to pair the browser with this server: in Chrome, with the TabGoblin extension loaded, "
                + "open its popup and paste this server's pairing token. ";
        assertEquals(head + "The browser holds a token that is not this server's. " + pair
                + "The user sees the token by running the server's jar with --show-token in a terminal.",
                asking.call("browser_status", args()).text());
        // The window has come up for it: the step and its button are at its top.
        known.set(new BrowserService.Unpaired(false, true, true));
        assertEquals(head + "The browser holds a token that is not this server's. " + pair
                + "The TabGoblin server's window is open on the user's screen: Copy token, at its top, puts the token on "
                + "the clipboard.", asking.call("browser_status", args()).text());
        // Behind an error the reason stands once.
        assertEquals("Error [NOT_CONNECTED]: The Chrome extension is not paired with this server: the token it holds is "
                + "not this server's. " + pair + "The TabGoblin server's window is open on the user's screen: Copy token, at "
                + "its top, puts the token on the clipboard.", asking.call("browser_snapshot", args()).text());

        // What the user switched off is theirs to switch on: nobody is asked, and no window comes up.
        int before = asked.get();
        bridge.setHeld(true);
        asking.call("browser_status", args());
        asking.call("browser_snapshot", args());
        assertEquals(before, asked.get());
    }

    @Test
    void switchedOffInTheServersWindowStatusAndToolsSaySoAndWhatToAskTheUser() throws Exception {
        bridge.setHeld(true);
        for (int i = 0; i < 50 && bridge.isExtensionConnected(); i++) {
            Thread.sleep(20);
        }
        BrowserService.ToolResult status = service.call("browser_status", args());
        assertFalse(status.isError());
        assertEquals("Extension: not connected (switched off in this server's window)\n"
                + "The user switched this server's connection to the browser off, in the TabGoblin server window. "
                + "Ask them to switch it on again there.", status.text());
        // Not the advice for an extension that is not paired: pairing would change nothing here.
        assertFalse(status.text().contains("pairing token"));
        String refused = service.call("browser_snapshot", args()).text();
        assertTrue(refused.startsWith("Error [NOT_CONNECTED]"), refused);
        assertTrue(refused.contains("Ask them to switch it on again there."), refused);
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

    /** Two sessions as the extension reports them: one on a site of the user's, one on a site that is blocked. */
    private void twoSessions() throws Exception {
        ext.send("""
                {"type":"event","event":"sessions","data":{"sessions":[
                  {"session":"s1","origin":"https://docs.example.net","mode":"write","state":"active",
                   "tab":{"title":"Docs","url":"https://docs.example.net/guide"}},
                  {"session":"s2","origin":"https://mail.example.org:8443","mode":"write","state":"active",
                   "tab":{"title":"Inbox","url":"https://mail.example.org:8443/inbox"}}]}}""");
        for (int i = 0; i < 100 && bridge.sessions().size() < 2; i++) {
            Thread.sleep(20);
        }
        assertEquals(2, bridge.sessions().size());
    }

    @Test
    void anActionOnABlockedSiteIsRefusedBeforeItReachesTheBrowser() throws Exception {
        twoSessions();
        bridge.blockedSites(() -> new BlockedSites.Rule(java.util.List.of("example.org"), null));
        Log.keep(20);
        try {
            // Every kind of action in the session on the blocked site: none of them is sent.
            for (String tool : java.util.List.of("browser_snapshot", "browser_extract", "browser_screenshot", "browser_scroll")) {
                BrowserService.ToolResult refused = service.call(tool, args().put("session", "s2"));
                assertTrue(refused.isError(), tool);
                assertEquals("Error [SITE_BLOCKED]: mail.example.org is on the user's list of blocked sites: no agent may "
                        + "work there. Only the user can change that, in the settings of the TabGoblin server.", refused.text(), tool);
            }
            assertTrue(service.call("browser_click", args().put("session", "s2").put("ref", 3)).text().startsWith("Error [SITE_BLOCKED]"));
            assertTrue(service.call("browser_fill", args().put("session", "s2").put("ref", 3).put("text", "x")).text()
                    .startsWith("Error [SITE_BLOCKED]"));
            assertEquals(0, ext.commands.size(), "nothing reached the browser");

            // The other session works as before, and its answer has nothing of the blocked site.
            ext.responder = cmd -> FakeExtension.ok(cmd, args().put("text", "the guide"));
            BrowserService.ToolResult read = service.call("browser_snapshot", args().put("session", "s1"));
            assertFalse(read.isError(), read.text());
            assertEquals(1, ext.commands.size());

            // A navigation to a blocked address is refused before it is sent, whatever session it is in:
            // the site itself, a subdomain, another port, and an address without a scheme of its own.
            for (String url : java.util.List.of("https://example.org/", "https://shop.example.org/cart",
                    "http://EXAMPLE.org:8080/x", "//example.org/y", "\\\\example.org/y", " https:\\\\example.org")) {
                BrowserService.ToolResult refused = service.call("browser_navigate", args().put("session", "s1").put("url", url));
                assertTrue(refused.text().startsWith("Error [SITE_BLOCKED]: "), url + ": " + refused.text());
                assertTrue(refused.text().contains("example.org is on the user's list"), refused.text());
            }
            assertEquals(1, ext.commands.size(), "no navigation was sent");
            // A look-alike is not the blocked site, and an address within the tab's own site names no site.
            service.call("browser_navigate", args().put("session", "s1").put("url", "https://notexample.org/"));
            service.call("browser_navigate", args().put("session", "s1").put("url", "/guide/next"));
            service.call("browser_navigate", args().put("session", "s1").put("history", "back"));
            assertEquals(4, ext.commands.size());

            // What was refused here is in the log as a scope violation, with its session and without an address.
            var refusals = Log.recent().stream().map(Log.Line::text).filter(line -> line.contains("SITE_BLOCKED")).toList();
            assertEquals(12, refusals.size());
            assertEquals("command id=- session=s2 action=snapshot ms=0 outcome=error code=SITE_BLOCKED category=SCOPE "
                    + "scope_violation=true", refusals.get(0));
            assertTrue(refusals.stream().noneMatch(line -> line.contains("example")), refusals.toString());
        } finally {
            Log.keep(0);
        }
    }

    @Test
    void theStatusSaysWhichSessionIsBlockedAndNeverTheList() throws Exception {
        bridge.blockedSites(() -> new BlockedSites.Rule(java.util.List.of("bank.example", "example.org", "intranet.example"), null));
        ext.responder = cmd -> FakeExtension.ok(cmd, FakeExtension.JSON.readTree("""
                {"sessions":[
                  {"session":"s1","origin":"https://docs.example.net","mode":"write","paused":false,
                   "tab":{"title":"Docs","url":"https://docs.example.net/guide"}},
                  {"session":"s2","origin":"https://mail.example.org","mode":"read","paused":false,
                   "tab":{"title":"Inbox","url":"https://mail.example.org/inbox"}},
                  {"session":"s3","origin":"https://wiki.example.net","origins":["https://wiki.example.net","https://intranet.example"],
                   "mode":"read","paused":false,"tab":{"title":"Wiki","url":"https://wiki.example.net/"}}]}"""));
        String status = service.call("browser_status", args()).text();
        assertTrue(status.contains("Session s2"), status);
        // The session on a blocked site, and the one that spans a blocked site, each say so with the one site.
        assertTrue(status.contains("  Blocked: mail.example.org is on the user's list of blocked sites"), status);
        assertTrue(status.contains("  Blocked: intranet.example is on the user's list of blocked sites"), status);
        assertEquals(2, status.split("  Blocked: ", -1).length - 1, status);
        // What the agent did not run into, it is not told.
        assertFalse(status.contains("bank.example"), status);
    }

    @Test
    void aSessionThatSpansABlockedSiteIsBlockedWhereverItsTabIs() throws Exception {
        // The user added a second site to the session. The tab may be on either, and the server knows
        // its place from a report: so the session counts as blocked.
        ext.send("""
                {"type":"event","event":"sessions","data":{"sessions":[
                  {"session":"s1","origin":"https://docs.example.net","origins":["https://docs.example.net","https://sso.example.org"],
                   "mode":"write","state":"active","tab":{"title":"Docs","url":"https://docs.example.net/guide"}}]}}""");
        for (int i = 0; i < 100 && bridge.sessions().isEmpty(); i++) {
            Thread.sleep(20);
        }
        bridge.blockedSites(() -> new BlockedSites.Rule(java.util.List.of("example.org"), null));
        // The session is the agent's only one: a command that names none is meant for it.
        BrowserService.ToolResult refused = service.call("browser_snapshot", args());
        assertTrue(refused.text().startsWith("Error [SITE_BLOCKED]: sso.example.org is on the user's list"), refused.text());
        assertEquals(0, ext.commands.size());
    }

    @Test
    void aSessionTheServerHasNotHeardOfYetIsAskedForBeforeAnythingIsSentToIt() throws Exception {
        // The server's picture of the sessions is the extension's last report, and here there is none
        // yet. What the server refuses must not hang on that, nor on an extension that refuses as well.
        bridge.blockedSites(() -> new BlockedSites.Rule(java.util.List.of("example.org"), null));
        ext.responder = cmd -> cmd.path("action").asString().equals("status")
                ? FakeExtension.ok(cmd, FakeExtension.JSON.readTree("""
                        {"sessions":[
                          {"session":"s8","origin":"https://docs.example.net","mode":"write","paused":false,
                           "tab":{"title":"Docs","url":"https://docs.example.net/guide"}},
                          {"session":"s9","origin":"https://mail.example.org","mode":"write","paused":false,
                           "tab":{"title":"Inbox","url":"https://mail.example.org/inbox"}}]}"""))
                : FakeExtension.ok(cmd, args().put("text", "read"));
        assertTrue(bridge.sessions().isEmpty());

        BrowserService.ToolResult refused = service.call("browser_snapshot", args().put("session", "s9"));
        assertTrue(refused.text().startsWith("Error [SITE_BLOCKED]: mail.example.org is on the user's list"), refused.text());
        assertEquals(java.util.List.of("status"), ext.commands.stream().map(c -> c.path("action").asString()).toList(),
                "the session was asked for, and nothing was sent to it");

        // The session beside it is found to be on no blocked site, and its command goes out.
        assertFalse(service.call("browser_snapshot", args().put("session", "s8")).isError());
        assertEquals(java.util.List.of("status", "status", "snapshot"),
                ext.commands.stream().map(c -> c.path("action").asString()).toList());

        // Where the answer does not come, the call ends there: the command is not sent on a guess.
        ext.responder = cmd -> null;
        BrowserService.ToolResult unanswered = service.call("browser_click", args().put("session", "s9").put("ref", 3));
        assertTrue(unanswered.isError(), unanswered.text());
        assertTrue(ext.commands.stream().noneMatch(c -> c.path("action").asString().equals("click")), "no click was sent");
    }

    @Test
    void aSettingsFileThatCannotBeReadRefusesEveryActionAndTheStatusSaysWhy() throws Exception {
        twoSessions();
        bridge.blockedSites(() -> new BlockedSites.Rule(java.util.List.of(), "\"exam_ple.org\" in blocked.sites is no domain"));
        for (String session : java.util.List.of("s1", "s2")) {
            BrowserService.ToolResult refused = service.call("browser_snapshot", args().put("session", session));
            assertEquals("Error [SETTINGS_UNREADABLE]: " + BrowserService.SETTINGS_UNREADABLE, refused.text());
        }
        assertTrue(service.call("browser_navigate", args().put("session", "s1").put("url", "/next")).text()
                .startsWith("Error [SETTINGS_UNREADABLE]"));
        assertEquals(0, ext.commands.size(), "nothing reached the browser");
        // The status still answers, and says it first. What the user wrote in the file is not passed on.
        ext.responder = cmd -> FakeExtension.ok(cmd, args());
        String status = service.call("browser_status", args()).text();
        assertTrue(status.startsWith("Blocked sites: " + BrowserService.SETTINGS_UNREADABLE), status);
        assertFalse(status.contains("exam_ple"), status);
    }

    @Test
    void theExtensionIsToldTheBlockedSitesWhenItPairsAndWhenTheyChange() throws Exception {
        // Nothing is sent behind the pairing answer: an extension from before this message would take it,
        // while it still checks the server's proof, for a failed pairing.
        bridge.blockedSites(() -> BlockedSites.Rule.NONE);
        Thread.sleep(1300);
        assertEquals(0, ext.policies.size());
        // It is told with its first word as a paired extension, which the real one says at once.
        ext.send("{\"type\":\"ping\"}");
        for (int i = 0; i < 100 && ext.policies.isEmpty(); i++) {
            Thread.sleep(20);
        }
        assertEquals(0, ext.policies.get(0).path("blocked").size());
        assertFalse(ext.policies.get(0).path("unreadable").asBoolean());
        assertTrue(ext.early.isEmpty(), "nothing was sent ahead of the pairing answer: " + ext.early);

        java.util.concurrent.atomic.AtomicReference<BlockedSites.Rule> rule =
                new java.util.concurrent.atomic.AtomicReference<>(new BlockedSites.Rule(java.util.List.of("example.org"), null));
        bridge.blockedSites(rule::get);
        for (int i = 0; i < 200 && ext.policies.size() < 2; i++) {
            Thread.sleep(20);
        }
        assertEquals("example.org", ext.policies.get(1).path("blocked").get(0).asString());
        // Unchanged, it is not told again; changed to a file that cannot be read, it is told that.
        Thread.sleep(1500);
        assertEquals(2, ext.policies.size());
        rule.set(new BlockedSites.Rule(java.util.List.of(), "it cannot be read (AccessDeniedException)"));
        for (int i = 0; i < 200 && ext.policies.size() < 3; i++) {
            Thread.sleep(20);
        }
        assertTrue(ext.policies.get(2).path("unreadable").asBoolean());
        assertFalse(ext.policies.get(2).toString().contains("AccessDenied"), "the reason stays with the server");
        // An extension that pairs later is told what is in force then.
        FakeExtension later = FakeExtension.paired(bridge.getPort(), WebSocketBridgeTest.TOKEN);
        later.send("{\"type\":\"event\",\"event\":\"sessions\",\"data\":{\"sessions\":[]}}");
        for (int i = 0; i < 100 && later.policies.isEmpty(); i++) {
            Thread.sleep(20);
        }
        assertTrue(later.policies.get(0).path("unreadable").asBoolean());
        later.closeBlocking();
    }
}
