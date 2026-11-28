package tabgoblin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.io.PrintStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * One server for all agents, on one port: the processes that agents' programs start connect to it
 * there, each proves that it knows the pairing token, and each agent has its own id, sessions and
 * tools there. And what happens when the server ends: stopped by the user, left by its last agent,
 * or gone.
 */
class HubTest {

    static final String TOKEN = WebSocketBridgeTest.TOKEN;
    static final ObjectMapper JSON = new ObjectMapper();

    private final List<Hub> hubs = new java.util.concurrent.CopyOnWriteArrayList<>();
    private final List<Client> clients = new java.util.concurrent.CopyOnWriteArrayList<>();

    @AfterEach
    void endEverything() {
        clients.forEach(Client::leave);
        hubs.forEach(Hub::drop);
    }

    /** A free port for a server of the test's own. */
    private static int freePorts() throws IOException {
        for (int attempt = 0; attempt < 50; attempt++) {
            int port = 20_000 + (int) (Math.random() * 30_000);
            boolean free = true;
            for (int i = 0; i <= 0 && free; i++) {
                try (ServerSocket probe = new ServerSocket(port + i, 1, InetAddress.getByAddress(new byte[] {127, 0, 0, 1}))) {
                    probe.setReuseAddress(true);
                } catch (IOException e) {
                    free = false;
                }
            }
            if (free) {
                return port;
            }
        }
        throw new IOException("no free ports found");
    }

    private Hub hub(int port, boolean standing) throws IOException {
        return hub(port, standing, null);
    }

    /** A server that tells agents apart by the keys in this folder. */
    private Hub hub(int port, boolean standing, java.nio.file.Path agentKeys) throws IOException {
        Hub hub = Hub.open(new Agent.Settings(port, () -> TOKEN, FakeExtension.ORIGIN, () -> BlockedSites.Rule.NONE, agentKeys), standing);
        hubs.add(hub);
        Thread serving = new Thread(hub::serve, "test-hub");
        serving.setDaemon(true);
        serving.start();
        return hub;
    }

    private static void await(java.util.function.BooleanSupplier condition, String what) throws InterruptedException {
        for (int i = 0; i < 300 && !condition.getAsBoolean(); i++) {
            Thread.sleep(20);
        }
        assertTrue(condition.getAsBoolean(), "not reached in time: " + what);
    }

    /** An agent's program and the process it started: it writes MCP messages into the link and reads what comes back. */
    private final class Client {
        final PipedOutputStream toLink = new PipedOutputStream();
        final BlockingQueue<JsonNode> received = new LinkedBlockingQueue<>();
        final ByteArrayOutputStream log = new ByteArrayOutputStream();
        final AtomicInteger starts = new AtomicInteger();
        final Link link;
        final CompletableFuture<Link.End> ended = new CompletableFuture<>();

        Client(int port, String token, Link.Starter starter) throws IOException {
            this(port, token, starter, null, null);
        }

        /** An agent whose program names it: it has the key of that label in the folder. */
        Client(int port, String token, Link.Starter starter, String agent, java.nio.file.Path agentKeys) throws IOException {
            PipedInputStream linkIn = new PipedInputStream(toLink, 1 << 16);
            PipedOutputStream linkOut = new PipedOutputStream();
            BufferedReader fromLink = new BufferedReader(new InputStreamReader(new PipedInputStream(linkOut, 1 << 16), StandardCharsets.UTF_8));
            link = new Link(linkIn, linkOut, new PrintStream(log, true, StandardCharsets.UTF_8), () -> token, port, false, false, () -> {
                starts.incrementAndGet();
                starter.start();
            }, agent, agentKeys);
            Thread reading = new Thread(() -> {
                try {
                    String line;
                    while ((line = fromLink.readLine()) != null) {
                        received.add(JSON.readTree(line));
                    }
                } catch (IOException | RuntimeException e) {
                    // the link is gone
                }
            }, "test-client-reader");
            reading.setDaemon(true);
            reading.start();
            clients.add(this);
        }

        /** Connects, and passes messages from then on. */
        boolean connect() {
            if (!link.connect()) {
                return false;
            }
            Thread running = new Thread(() -> ended.complete(link.run()), "test-link");
            running.setDaemon(true);
            running.start();
            return true;
        }

        void send(String message) throws IOException {
            toLink.write((message + "\n").getBytes(StandardCharsets.UTF_8));
            toLink.flush();
        }

        /** The answer to the request with that id; what else arrives before it is left out. */
        JsonNode answerTo(int id) throws InterruptedException {
            long until = System.currentTimeMillis() + 8000;
            while (System.currentTimeMillis() < until) {
                JsonNode msg = received.poll(200, TimeUnit.MILLISECONDS);
                if (msg != null && msg.path("id").isNumber() && msg.path("id").asInt() == id && !msg.has("method")) {
                    return msg;
                }
            }
            throw new AssertionError("no answer to request " + id + "; this process's log:\n" + log());
        }

