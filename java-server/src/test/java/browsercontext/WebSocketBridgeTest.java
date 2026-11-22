package browsercontext;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/** WebSocket authentication, protocol negotiation, request correlation, cancellation and limits. */
class WebSocketBridgeTest {

    static final String TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    static final String OTHER_EXTENSION = "chrome-extension://pppppppppppppppppppppppppppppppp";
    static final Duration SHORT = Duration.ofMillis(400);
    /** How often the tests of the moment of pairing pair: that moment is hit by chance only. */
    static final int PAIRINGS = 200;

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

    private static void await(java.util.function.BooleanSupplier condition) throws InterruptedException {
        for (int i = 0; i < 100 && !condition.getAsBoolean(); i++) {
            Thread.sleep(20);
        }
        assertTrue(condition.getAsBoolean(), "condition not reached in time");
    }

    /**
     * Connects an extension the server is expected to turn away once it has answered the challenge,
     * and returns the code the server closed the connection with. A code of the pairing says that
     * the connection was open. {@code connectBlocking} is not asked: it says no for a connection
     * that was opened and closed again before the test looked.
     */
    private static int closedWith(FakeExtension ext) throws Exception {
        ext.connectBlocking(3, TimeUnit.SECONDS);
        return ext.closed.get(3, TimeUnit.SECONDS);
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
        assertEquals(WebSocketBridge.CLOSE_UNAUTHORIZED, closedWith(ext));
        assertFalse(bridge.isExtensionConnected());
    }

    @Test
    void repeatedFailedPairingsLockOutNewConnections() throws Exception {
        for (int i = 0; i < WebSocketBridge.MAX_FAILED_PAIRINGS; i++) {
            FakeExtension guess = new FakeExtension(port, FakeExtension.ORIGIN, Pairing.randomHex(32));
            assertEquals(WebSocketBridge.CLOSE_UNAUTHORIZED, closedWith(guess));
        }
        FakeExtension genuine = new FakeExtension(port, FakeExtension.ORIGIN, TOKEN);
        assertFalse(genuine.connectBlocking(3, TimeUnit.SECONDS), "even the right token must wait out the lockout");
        assertFalse(bridge.isExtensionConnected());
    }

    @Test
    void lockoutExpires() throws Exception {
        WebSocketBridge quick = new WebSocketBridge(0, () -> TOKEN, FakeExtension.ORIGIN, 400, 300);
        quick.startAndWait();
        try {
            for (int i = 0; i < WebSocketBridge.MAX_FAILED_PAIRINGS; i++) {
                FakeExtension guess = new FakeExtension(quick.getPort(), FakeExtension.ORIGIN, Pairing.randomHex(32));
                guess.connectBlocking(3, TimeUnit.SECONDS);
                guess.closed.get(3, TimeUnit.SECONDS);
            }
            Thread.sleep(400);
            FakeExtension.paired(quick.getPort(), TOKEN);
            assertTrue(quick.isExtensionConnected());
        } finally {
            quick.stop(500);
        }
    }

    @Test
    void unpairedConnectionGetsNoCommandsAndIsClosed() throws Exception {
        FakeExtension silent = new FakeExtension(port, FakeExtension.ORIGIN, null);
        assertTrue(silent.connectBlocking(3, TimeUnit.SECONDS));
        BrowserException e = assertThrows(BrowserException.class, () -> bridge.send("snapshot", null, null, SHORT));
        assertEquals("NOT_CONNECTED", e.code());
        assertEquals(WebSocketBridge.CLOSE_UNAUTHORIZED, silent.closed.get(3, TimeUnit.SECONDS));
        assertTrue(silent.commands.isEmpty());
    }

    @Test
    void unpairedConnectionCannotInjectEvents() throws Exception {
        FakeExtension rogue = new FakeExtension(port, FakeExtension.ORIGIN, null);
        assertTrue(rogue.connectBlocking(3, TimeUnit.SECONDS));
        rogue.send("{\"type\":\"event\",\"event\":\"sessions\",\"data\":{\"sessions\":[{\"session\":\"s1\"}]}}");
        assertEquals(WebSocketBridge.CLOSE_UNAUTHORIZED, rogue.closed.get(3, TimeUnit.SECONDS));
        assertTrue(bridge.sessions().isEmpty());
    }

