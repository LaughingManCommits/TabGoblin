package browsercontext;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/** WebSocket authentication, request correlation, timeouts and limits. */
class WebSocketBridgeTest {

    static final String TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    static final String OTHER_EXTENSION = "chrome-extension://pppppppppppppppppppppppppppppppp";
    static final Duration SHORT = Duration.ofMillis(400);

    WebSocketBridge bridge;
    int port;

    @BeforeEach
    void start() throws Exception {
        bridge = new WebSocketBridge(0, TOKEN, FakeExtension.ORIGIN, 400);
        bridge.startAndWait();
        port = bridge.getPort();
    }

    @AfterEach
    void stop() throws Exception {
        bridge.stop(500);
    }

    private static ObjectNode obj() {
        return FakeExtension.JSON.createObjectNode();
    }

    @Test
    void listensOnLoopbackOnly() {
        assertEquals("127.0.0.1", bridge.getAddress().getAddress().getHostAddress());
    }

    @Test
    void rejectsHandshakeFromWebPageOrigin() throws Exception {
        FakeExtension web = new FakeExtension(port, "https://evil.example", TOKEN);
        assertFalse(web.connectBlocking(3, TimeUnit.SECONDS));
        assertFalse(bridge.isExtensionConnected());
    }

    @Test
    void rejectsHandshakeWithoutOrigin() throws Exception {
        FakeExtension noOrigin = new FakeExtension(port, null, TOKEN);
        assertFalse(noOrigin.connectBlocking(3, TimeUnit.SECONDS));
    }

    @Test
    void rejectsADifferentExtensionWhenOriginIsPinned() throws Exception {
        FakeExtension other = new FakeExtension(port, OTHER_EXTENSION, TOKEN);
        assertFalse(other.connectBlocking(3, TimeUnit.SECONDS));
    }

    @Test
    void anyExtensionModeStillRefusesWebOrigins() throws Exception {
        WebSocketBridge open = new WebSocketBridge(0, TOKEN, WebSocketBridge.ANY_EXTENSION_ORIGIN, 400);
        open.startAndWait();
        try {
            FakeExtension web = new FakeExtension(open.getPort(), "http://localhost:3000", TOKEN);
            assertFalse(web.connectBlocking(3, TimeUnit.SECONDS));
            FakeExtension ext = new FakeExtension(open.getPort(), OTHER_EXTENSION, TOKEN);
            assertTrue(ext.connectBlocking(3, TimeUnit.SECONDS));
            assertTrue(ext.paired.get(3, TimeUnit.SECONDS));
        } finally {
            open.stop(500);
        }
    }

    @Test
    void rejectsWrongPairingToken() throws Exception {
        FakeExtension ext = new FakeExtension(port, FakeExtension.ORIGIN, "f".repeat(64));
        assertTrue(ext.connectBlocking(3, TimeUnit.SECONDS));
        assertEquals(WebSocketBridge.CLOSE_UNAUTHORIZED, ext.closed.get(3, TimeUnit.SECONDS));
        assertFalse(bridge.isExtensionConnected());
    }

    @Test
    void unpairedConnectionGetsNoCommandsAndIsClosed() throws Exception {
        FakeExtension silent = new FakeExtension(port, FakeExtension.ORIGIN, null);
        assertTrue(silent.connectBlocking(3, TimeUnit.SECONDS));
        BrowserException e = assertThrows(BrowserException.class, () -> bridge.send("snapshot", null, SHORT));
        assertEquals("NOT_CONNECTED", e.code());
        assertEquals(WebSocketBridge.CLOSE_UNAUTHORIZED, silent.closed.get(3, TimeUnit.SECONDS));
        assertTrue(silent.commands.isEmpty());
    }

    @Test
    void unpairedConnectionCannotInjectEvents() throws Exception {
        FakeExtension rogue = new FakeExtension(port, FakeExtension.ORIGIN, null);
        assertTrue(rogue.connectBlocking(3, TimeUnit.SECONDS));
        rogue.send("{\"type\":\"event\",\"event\":\"state\",\"data\":{\"authorized\":true}}");
        assertEquals(WebSocketBridge.CLOSE_UNAUTHORIZED, rogue.closed.get(3, TimeUnit.SECONDS));
        assertNull(bridge.lastState());
    }