        JsonNode open(String name) throws Exception {
            send("{\"jsonrpc\":\"2.0\",\"id\":0,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-06-18\","
                    + "\"capabilities\":{},\"clientInfo\":{\"name\":\"" + name + "\",\"version\":\"1\"}}}");
            JsonNode answer = answerTo(0);
            send("{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}");
            return answer;
        }

        void call(int id, String tool, String arguments) throws IOException {
            send("{\"jsonrpc\":\"2.0\",\"id\":" + id + ",\"method\":\"tools/call\",\"params\":{\"name\":\"" + tool
                    + "\",\"arguments\":" + arguments + "}}");
        }

        String text(JsonNode answer) {
            return answer.path("result").path("content").path(0).path("text").asString("");
        }

        String log() {
            return log.toString(StandardCharsets.UTF_8);
        }

        void leave() {
            try {
                toLink.close();
            } catch (IOException e) {
                // gone anyway
            }
        }
    }

    @Test
    void anAgentsProcessConnectsToTheServerAndItsToolsWorkThroughIt() throws Exception {
        int port = freePorts();
        Hub hub = hub(port, false);
        Client client = new Client(port, TOKEN, () -> { });
        assertTrue(client.connect());
        assertEquals(0, client.starts.get(), "the server was there: none was started");

        JsonNode opened = client.open("claude-code");
        assertEquals("tabgoblin", opened.path("result").path("serverInfo").path("name").asString());
        await(() -> hub.agents().size() == 1, "the agent to be with the server");
        Agent agent = hub.agents().get(0);
        // The agent's name comes from its opening message, as it does where an agent has a process of its own.
        await(() -> agent.bridge().clientName().equals("claude-code"), "the agent's name");
        assertEquals(port, agent.bridge().getPort(), "the agent is on the server's port");

        client.send("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}");
        assertEquals(14, client.answerTo(1).path("result").path("tools").size());

        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        client.call(2, "browser_status", "{}");
        String status = client.text(client.answerTo(2));
        assertTrue(status.contains("Extension: connected"), status);
        assertTrue(status.contains("This agent: " + agent.bridge().clientId()), status);
        assertFalse(status.contains(" on port "), "the port is the server's, not the agent's: " + status);
        ext.closeBlocking();
    }

    @Test
    void twoAgentsOfOneServerShareItsConnectionAndEachHasItsOwnSessions() throws Exception {
        int port = freePorts();
        Hub hub = hub(port, false);
        Client first = new Client(port, TOKEN, () -> { });
        Client second = new Client(port, TOKEN, () -> { });
        assertTrue(first.connect());
        first.open("claude-code");
        await(() -> hub.agents().size() == 1, "the first agent");
        assertTrue(second.connect());
        second.open("IntelliJ IDEA");
        await(() -> hub.agents().size() == 2, "the second agent");

        Agent one = hub.agents().get(0);
        Agent two = hub.agents().get(1);
        assertEquals(port, one.bridge().getPort());
        assertEquals(port, two.bridge().getPort(), "the one port is every agent's");
        assertNotEquals(one.bridge().clientId(), two.bridge().clientId());
        await(() -> two.bridge().clientName().equals("IntelliJ IDEA"), "the second agent's name");

        // The extension is connected to the server once, knows both agents, and tells each its own sessions.
        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        assertEquals(List.of(one.bridge().clientId(), two.bridge().clientId()), ext.agents());
        assertEquals("IntelliJ IDEA", ext.nameOf(two.bridge().clientId()));
        ext.sessions(one.bridge().clientId(), JSON.createArrayNode().add(JSON.createObjectNode().put("session", "s1")
                .put("origin", "https://a.example").put("mode", "read").put("state", "active")));
        await(() -> one.bridge().sessions().size() == 1, "the first agent's session");
        assertTrue(two.bridge().sessions().isEmpty(), "an agent is told nothing of another's tabs");
        // A command names its agent, and the answer goes to that agent and to no other.
        ext.responder = cmd -> cmd.path("agent").asString().equals(one.bridge().clientId())
                ? FakeExtension.ok(cmd, JSON.createObjectNode().put("text", "the first agent's page"))
                : FakeExtension.fail(cmd, "NOT_AUTHORIZED", "No tab is authorized for this agent.");
        first.call(5, "browser_snapshot", "{}");
        assertTrue(first.text(first.answerTo(5)).contains("the first agent's page"));
        second.call(5, "browser_snapshot", "{}");
        assertTrue(second.text(second.answerTo(5)).contains("Error [NOT_AUTHORIZED]"));
        assertEquals(2, ext.commands.size());

        // A line of the log that is one agent's goes to the log of that agent's process, and to no other's.
        await(() -> second.log().contains("code=NOT_AUTHORIZED"), "the second agent's line in its own log");
        assertFalse(first.log().contains("code=NOT_AUTHORIZED"), first.log());
        assertTrue(first.log().contains("serving client=" + one.bridge().clientId()), first.log());
        assertFalse(first.log().contains(two.bridge().clientId()), "nothing of the other agent: " + first.log());

        // One agent goes: the other works on, and the extension is told who is left.
        first.leave();
        assertEquals(Link.End.AGENT_LEFT, first.ended.get(5, TimeUnit.SECONDS));
        await(() -> hub.agents().size() == 1, "the first agent to be gone");
        await(() -> ext.agents().equals(List.of(two.bridge().clientId())), "the extension to be told");
        second.call(6, "browser_snapshot", "{}");
        assertTrue(second.text(second.answerTo(6)).contains("Error [NOT_AUTHORIZED]"));
        ext.closeBlocking();
    }