    @Test
    void pairsNegotiatesTheProtocolVersionAndIdentifiesTheAgent() throws Exception {
        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        assertTrue(bridge.isExtensionConnected());
        assertEquals(Protocol.VERSION, ext.challenge.path("versions").get(0).asInt());
        assertEquals(bridge.clientId(), ext.clientId);
        assertTrue(ext.clientId.matches("c-[0-9a-f]{8}"));

        bridge.setClientName("Test IDE\u0007 with a very long name ".repeat(5));
        await(() -> !ext.clientNames.isEmpty());
        assertTrue(ext.clientNames.get(0).startsWith("Test IDE  with"));
        assertTrue(ext.clientNames.get(0).length() <= 60);
        ext.closeBlocking();
    }

    /**
     * The extension calls itself paired the moment the server's answer arrives. From then on the
     * server must do so too: a command goes to that extension, and is not refused for want of one.
     * Each pairing replaces the one before, so a command that still went to the old connection
     * shows as a command the new one never got.
     */
    @Test
    void aCommandRightBehindThePairingReachesTheExtensionThatPaired() throws Exception {
        for (int i = 0; i < PAIRINGS; i++) {
            FakeExtension ext = FakeExtension.paired(port, TOKEN);
            assertTrue(bridge.isExtensionConnected(), "pairing " + i);
            bridge.send("status", null, null, SHORT);
            assertEquals(1, ext.commands.size(), "pairing " + i);
            assertEquals(java.util.List.of(), ext.early, "nothing may arrive ahead of the pairing answer");
        }
    }

    /**
     * The MCP client names itself on another thread, at any moment of a pairing. The name must
     * reach the extension, in the pairing answer or right behind it, and never ahead of it.
     */
    @Test
    void anAgentNameGivenWhileTheExtensionPairsIsNeitherLostNorAhead() throws Exception {
        for (int i = 0; i < PAIRINGS; i++) {
            String name = "agent-" + i;
            // Spread over the moments of a pairing, from the challenge on.
            long delay = (i % 50) * 4_000L;
            FakeExtension ext = new FakeExtension(port, FakeExtension.ORIGIN, TOKEN);
            Thread naming = new Thread(() -> {
                long giveUp = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
                while (ext.challenge == null && System.nanoTime() < giveUp) {
                    // On a single core the pairing needs that core to get this far.
                    Thread.yield();
                }
                long at = System.nanoTime() + delay;
                while (System.nanoTime() < at) {
                    Thread.onSpinWait();
                }
                bridge.setClientName(name);
            });
            naming.start();
            assertTrue(ext.connectBlocking(3, TimeUnit.SECONDS));
            assertTrue(ext.paired.get(3, TimeUnit.SECONDS));
            naming.join(3000);
            for (long giveUp = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
                    !name.equals(ext.agentName) && System.nanoTime() < giveUp;) {
                Thread.sleep(1);
            }
            assertEquals(name, ext.agentName, "pairing " + i + ": the extension must learn the agent's name");
            assertEquals(java.util.List.of(), ext.early, "nothing may arrive ahead of the pairing answer");
        }
    }

    @Test
    void anExtensionSpeakingAnotherProtocolVersionIsRefusedWithAReason() throws Exception {
        for (int version : new int[] {0, 1, 3}) {
            FakeExtension old = new FakeExtension(port, FakeExtension.ORIGIN, TOKEN);
            old.version = version;
            assertEquals(Protocol.CLOSE_VERSION, closedWith(old), "version " + version);
            assertFalse(bridge.isExtensionConnected());
        }
    }

    @Test
    void eachServerIsADistinctAgent() throws Exception {
        WebSocketBridge second = new WebSocketBridge(0, TOKEN, FakeExtension.ORIGIN, 400);
        second.startAndWait();
        try {
            assertNotEquals(bridge.clientId(), second.clientId());
            FakeExtension a = FakeExtension.paired(port, TOKEN);
            FakeExtension b = FakeExtension.paired(second.getPort(), TOKEN);
            a.responder = cmd -> FakeExtension.ok(cmd, obj().put("who", "a"));
            b.responder = cmd -> FakeExtension.ok(cmd, obj().put("who", "b"));
            assertEquals("a", bridge.send("status", null, null, SHORT).path("who").asString());
            assertEquals("b", second.send("status", null, null, SHORT).path("who").asString());
            assertEquals(1, a.commands.size());
            assertEquals(1, b.commands.size());
        } finally {
            second.stop(500);
        }
    }