    @Test
    void pairsAndServerProvesItKnowsTheToken() throws Exception {
        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        assertTrue(bridge.isExtensionConnected());
        ext.closeBlocking();
    }

    @Test
    void correlatesRequestsAndResponses() throws Exception {
        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        ext.responder = cmd -> FakeExtension.ok(cmd,
                obj().put("echo", cmd.path("action").asString() + ":" + cmd.path("params").path("n").asInt()));
        for (int i = 0; i < 5; i++) {
            JsonNode result = bridge.send("act" + i, obj().put("n", i), SHORT);
            assertEquals("act" + i + ":" + i, result.path("echo").asString());
        }
        assertEquals(5, ext.commands.size());
        assertEquals(5, ext.commands.stream().map(c -> c.path("id").asString()).distinct().count());
    }

    @Test
    void surfacesStructuredErrors() throws Exception {
        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        ext.responder = cmd -> FakeExtension.fail(cmd, "NOT_AUTHORIZED", "No origin authorized.");
        BrowserException e = assertThrows(BrowserException.class, () -> bridge.send("snapshot", null, SHORT));
        assertEquals("NOT_AUTHORIZED", e.code());
        assertEquals("No origin authorized.", e.getMessage());
    }

    @Test
    void timesOutWithoutRetrying() throws Exception {
        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        ext.responder = cmd -> null;
        BrowserException e = assertThrows(BrowserException.class, () -> bridge.send("click", null, SHORT));
        assertEquals("TIMEOUT", e.code());
        Thread.sleep(300);
        assertEquals(1, ext.commands.size(), "a timed-out command must not be re-sent");
    }

    @Test
    void lateResponseToTimedOutCommandIsIgnored() throws Exception {
        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        ext.responder = cmd -> null;
        assertThrows(BrowserException.class, () -> bridge.send("click", null, SHORT));
        ext.send(FakeExtension.JSON.writeValueAsString(FakeExtension.ok(ext.commands.get(0), obj().put("late", true))));
        ext.responder = cmd -> FakeExtension.ok(cmd, obj().put("fresh", true));
        assertTrue(bridge.send("status", null, SHORT).path("fresh").asBoolean());
    }

    @Test
    void connectionLossFailsThePendingCommandWithoutRetrying() throws Exception {
        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        ext.responder = cmd -> {
            ext.close();
            return null;
        };
        BrowserException e = assertThrows(BrowserException.class,
                () -> bridge.send("click", null, Duration.ofSeconds(3)));
        assertEquals("CONNECTION_LOST", e.code());
        assertEquals(1, ext.commands.size());
        assertFalse(bridge.isExtensionConnected());
    }

    @Test
    void closesConnectionOnOversizedMessage() throws Exception {
        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        ext.send("{\"type\":\"event\",\"pad\":\"" + "x".repeat(WebSocketBridge.MAX_MESSAGE_BYTES + 1024) + "\"}");
        ext.closed.get(5, TimeUnit.SECONDS);
        for (int i = 0; i < 50 && bridge.isExtensionConnected(); i++) {
            Thread.sleep(20);
        }
        assertFalse(bridge.isExtensionConnected());
    }

    @Test
    void newerPairedConnectionReplacesTheOldOne() throws Exception {
        FakeExtension first = FakeExtension.paired(port, TOKEN);
        FakeExtension second = FakeExtension.paired(port, TOKEN);
        assertEquals(WebSocketBridge.CLOSE_REPLACED, first.closed.get(3, TimeUnit.SECONDS));
        second.responder = cmd -> FakeExtension.ok(cmd, obj().put("who", "second"));
        assertEquals("second", bridge.send("status", null, SHORT).path("who").asString());
    }

    @Test
    void recordsStateEventsFromThePairedExtension() throws Exception {
        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        ext.send("{\"type\":\"event\",\"event\":\"state\",\"data\":{\"paused\":true}}");
        for (int i = 0; i < 50 && bridge.lastState() == null; i++) {
            Thread.sleep(20);
        }
        assertTrue(bridge.lastState().path("paused").asBoolean());
    }
}