    @Test
    void aProcessThatDoesNotKnowTheTokenIsNoAgentAndASeriesOfThemIsShutOut() throws Exception {
        int port = freePorts();
        Hub hub = hub(port, false);
        Client stranger = new Client(port, "f".repeat(64), () -> { });
        assertFalse(stranger.connect());
        assertTrue(stranger.log().contains("reason=proof"), stranger.log());
        assertTrue(hub.agents().isEmpty());
        assertEquals(0, stranger.starts.get(), "a server that refuses is not started a second time");

        // Something that is not a link at all: it is given the first message, and nothing after it.
        RawLink raw = new RawLink(port);
        assertTrue(raw.connectBlocking(3, TimeUnit.SECONDS));
        JsonNode hello = JSON.readTree(raw.take());
        assertEquals("hello", hello.path("type").asString());
        assertFalse(hello.has("clientId"), "it says nothing of an agent before the proof");
        raw.send("GET / HTTP/1.1");
        assertNull(raw.take(), "closed without a word");
        // Wrong proofs are counted, and after ten nobody is listened to for a while: not the right one either.
        for (int i = 0; i < 10; i++) {
            assertFalse(new Client(port, "e".repeat(64), () -> { }).connect());
        }
        Client late = new Client(port, TOKEN, () -> { });
        assertFalse(late.connect());
        assertTrue(hub.agents().isEmpty());
    }

    @Test
    void aProgramThatHoldsTheServersPortIsNotTakenForTheServer() throws Exception {
        int port = freePorts();
        try (ServerSocket other = new ServerSocket(port, 5, InetAddress.getByAddress(new byte[] {127, 0, 0, 1}))) {
            Thread answering = new Thread(() -> {
                try (Socket socket = other.accept()) {
                    socket.getOutputStream().write("220 some other service ready\r\n".getBytes(StandardCharsets.UTF_8));
                    socket.getOutputStream().flush();
                    Thread.sleep(500);
                } catch (IOException | InterruptedException e) {
                    // the test is over
                }
            }, "test-other-program");
            answering.setDaemon(true);
            answering.start();
            Client client = new Client(port, TOKEN, () -> { });
            // The process then serves its agent alone: that is the caller's part, and none of the agent's messages was touched.
            assertFalse(client.connect());
            assertTrue(client.link.refusal().startsWith("WebSocket connection ended before opening"), client.log());
            assertEquals(0, client.starts.get());
        }
    }

    @Test
    void whereThereIsNoServerOneIsStartedAndTheAgentWaitsForIt() throws Exception {
        int port = freePorts();
        Client client = new Client(port, TOKEN, () -> hub(port, false));
        assertTrue(client.connect());
        assertEquals(1, client.starts.get());
        assertEquals("tabgoblin", client.open("claude-code").path("result").path("serverInfo").path("name").asString());
    }

    @Test
    void whenTheServerIsGoneAndNobodyStoppedItItIsStartedAnewAndTheAgentIsToldWhatItWaitedFor() throws Exception {
        int port = freePorts();
        Hub first = hub(port, false);
        Client client = new Client(port, TOKEN, () -> hub(port, false));
        assertTrue(client.connect());
        client.open("claude-code");
        await(() -> first.agents().size() == 1, "the agent");
        String firstId = first.agents().get(0).bridge().clientId();
        // A call that the browser does not answer: the agent is waiting for it when the server's process ends.
        FakeExtension silent = FakeExtension.paired(port, TOKEN);
        silent.responder = cmd -> null;
        client.call(7, "browser_click", "{\"ref\":4}");
        await(() -> silent.commands.size() == 1, "the command to reach the browser");

        first.drop();

        // The agent gets an answer to its call: the outcome is unknown, and it was not sent again.
        JsonNode lost = client.answerTo(7);
        assertTrue(lost.path("result").path("isError").asBoolean(), lost.toString());
        assertTrue(client.text(lost).startsWith("Error [CONNECTION_LOST]"), client.text(lost));
        assertTrue(client.text(lost).contains("not retried"), client.text(lost));
        // A server is started in its place, once, and told who this agent is: by the opening message sent anew.
        await(() -> hubs.size() == 2 && hubs.get(1).agents().size() == 1, "the agent to be with the new server");
        assertEquals(1, client.starts.get());
        Agent again = hubs.get(1).agents().get(0);
        await(() -> again.bridge().clientName().equals("claude-code"), "the agent's name at the new server");
        assertNotEquals(firstId, again.bridge().clientId(), "a new server, and a new id");
        // The agent goes on as if nothing had happened to its connection, and sees no second answer to its opening.
        client.send("{\"jsonrpc\":\"2.0\",\"id\":8,\"method\":\"tools/list\"}");
        assertEquals(14, client.answerTo(8).path("result").path("tools").size());
        assertTrue(client.received.stream().noneMatch(msg -> msg.path("id").asInt(-1) == 0), "the opening was answered once");
        assertEquals(1, silent.commands.size(), "nothing was sent to the browser a second time");
        assertTrue(client.log().contains("the server has gone: starting it anew"), client.log());
    }