    @Test
    void commandsCarryIdSessionAndDeadline() throws Exception {
        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        ext.responder = cmd -> FakeExtension.ok(cmd,
                obj().put("echo", cmd.path("action").asString() + ":" + cmd.path("params").path("n").asInt()));
        long before = System.currentTimeMillis();
        for (int i = 0; i < 5; i++) {
            JsonNode result = bridge.send("act" + i, "s" + i, obj().put("n", i), SHORT);
            assertEquals("act" + i + ":" + i, result.path("echo").asString());
            assertEquals("s" + i, ext.commands.get(i).path("session").asString());
        }
        assertEquals(5, ext.commands.stream().map(c -> c.path("id").asString()).distinct().count());
        long deadline = ext.commands.get(0).path("deadline").asLong();
        assertTrue(deadline >= before + 300 && deadline <= System.currentTimeMillis() + 400, "deadline " + deadline);
        bridge.send("status", null, null, SHORT);
        assertFalse(ext.commands.get(5).has("session"));
    }

    @Test
    void surfacesStructuredErrorsAndIgnoresMalformedResponses() throws Exception {
        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        ext.responder = cmd -> FakeExtension.fail(cmd, "NOT_AUTHORIZED", "No origin authorized.");
        BrowserException e = assertThrows(BrowserException.class, () -> bridge.send("snapshot", "s1", null, SHORT));
        assertEquals("NOT_AUTHORIZED", e.code());
        assertEquals("No origin authorized.", e.getMessage());

        // A response without a boolean "success" or without an error code is not a response.
        ext.responder = cmd -> obj().put("id", cmd.path("id").asString()).put("success", "yes");
        assertEquals("TIMEOUT", assertThrows(BrowserException.class,
                () -> bridge.send("snapshot", "s1", null, SHORT)).code());
        ext.responder = cmd -> obj().put("id", cmd.path("id").asString()).put("success", false);
        assertEquals("TIMEOUT", assertThrows(BrowserException.class,
                () -> bridge.send("snapshot", "s1", null, SHORT)).code());
    }

    @Test
    void aTimedOutCommandIsCancelledAndNeverRetried() throws Exception {
        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        ext.responder = cmd -> null;
        BrowserException e = assertThrows(BrowserException.class, () -> bridge.send("click", "s1", null, SHORT));
        assertEquals("TIMEOUT", e.code());
        await(() -> !ext.cancels.isEmpty());
        assertEquals(ext.commands.get(0).path("id").asString(), ext.cancels.get(0));
        Thread.sleep(300);
        assertEquals(1, ext.commands.size(), "a timed-out command must not be re-sent");
    }

    @Test
    void anInterruptedCommandIsCancelledInTheExtension() throws Exception {
        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        ext.responder = cmd -> null;
        AtomicReference<String> code = new AtomicReference<>();
        Thread caller = new Thread(() -> {
            try {
                bridge.send("wait_for", "s1", null, Duration.ofSeconds(20));
            } catch (BrowserException e) {
                code.set(e.code());
            }
        });
        caller.start();
        await(() -> !ext.commands.isEmpty());
        caller.interrupt();
        caller.join(3000);
        assertEquals("INTERRUPTED", code.get());
        await(() -> !ext.cancels.isEmpty());
    }

    @Test
    void lateResponseToTimedOutCommandIsIgnored() throws Exception {
        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        ext.responder = cmd -> null;
        assertThrows(BrowserException.class, () -> bridge.send("click", "s1", null, SHORT));
        ext.reply(FakeExtension.ok(ext.commands.get(0), obj().put("late", true)));
        ext.responder = cmd -> FakeExtension.ok(cmd, obj().put("fresh", true));
        assertTrue(bridge.send("status", null, null, SHORT).path("fresh").asBoolean());
    }

