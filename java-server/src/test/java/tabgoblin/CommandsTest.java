package tabgoblin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayOutputStream;
import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * The command line's own conversation with the server, as the server has it: one call for each
 * connection, answered with the tool's result and its code; a cancel that stops the call; a
 * connection that ends under a call; and messages that are none.
 */
class CommandsTest {

    static final ObjectMapper JSON = new ObjectMapper();

    WebSocketBridge bridge;
    BrowserService service;
    FakeExtension ext;
    PipedOutputStream to;
    ByteArrayOutputStream from;
    AtomicInteger ended;
    Commands commands;

    @BeforeEach
    void start() throws Exception {
        bridge = new WebSocketBridge(0, WebSocketBridgeTest.TOKEN, FakeExtension.ORIGIN, 400);
        bridge.startAndWait();
        service = new BrowserService(bridge, null, Duration.ofMillis(800));
        ext = FakeExtension.paired(bridge.getPort(), WebSocketBridgeTest.TOKEN);
        to = new PipedOutputStream();
        from = new ByteArrayOutputStream();
        ended = new AtomicInteger();
        commands = Commands.serve(service, new PipedInputStream(to), from, "ide (command line)", ended::incrementAndGet);
    }

    @AfterEach
    void stop() throws Exception {
        to.close();
        bridge.stop(500);
    }

    private void send(String line) throws Exception {
        to.write((line + "\n").getBytes(StandardCharsets.UTF_8));
        to.flush();
    }

    private List<JsonNode> said() {
        return from.toString(StandardCharsets.UTF_8).lines().filter(line -> !line.isBlank()).map(JSON::readTree).toList();
    }

    private static void await(java.util.function.BooleanSupplier condition, String what) throws InterruptedException {
        for (int i = 0; i < 250 && !condition.getAsBoolean(); i++) {
            Thread.sleep(20);
        }
        assertTrue(condition.getAsBoolean(), "not reached in time: " + what);
    }

    @Test
    void aCallIsRunAsTheToolAndAnsweredWithItsResultAndCode() throws Exception {
        assertEquals("ide (command line)", bridge.clientName(), "the agent is named as the popup shows it");
        ext.responder = cmd -> FakeExtension.ok(cmd, JSON.createObjectNode().put("text", "a page"));
        send("{\"type\":\"call\",\"tool\":\"browser_snapshot\",\"arguments\":{\"session\":\"s1\",\"max_lines\":40}}");
        await(() -> said().size() == 1, "the result");
        JsonNode result = said().get(0);
        assertEquals("result", result.path("type").asString());
        assertEquals("browser_snapshot", result.path("tool").asString());
        assertFalse(result.path("isError").asBoolean());
        assertTrue(result.path("code").isNull());
        assertTrue(result.path("text").asString().contains("a page"));
        assertTrue(result.path("image").isNull());
        assertEquals(40, ext.commands.get(0).path("params").path("maxLines").asInt(), "the arguments reached the browser as the tool's");

        // An error has its code as a field and in front of its text, as agents read it.
        send("{\"type\":\"call\",\"tool\":\"browser_click\",\"arguments\":{\"ref\":1}}");
        await(() -> said().size() == 2, "the answer to a second call");
        assertEquals("error", said().get(1).path("type").asString(), "one call for each connection");
    }

    @Test
    void aToolThatReturnsAnObjectHasOneWhenItsResultIsTextAlone() {
        // As over MCP: an answer such as "Submission x was already handled" still has its object.
        JsonNode said = commands.result("browser_submit", BrowserService.ToolResult.ok("already handled"));
        assertEquals("already handled", said.path("structured").path("text").asString());
        assertTrue(commands.result("browser_snapshot", BrowserService.ToolResult.ok("a page")).path("structured").isNull(),
                "a tool that returns text has no object");
        assertTrue(commands.result("browser_submit", BrowserService.ToolResult.error("TIMEOUT", "late")).path("structured").isNull(),
                "an error has no object");
    }

    @Test
    void anErrorOfTheToolHasItsCodeAsAField() throws Exception {
        send("{\"type\":\"call\",\"tool\":\"browser_no_such\",\"arguments\":{}}");
        await(() -> said().size() == 1, "the result");
        JsonNode result = said().get(0);
        assertTrue(result.path("isError").asBoolean());
        assertEquals("UNKNOWN_TOOL", result.path("code").asString());
        assertTrue(result.path("text").asString().startsWith("Error [UNKNOWN_TOOL]: "), result.path("text").asString());
    }

    @Test
    void aCancelStopsTheCallAndNoAnswerIsSent() throws Exception {
        ext.responder = cmd -> null;
        send("{\"type\":\"call\",\"tool\":\"browser_click\",\"arguments\":{\"ref\":1}}");
        await(() -> ext.commands.size() == 1, "the command to be in the browser");
        send("{\"type\":\"cancel\"}");
        Thread.sleep(1200);
        assertEquals(0, said().size(), "a cancelled call gets no answer: nobody waits for it");
        assertEquals(0, ended.get(), "the connection is still there");
    }

    @Test
    void aConnectionThatEndsUnderACallEndsItAndTellsOnce() throws Exception {
        ext.responder = cmd -> null;
        send("{\"type\":\"call\",\"tool\":\"browser_click\",\"arguments\":{\"ref\":1}}");
        await(() -> ext.commands.size() == 1, "the command to be in the browser");
        to.close();
        await(() -> ended.get() == 1, "the end to be told");
        Thread.sleep(1200);
        assertEquals(0, said().size());
        assertEquals(1, ended.get(), "told once");
        commands.close();
        assertEquals(1, ended.get(), "and not again when the server closes it");
    }

    @Test
    void theServerClosesAConversationWhoseProcessStillWaitsWithoutWaitingForIt() throws Exception {
        ext.responder = cmd -> null;
        send("{\"type\":\"call\",\"tool\":\"browser_click\",\"arguments\":{\"ref\":1}}");
        await(() -> ext.commands.size() == 1, "the command to be in the browser");
        // The process sends nothing more while it waits for its answer: a stop of the server must not wait for it.
        Thread closing = new Thread(commands::close);
        closing.setDaemon(true);
        closing.start();
        closing.join(2000);
        assertFalse(closing.isAlive(), "close returned while the read was waiting");
        assertEquals(1, ended.get(), "the end is told once");
    }

    @Test
    void whatIsNoMessageOfTheCommandLineIsAnsweredWithAnErrorAndRunsNothing() throws Exception {
        send("not json");
        send("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"browser_click\"}}");
        send("{\"type\":\"show\"}");
        await(() -> said().size() == 3, "three answers");
        for (JsonNode answer : said()) {
            assertEquals("error", answer.path("type").asString());
            assertTrue(answer.path("message").asString().contains("Not a message of the command line"), answer.toString());
        }
        assertTrue(ext.commands.isEmpty(), "nothing went to the browser; MCP is not spoken here");
    }
}