    @Test
    void stoppedByTheUserTheServerEndsForEveryAgentAndNoneStartsItAnew() throws Exception {
        int port = freePorts();
        Hub hub = hub(port, false);
        Client first = new Client(port, TOKEN, () -> hub(port, false));
        Client second = new Client(port, TOKEN, () -> hub(port, false));
        assertTrue(first.connect());
        assertTrue(second.connect());
        first.open("claude-code");
        second.open("IntelliJ IDEA");
        await(() -> hub.agents().size() == 2, "both agents");

        hub.close();

        assertEquals(Link.End.SERVER_STOPPED, first.ended.get(5, TimeUnit.SECONDS));
        assertEquals(Link.End.SERVER_STOPPED, second.ended.get(5, TimeUnit.SECONDS));
        assertEquals(0, first.starts.get() + second.starts.get(), "a stop is no loss to make good");
        assertFalse(hub.open());
        assertEquals(1, hubs.size());
    }

    @Test
    void theServerEndsWhenItsLastAgentHasGoneUnlessTheUserStartedIt() throws Exception {
        int port = freePorts();
        Hub hub = hub(port, false);
        hub.emptyFor(300);
        AtomicInteger ended = new AtomicInteger();
        hub.whenEmpty(ended::incrementAndGet);
        // Before its first agent it waits as well: the process that started it is on its way.
        Client client = new Client(port, TOKEN, () -> { });
        assertTrue(client.connect());
        client.open("claude-code");
        await(() -> hub.agents().size() == 1, "the agent");
        Thread.sleep(500);
        assertEquals(0, ended.get(), "it stays while an agent is there");
        client.leave();
        await(() -> ended.get() == 1, "the server to end after its last agent");

        // One that the user started stays, with no agent, until it is stopped.
        int other = freePorts();
        Hub standing = hub(other, true);
        standing.emptyFor(200);
        AtomicInteger never = new AtomicInteger();
        standing.whenEmpty(never::incrementAndGet);
        Thread.sleep(700);
        assertEquals(0, never.get());
        assertTrue(standing.open());
    }

    /**
     * An agent's program may end the process it started at once, without closing anything. The
     * server then finds that agent's connection broken, not ended. That is the agent's going all
     * the same: found by six servers that were still running forty minutes after their agents'
     * processes had been ended that way.
     */
    @Test
    void anAgentWhoseProcessIsEndedAtOnceIsGoneForTheServerAsOneThatLeftInOrder() throws Exception {
        int port = freePorts();
        Hub hub = hub(port, false);
        hub.emptyFor(300);
        AtomicInteger ended = new AtomicInteger();
        hub.whenEmpty(ended::incrementAndGet);

        // What a link does, by hand, so that the connection can be broken as a killed process breaks it.
        RawLink raw = new RawLink(port);
        assertTrue(raw.connectBlocking(3, TimeUnit.SECONDS));
        String serverNonce = JSON.readTree(raw.take()).path("nonce").asString();
        String nonce = Pairing.randomHex(16);
        raw.send("{\"type\":\"attach\",\"nonce\":\"" + nonce + "\",\"proof\":\""
                + Pairing.linkProof(TOKEN, serverNonce, nonce) + "\",\"link\":" + Link.VERSION + ",\"panel\":false}");
        assertEquals("attached", JSON.readTree(raw.take()).path("type").asString());
        raw.send("{\"jsonrpc\":\"2.0\",\"id\":0,\"method\":\"initialize\",\"params\":{\"protocolVersion\":"
                + "\"2025-06-18\",\"capabilities\":{},\"clientInfo\":{\"name\":\"claude-code\",\"version\":\"1\"}}}");
        await(() -> hub.agents().size() == 1, "the agent to be with the server");

        // Broken, not closed: the other side gets an error where it would have got the end.
        raw.getSocket().setSoLinger(true, 0);
        raw.getSocket().close();

        await(() -> hub.agents().isEmpty(), "the agent to be gone for the server");
        await(() -> ended.get() == 1, "the server to end after its last agent");
    }