    @Test
    void sameSessionCommandsRunInOrderWhileOtherSessionsAndStatusAreNotBlocked() throws Exception {
        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        ext.responder = cmd -> cmd.path("action").asString().equals("slow") ? null : FakeExtension.ok(cmd, obj());
        CompletableFuture<JsonNode> slow = CompletableFuture.supplyAsync(
                () -> bridge.send("slow", "s1", null, Duration.ofSeconds(5)));
        await(() -> ext.commands.size() == 1);
        CompletableFuture<JsonNode> queued = CompletableFuture.supplyAsync(
                () -> bridge.send("next", "s1", null, Duration.ofSeconds(5)));

        bridge.send("other", "s2", null, SHORT);
        bridge.send("status", null, null, SHORT);
        Thread.sleep(150);
        assertEquals(java.util.List.of("slow", "other", "status"),
                ext.commands.stream().map(c -> c.path("action").asString()).toList(),
                "the second s1 command must wait for the first");

        ext.reply(FakeExtension.ok(ext.commands.get(0), obj()));
        slow.get(3, TimeUnit.SECONDS);
        queued.get(3, TimeUnit.SECONDS);
        assertEquals("next", ext.commands.get(3).path("action").asString());
    }

    @Test
    void connectionLossFailsThePendingCommandWithoutRetrying() throws Exception {
        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        ext.responder = cmd -> {
            ext.close();
            return null;
        };
        BrowserException e = assertThrows(BrowserException.class,
                () -> bridge.send("click", "s1", null, Duration.ofSeconds(3)));
        assertEquals("CONNECTION_LOST", e.code());
        assertEquals(1, ext.commands.size());
        assertFalse(bridge.isExtensionConnected());
    }

    @Test
    void aUserDisconnectIsExplainedToTheAgent() throws Exception {
        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        ext.close(Protocol.CLOSE_USER_DISCONNECTED, "Disconnected by the user");
        // Until the server has taken note of the code it was closed with: the connection stops being
        // open a moment before that, and a call in that moment is told only that it is not connected.
        await(() -> bridge.lastCloseCode() == Protocol.CLOSE_USER_DISCONNECTED);
        BrowserException e = assertThrows(BrowserException.class, () -> bridge.send("snapshot", "s1", null, SHORT));
        assertEquals("NOT_CONNECTED", e.code());
        assertTrue(e.getMessage().contains("user disconnected this agent"), e.getMessage());
    }

    @Test
    void switchedOffInThePanelTheExtensionIsNotLetInAndTheAgentIsToldWhy() throws Exception {
        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        assertTrue(bridge.connectedSince() > 0, "the panel can say since when the extension is connected");
        assertFalse(bridge.isHeld());

        bridge.setHeld(true);
        // The connection that is there is closed as one that goes away, not as a failed pairing.
        assertEquals(org.java_websocket.framing.CloseFrame.GOING_AWAY, ext.closed.get(3, TimeUnit.SECONDS));
        await(() -> !bridge.isExtensionConnected());
        assertEquals(0, bridge.connectedSince());
        // The extension looks for servers every half minute. None of its attempts gets in.
        for (int attempt = 0; attempt < 3; attempt++) {
            FakeExtension again = new FakeExtension(port, FakeExtension.ORIGIN, TOKEN);
            assertFalse(again.connectBlocking(3, TimeUnit.SECONDS));
        }
        assertFalse(bridge.isExtensionConnected());
        BrowserException e = assertThrows(BrowserException.class, () -> bridge.send("snapshot", "s1", null, SHORT));
        assertEquals("NOT_CONNECTED", e.code());
        assertEquals(ExtensionConnection.NOT_CONNECTED_HELD, e.getMessage());

        // Switched on again, the extension pairs as it always does: what was turned away counted as no failed pairing.
        bridge.setHeld(false);
        FakeExtension back = FakeExtension.paired(port, TOKEN);
        assertTrue(bridge.isExtensionConnected());
        bridge.send("snapshot", "s1", null, SHORT);
        assertEquals(1, back.commands.size());
        assertEquals(0, ext.commands.size(), "nothing reached the connection that was closed");
    }