    /** A connection of a process to the server, by hand: what a link speaks, without a link. */
    private static final class RawLink extends org.java_websocket.client.WebSocketClient {
        private final java.util.concurrent.BlockingQueue<String> in = new java.util.concurrent.LinkedBlockingQueue<>();

        RawLink(int port) {
            super(java.net.URI.create("ws://127.0.0.1:" + port + ExtensionServer.LINK_PATH), new org.java_websocket.drafts.Draft_6455(),
                    java.util.Map.of(), 2000);
        }

        /** The next message, or null once the connection has ended. */
        String take() throws InterruptedException {
            String next = in.poll(5, TimeUnit.SECONDS);
            return next == null || next.equals("\u0000") ? null : next;
        }

        @Override
        public void onOpen(org.java_websocket.handshake.ServerHandshake handshake) {
        }

        @Override
        public void onMessage(String message) {
            in.add(message);
        }

        @Override
        public void onClose(int code, String reason, boolean remote) {
            in.add("\u0000");
        }

        @Override
        public void onError(Exception ex) {
        }
    }

    /** A browser that comes to an agent's port with a token that is not the server's, and is turned away. */
    private static void comeWithAnotherToken(Agent agent) throws Exception {
        FakeExtension stale = new FakeExtension(agent.bridge().getPort(), FakeExtension.ORIGIN, "f".repeat(64));
        stale.connectBlocking();
        await(() -> agent.bridge().lastCloseCode() == Protocol.CLOSE_UNAUTHORIZED, "the browser to be turned away");
    }

    @Test
    void whenTheBrowserCameWithAnotherTokenTheWindowComesUpByItselfOnceForTheNextToolThatFindsNone() throws Exception {
        int port = freePorts();
        Hub hub = hub(port, false);
        AtomicInteger shown = new AtomicInteger();
        java.util.concurrent.atomic.AtomicBoolean up = new java.util.concurrent.atomic.AtomicBoolean();
        hub.window(() -> {
            shown.incrementAndGet();
            up.set(true);
        }, up::get);
        Client agent = new Client(port, TOKEN, () -> { });
        assertTrue(agent.connect());
        agent.open("claude-code");
        await(() -> hub.agents().size() == 1, "the agent");

        // No browser has come. One that is paired is on its way as a rule: no window for that.
        assertEquals(new BrowserService.Unpaired(false, false, false), hub.unpaired(false));
        assertEquals(0, shown.get());
        assertFalse(hub.standing());

        // A browser came with another token: now the user has to paste the server's, and the window comes up.
        // That browser came here, so another server is not where it is: nothing is said of one, now or after it left.
        comeWithAnotherToken(hub.agents().get(0));
        assertEquals(new BrowserService.Unpaired(false, true, true), hub.unpaired(false));
        assertEquals(1, shown.get());
        assertFalse(hub.standing(), "a window that came up by itself does not make the server stay");
        // Asked again, it is not brought to the front again: once is enough until something is paired.
        assertEquals(new BrowserService.Unpaired(false, true, true), hub.unpaired(false));
        assertEquals(1, shown.get());

        // The browser is paired with this agent. A second agent that it has not found yet has nothing
        // to paste: the browser is paired with the server.
        FakeExtension ext = FakeExtension.paired(port, TOKEN);
        await(() -> hub.agents().get(0).bridge().isExtensionConnected(), "the pairing");
        assertEquals(new BrowserService.Unpaired(true, false, true), hub.unpaired(false));
        assertEquals(1, shown.get());

        // The browser goes, as when Chrome is closed: nothing is wrong with its token, and no window comes.
        ext.closeBlocking();
        await(() -> !hub.agents().get(0).bridge().isExtensionConnected(), "the browser to be gone");
        assertEquals(new BrowserService.Unpaired(false, false, true), hub.unpaired(false));
        assertEquals(1, shown.get());
        // It comes with another token again, as after a rotation: the window comes up once more.
        comeWithAnotherToken(hub.agents().get(0));
        assertEquals(new BrowserService.Unpaired(false, true, true), hub.unpaired(false));
        assertEquals(2, shown.get());
    }

    @Test
    void noWindowComesUpByItselfForAnAgentThatWantsNoneNorWhileTheUserHasTheBrowserSwitchedOff() throws Exception {
        int port = freePorts();
        Hub hub = hub(port, false);
        AtomicInteger shown = new AtomicInteger();
        hub.window(shown::incrementAndGet);
        Client agent = new Client(port, TOKEN, () -> { });
        assertTrue(agent.connect());
        agent.open("claude-code");
        await(() -> hub.agents().size() == 1, "the agent");
        comeWithAnotherToken(hub.agents().get(0));
        // Started with --no-panel: it is known that the browser holds another token, and no window comes.
        assertEquals(new BrowserService.Unpaired(false, true, false), hub.unpaired(true));
        assertEquals(0, shown.get());
        // Switched off in the window: pairing would change nothing.
        hub.setHeld(true);
        assertEquals(new BrowserService.Unpaired(false, true, false), hub.unpaired(false));
        assertEquals(0, shown.get());
        hub.setHeld(false);
        // A server that has no display says so by having no window: the token comes from the command then.
        assertEquals(new BrowserService.Unpaired(false, true, false), hub.unpaired(false));
        assertEquals(1, shown.get(), "the window was asked for; that none came is the display's doing");
    }