    @Test
    void closesConnectionOnOversizedMessage() throws Exception {
        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        ext.send("{\"type\":\"event\",\"pad\":\"" + "x".repeat(WebSocketBridge.MAX_MESSAGE_BYTES + 1024) + "\"}");
        ext.closed.get(5, TimeUnit.SECONDS);
        await(() -> !bridge.isExtensionConnected());
    }

    @Test
    void closesConnectionThatFloodsMessages() throws Exception {
        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        for (int i = 0; i < WebSocketBridge.MAX_MESSAGES_PER_SECOND * 3 && ext.isOpen(); i++) {
            ext.send("{\"type\":\"event\",\"event\":\"activity\"}");
        }
        assertEquals(Protocol.CLOSE_RATE_LIMITED, ext.closed.get(5, TimeUnit.SECONDS));
    }

    @Test
    void newerPairedConnectionReplacesTheOldOne() throws Exception {
        FakeExtension first = FakeExtension.paired(port, TOKEN);
        FakeExtension second = FakeExtension.paired(port, TOKEN);
        assertEquals(WebSocketBridge.CLOSE_REPLACED, first.closed.get(3, TimeUnit.SECONDS));
        second.responder = cmd -> FakeExtension.ok(cmd, obj().put("who", "second"));
        assertEquals("second", bridge.send("status", null, null, SHORT).path("who").asString());
    }

    @Test
    void rotatingTheTokenEndsThePairingAtTheNextHeartbeat() throws Exception {
        AtomicReference<String> current = new AtomicReference<>(TOKEN);
        WebSocketBridge rotating = new WebSocketBridge(0, current::get, FakeExtension.ORIGIN, 400, 60_000);
        rotating.startAndWait();
        try {
            FakeExtension ext = FakeExtension.paired(rotating.getPort(), TOKEN);
            ext.send("{\"type\":\"ping\"}");
            Thread.sleep(150);
            assertTrue(ext.isOpen(), "heartbeat with an unchanged token keeps the connection");

            String rotated = Pairing.randomHex(32);
            current.set(rotated);
            ext.send("{\"type\":\"ping\"}");
            assertEquals(WebSocketBridge.CLOSE_UNAUTHORIZED, ext.closed.get(3, TimeUnit.SECONDS));

            // The next command does not wait for a heartbeat: a stale pairing is dropped before it is used.
            FakeExtension second = FakeExtension.paired(rotating.getPort(), rotated);
            String again = Pairing.randomHex(32);
            current.set(again);
            BrowserException refused = assertThrows(BrowserException.class,
                    () -> rotating.send("snapshot", "s1", null, SHORT));
            assertEquals("NOT_CONNECTED", refused.code());
            assertTrue(refused.getMessage().contains("pair the extension again"), refused.getMessage());
            assertTrue(second.commands.isEmpty(), "nothing may be sent over a pairing made with an old token");
            rotated = again;

            FakeExtension stale = new FakeExtension(rotating.getPort(), FakeExtension.ORIGIN, TOKEN);
            assertEquals(WebSocketBridge.CLOSE_UNAUTHORIZED, closedWith(stale));
            FakeExtension.paired(rotating.getPort(), rotated);
            assertTrue(rotating.isExtensionConnected());
        } finally {
            rotating.stop(500);
        }
    }

    @Test
    void tracksTheSessionsTheExtensionReports() throws Exception {
        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        ext.send("""
                {"type":"event","event":"sessions","data":{"sessions":[
                  {"session":"s2","clientId":"c-1","authorizationId":"a-9","origin":"https://app.example","tabId":41,
                   "frameId":0,"documentId":"d1","mode":"explore","generation":3,"state":"active",
                   "tab":{"title":"App","url":"https://app.example/x"}}]}}""");
        await(() -> !bridge.sessions().isEmpty());
        Protocol.Session session = bridge.sessions().get(0);
        assertEquals("s2", session.sessionId());
        assertEquals("https://app.example", session.origin());
        assertEquals(41, session.tabId());
        assertEquals("explore", session.mode());
        assertEquals("d1", session.documentId());
        assertEquals(3, session.generation());

        ext.closeBlocking();
        await(() -> bridge.sessions().isEmpty());
    }
}