    @Test
    void askedForItsWindowTheServerShowsItAndStaysForTheUser() throws Exception {
        int port = freePorts();
        Link asker = new Link(java.io.InputStream.nullInputStream(), java.io.OutputStream.nullOutputStream(),
                new PrintStream(new ByteArrayOutputStream()), () -> TOKEN, port, true, () -> { });
        assertFalse(asker.show(), "no server runs: there is no window to ask for");

        Hub hub = hub(port, false);
        AtomicInteger shown = new AtomicInteger();
        hub.window(shown::incrementAndGet);
        assertFalse(hub.standing());
        assertTrue(asker.show());
        assertEquals(1, shown.get());
        // The user asked for it by hand: the server is theirs to stop now, and does not end with its agents.
        assertTrue(hub.standing());
        assertTrue(hub.agents().isEmpty(), "asking for the window makes no agent");
        // An agent whose settings ask for the window has it shown as well.
        PipedOutputStream toLink = new PipedOutputStream();
        Link wishing = new Link(new PipedInputStream(toLink), java.io.OutputStream.nullOutputStream(),
                new PrintStream(new ByteArrayOutputStream()), () -> TOKEN, port, true, () -> { });
        assertTrue(wishing.connect());
        await(() -> shown.get() == 2, "the window to be asked for by the agent's settings");
        toLink.close();
    }

    /** What a tool answers through a client, as text. */
    private static String status(Client client, int id) throws Exception {
        client.call(id, "browser_status", "{}");
        return client.text(client.answerTo(id));
    }

    @Test
    void anAgentWithAKeyIsTheSameAgentAtEveryStartAndOneThatOnlyHasItsNameIsNot(@org.junit.jupiter.api.io.TempDir java.nio.file.Path keys)
            throws Exception {
        int port = freePorts();
        Hub hub = hub(port, true, keys);
        Client first = new Client(port, TOKEN, () -> { }, "ide", keys);
        assertTrue(first.connect());
        first.open("my-ide");
        await(() -> hub.agents().size() == 1, "the agent to be with the server");
        String id = hub.agents().get(0).bridge().clientId();
        assertTrue(id.matches("a-[0-9a-f]{12}"), id);
        assertEquals(AgentKeys.idOf(AgentKeys.read(keys, "ide")), id, "the id is the one its key has");
        assertFalse(id.contains(AgentKeys.read(keys, "ide").substring(0, 8)), "and says nothing of the key");
        first.leave();
        await(() -> hub.agents().isEmpty(), "the agent to have gone");

        // Started again, under another name: the same key, so the same agent.
        Client again = new Client(port, TOKEN, () -> { }, "ide", keys);
        assertTrue(again.connect());
        again.open("renamed");
        await(() -> hub.agents().size() == 1, "the agent to be back");
        assertEquals(id, hub.agents().get(0).bridge().clientId());

        // A program that gives itself the first one's name, and has no key: another agent, with an id for this start.
        Client sameName = new Client(port, TOKEN, () -> { });
        assertTrue(sameName.connect());
        sameName.open("my-ide");
        await(() -> hub.agents().size() == 2, "the second agent");
        String other = hub.agents().stream().map(a -> a.bridge().clientId()).filter(x -> !x.equals(id)).findFirst().orElseThrow();
        assertTrue(other.matches("c-[0-9a-f]{8}"), other);

        // And an agent with a key of its own is a third.
        Client another = new Client(port, TOKEN, () -> { }, "cli", keys);
        assertTrue(another.connect());
        another.open("my-ide");
        await(() -> hub.agents().size() == 3, "the third agent");
        assertEquals(3, hub.agents().stream().map(a -> a.bridge().clientId()).distinct().count());
        assertFalse(AgentKeys.read(keys, "ide").equals(AgentKeys.read(keys, "cli")));
        assertFalse(AgentKeys.read(keys, "ide").equals(TOKEN), "an agent's key is not the pairing token");
    }

    /** One message to the server as a link writes it, and the server's answer to it. */
    private static JsonNode attachBy(int port, java.util.function.BiConsumer<tools.jackson.databind.node.ObjectNode, String> fill) throws Exception {
        RawLink raw = new RawLink(port);
        try {
            assertTrue(raw.connectBlocking(3, TimeUnit.SECONDS));
            String nonce = JSON.readTree(raw.take()).path("nonce").asString();
            String mine = "0123456789abcdef0123456789abcdef";
            tools.jackson.databind.node.ObjectNode ask = JSON.createObjectNode();
            ask.put("type", "attach").put("nonce", mine).put("link", Link.VERSION);
            ask.put("proof", Pairing.linkProof(TOKEN, nonce, mine));
            fill.accept(ask, AgentKeys.class.getSimpleName() + ":" + nonce + ":" + mine);
            raw.send(JSON.writeValueAsString(ask));
            return JSON.readTree(raw.take());
        } finally {
            raw.close();
        }
    }

    @Test
    void aProcessThatKnowsThePairingTokenAndNotAnAgentsKeyIsNotThatAgent(@org.junit.jupiter.api.io.TempDir java.nio.file.Path keys)
            throws Exception {
        int port = freePorts();
        Hub hub = hub(port, true, keys);
        String key = AgentKeys.loadOrCreate(keys, "ide");

        // The pairing token is proven, and the agent's key is not: no proof, a made-up one, and one made with the token.
        assertEquals("agent_proof", attachBy(port, (ask, x) -> ask.put("agent", "ide")).path("reason").asString());
        assertEquals("agent_proof", attachBy(port, (ask, x) -> ask.put("agent", "ide").put("agentProof", "0".repeat(64))).path("reason").asString());
        assertEquals("agent_proof", attachBy(port, (ask, x) -> ask.put("agent", "ide")
                .put("agentProof", Pairing.linkProof(TOKEN, x.split(":")[1], x.split(":")[2]))).path("reason").asString());
        // A label that has no key, and one that is no label: neither is made an agent, and no key is made for it here.
        assertEquals("agent_proof", attachBy(port, (ask, x) -> ask.put("agent", "nobody").put("agentProof", "0".repeat(64))).path("reason").asString());
        assertEquals("agent_proof", attachBy(port, (ask, x) -> ask.put("agent", "../pairing-token").put("agentProof", "0".repeat(64))).path("reason").asString());
        assertTrue(AgentKeys.read(keys, "nobody").isEmpty());
        assertTrue(hub.agents().isEmpty(), "none of them is served");

        // With the key's proof it is that agent.
        JsonNode attached = attachBy(port, (ask, x) -> ask.put("agent", "ide")
                .put("agentProof", AgentKeys.proof(key, x.split(":")[1], x.split(":")[2])));
        assertEquals("attached", attached.path("type").asString());
    }

    @Test
    void ofTwoProcessesThatHoldOneKeyAtOnceOnlyTheFirstIsThatAgent(@org.junit.jupiter.api.io.TempDir java.nio.file.Path keys) throws Exception {
        int port = freePorts();
        Hub hub = hub(port, true, keys);
        Client first = new Client(port, TOKEN, () -> { }, "ide", keys);
        assertTrue(first.connect());
        first.open("ide");
        await(() -> hub.agents().size() == 1, "the first agent");
        String id = hub.agents().get(0).bridge().clientId();

        Client second = new Client(port, TOKEN, () -> { }, "ide", keys);
        assertTrue(second.connect());
        second.open("ide");
        await(() -> hub.agents().size() == 2, "the second agent");
        String other = hub.agents().stream().map(a -> a.bridge().clientId()).filter(x -> !x.equals(id)).findFirst().orElseThrow();
        assertTrue(other.matches(id + "~[0-9a-f]{4}"), other);
        // A tab has one agent: the extension binds a tab to the id, and this is not the first one's id.
        FakeExtension ext = FakeExtension.paired(hub.agents().stream().filter(a -> a.bridge().clientId().equals(other)).findFirst().orElseThrow()
                .bridge().getPort(), TOKEN);
        String said = status(second, 1);
        assertTrue(said.contains("another agent with the identity \"ide\" is connected"), said);
        ext.closeBlocking();
    }

    @Test
    void anAgentTheUserRevokedHasNoToolAndAllowedAgainItIsANewAgent(@org.junit.jupiter.api.io.TempDir java.nio.file.Path keys) throws Exception {
        int port = freePorts();
        Hub hub = hub(port, true, keys);
        Client agent = new Client(port, TOKEN, () -> { }, "ide", keys);
        assertTrue(agent.connect());
        agent.open("ide");
        await(() -> hub.agents().size() == 1, "the agent");
        String id = hub.agents().get(0).bridge().clientId();
        FakeExtension ext = FakeExtension.paired(hub.agents().get(0).bridge().getPort(), TOKEN);
        assertTrue(status(agent, 1).contains("identity \"ide\": the same agent at every start"));
        int sentBefore = ext.commands.size();

        // Revoked while it runs: its next call is refused, whatever the tool, and nothing is sent to a browser.
        AgentKeys.revoke(keys, "ide");
        assertTrue(status(agent, 2).startsWith("Error [AGENT_REVOKED]"), status(agent, 3));
        agent.call(4, "browser_snapshot", "{}");
        assertTrue(agent.text(agent.answerTo(4)).startsWith("Error [AGENT_REVOKED]"));
        assertEquals(sentBefore, ext.commands.size(), "nothing reached the browser");
        ext.closeBlocking();
        assertTrue(AgentKeys.read(keys, "ide").isEmpty(), "its key is gone");
        agent.leave();
        await(() -> hub.agents().isEmpty(), "the agent to have gone");

        // Started again it is served, has no key made for it, and is told the same.
        Client again = new Client(port, TOKEN, () -> { }, "ide", keys);
        assertTrue(again.connect());
        again.open("ide");
        await(() -> hub.agents().size() == 1, "the revoked agent");
        assertTrue(status(again, 1).startsWith("Error [AGENT_REVOKED]"));
        assertTrue(AgentKeys.read(keys, "ide").isEmpty(), "no key is made for a label that is revoked");
        assertFalse(hub.agents().get(0).bridge().clientId().equals(id), "the id it had is nobody's");
        again.leave();
        await(() -> hub.agents().isEmpty(), "the agent to have gone");

        // Another agent was not touched by it.
        Client other = new Client(port, TOKEN, () -> { }, "cli", keys);
        assertTrue(other.connect());
        other.open("cli");
        await(() -> hub.agents().size() == 1, "the other agent");
        FakeExtension forOther = FakeExtension.paired(hub.agents().get(0).bridge().getPort(), TOKEN);
        assertTrue(status(other, 1).contains("identity \"cli\""));
        forOther.closeBlocking();

        // Allowed again: a new key, so a new agent. Nothing of the old one comes back to it.
        assertTrue(AgentKeys.allow(keys, "ide"));
        Client anew = new Client(port, TOKEN, () -> { }, "ide", keys);
        assertTrue(anew.connect());
        anew.open("ide");
        await(() -> hub.agents().size() == 2, "the agent, allowed again");
        assertFalse(hub.agents().stream().anyMatch(a -> a.bridge().clientId().equals(id)));
        assertEquals(2, hub.agents().stream().filter(a -> a.bridge().clientId().matches("a-[0-9a-f]{12}")).count());
    }

    @Test
    void anAgentOfAnInterfaceTheSettingsTurnedOffIsTurnedAwayAndCountedForTheWindow(@org.junit.jupiter.api.io.TempDir java.nio.file.Path keys)
            throws Exception {
        int port = freePorts();
        java.util.concurrent.atomic.AtomicReference<BlockedSites.Rule> rule = new java.util.concurrent.atomic.AtomicReference<>(
                new BlockedSites.Rule(java.util.List.of(), null, new BlockedSites.Limits(false, java.util.List.of(), true,
                        BlockedSites.Access.WRITE, 0, 0, true, false)));
        Hub hub = Hub.open(new Agent.Settings(port, () -> TOKEN, FakeExtension.ORIGIN, rule::get, keys), true);
        hubs.add(hub);
        Thread serving = new Thread(hub::serve, "test-hub");
        serving.setDaemon(true);
        serving.start();

        // MCP is off: an MCP agent's process is refused with the reason, and counted; a command is let in.
        assertEquals("interface_not_allowed", attachBy(port, (ask, x) -> { }).path("reason").asString());
        assertEquals(1, hub.turnedAway());
        assertEquals(0, hub.agents().size());
        AgentKeys.loadOrCreate(keys, "cli");
        assertEquals("attached", attachBy(port, (ask, x) -> ask.put("cli", true).put("agent", "cli")
                .put("agentProof", AgentKeys.proof(AgentKeys.read(keys, "cli"), x.split(":")[1], x.split(":")[2]))).path("type").asString());
        // An MCP start that found MCP off before it came here says so, and is counted too.
        assertEquals("counted", attachBy(port, (ask, x) -> ask.put("type", "turned_away")).path("type").asString());
        assertEquals(2, hub.turnedAway());

        // The command line is off: a command is refused, an MCP agent is let in, and nothing more is counted.
        rule.set(new BlockedSites.Rule(java.util.List.of(), null, new BlockedSites.Limits(false, java.util.List.of(), true,
                BlockedSites.Access.WRITE, 0, 0, false, true)));
        assertEquals("interface_not_allowed", attachBy(port, (ask, x) -> ask.put("cli", true).put("agent", "cli")
                .put("agentProof", AgentKeys.proof(AgentKeys.read(keys, "cli"), x.split(":")[1], x.split(":")[2]))).path("reason").asString());
        assertEquals("attached", attachBy(port, (ask, x) -> { }).path("type").asString());
        assertEquals("counted", attachBy(port, (ask, x) -> ask.put("type", "turned_away")).path("type").asString());
        assertEquals(2, hub.turnedAway());
        // A file that cannot be read turns nobody away here: every tool says so instead.
        rule.set(new BlockedSites.Rule(java.util.List.of(), "it cannot be read"));
        assertEquals("attached", attachBy(port, (ask, x) -> { }).path("type").asString());
    }
}
