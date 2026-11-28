package tabgoblin;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.UnknownHostException;
import java.nio.ByteBuffer;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;
import org.java_websocket.WebSocket;
import org.java_websocket.drafts.Draft;
import org.java_websocket.drafts.Draft_6455;
import org.java_websocket.exceptions.InvalidDataException;
import org.java_websocket.exceptions.WebsocketNotConnectedException;
import org.java_websocket.framing.CloseFrame;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.handshake.ServerHandshakeBuilder;
import org.java_websocket.server.WebSocketServer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * The one port of the server, on the loopback address. Two kinds of connection come to it: the
 * Chrome extension, which pairs once and then carries every agent of the server ({@link Protocol});
 * and the processes of the agents' programs, on the path {@code /link}, whose messages go to the
 * server ({@link Hub}) and are no business of this class beyond telling them apart.
 *
 * <p>Security: binds to 127.0.0.1 only; the extension's path rejects a handshake whose Origin is
 * not the expected extension, and the link's path rejects any Origin at all, which a web page
 * cannot leave out; the extension proves that it knows the pairing token before anything passes,
 * repeated failed pairings lock new connections out for a while, a rotated token ends the pairing,
 * and messages are limited in size and rate. Every command has a deadline.
 *
 * <p>The agents are {@link WebSocketBridge}s: one for each agent, added when it is served and
 * taken out when it goes. The extension is told of them, and tells back which of them the user
 * disconnected. Nothing passes from one agent to another here: a command names its agent, an
 * answer or an event is given to the agent it names, and a message that names an agent that is
 * not here is dropped.
 */
public class ExtensionServer extends WebSocketServer {

    /** Largest accepted inbound message (screenshots are the big ones). */
    static final int MAX_MESSAGE_BYTES = 8 * 1024 * 1024;
    static final int CLOSE_UNAUTHORIZED = Protocol.CLOSE_UNAUTHORIZED;
    static final int CLOSE_REPLACED = Protocol.CLOSE_REPLACED;
    /** Failed pairings within the window before new connections are refused for a while. */
    static final int MAX_FAILED_PAIRINGS = 10;
    static final int MAX_MESSAGES_PER_SECOND = 300;
    /** Matches any chrome-extension:// origin instead of one pinned extension id. */
    public static final String ANY_EXTENSION_ORIGIN = "any";
    /** The path the agents' processes connect on; the extension connects on the root. */
    static final String LINK_PATH = "/link";

    /** What the server does with the connections of the agents' processes. */
    interface Links {
        void opened(WebSocket conn);

        void message(WebSocket conn, String text);

        void closed(WebSocket conn, int code);
    }

    private final Supplier<String> token;
    private final String allowedOrigin;
    private final long authTimeoutMs;
    private final long lockoutMs;
    private final ObjectMapper json = new ObjectMapper();
    private final CompletableFuture<Void> started = new CompletableFuture<>();
    private final Deque<Long> failedPairings = new ArrayDeque<>();
    /** Held while a connection becomes the paired one and is answered, and while the agents are told. */
    private final Object pairing = new Object();
    private final List<WebSocketBridge> agents = new CopyOnWriteArrayList<>();
    /** Whose a command that is out is, by the command's id: the answer goes to that agent. */
    private final Map<String, WebSocketBridge> outstanding = new ConcurrentHashMap<>();
    private final AtomicLong ids = new AtomicLong();
    /** The connection the extension is paired on, or null. */
    private volatile WebSocket paired;
    /** When the paired connection was made, or 0 while there is none. */
    private volatile long connectedSince;
    /** The close code of the last paired connection that ended, or 0. */
    private volatile int lastCloseCode;
    /** The user switched the connection to the browser off, in the panel. */
    private volatile boolean held;
    /** A browser came with a token that is not this server's, and none is paired since. */
    private volatile boolean turnedAway;
    /** The sites no agent may work on, as they are now. */
    private volatile Supplier<BlockedSites.Rule> blocked = () -> BlockedSites.Rule.NONE;
    /** The list as it was at the last look. */
    private volatile BlockedSites.Rule lastLooked = BlockedSites.Rule.NONE;
    private volatile Links links = new Links() {
        @Override
        public void opened(WebSocket conn) {
            // No server behind this port takes links: the connection gets no word, and its process gives up on it.
        }

        @Override
        public void message(WebSocket conn, String text) {
        }

        @Override
        public void closed(WebSocket conn, int code) {
        }
    };
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "tabgoblin-auth-timer");
        t.setDaemon(true);
        return t;
    });

    /** Per-connection handshake and rate state. */
    private static final class Peer {
        final boolean link;
        final String nonce = Pairing.randomHex(16);
        volatile boolean authenticated;
        volatile String tokenAtPairing;
        /** The extension has said something as a paired one: it has checked the server's proof. */
        volatile boolean spoke;
        /** The blocked sites as this extension was last told them; null before it was told. */
        volatile BlockedSites.Rule told;
        long windowStart;
        int messagesInWindow;

        Peer(boolean link) {
            this.link = link;
        }
    }

    public ExtensionServer(int port, Supplier<String> token, String allowedOrigin) {
        this(port, token, allowedOrigin, 5000, 60_000);
    }

    ExtensionServer(int port, String token, String allowedOrigin, long authTimeoutMs) {
        this(port, () -> token, allowedOrigin, authTimeoutMs, 60_000);
    }

    ExtensionServer(int port, Supplier<String> token, String allowedOrigin, long authTimeoutMs, long lockoutMs) {
        super(new InetSocketAddress(loopback(), port), 1, List.<Draft>of(new Draft_6455(
                Collections.emptyList(), Collections.singletonList(new org.java_websocket.protocols.Protocol("")), MAX_MESSAGE_BYTES)));
        this.token = token;
        this.allowedOrigin = allowedOrigin;
        this.authTimeoutMs = authTimeoutMs;
        this.lockoutMs = lockoutMs;
        setDaemon(true);
        setReuseAddr(true);
        timer.scheduleWithFixedDelay(() -> {
            try {
                for (WebSocket conn : getConnections()) {
                    tellBlocked(conn);
                }
            } catch (RuntimeException e) {
                // the next look tells it
            }
        }, 1, 1, TimeUnit.SECONDS);
    }

    private static InetAddress loopback() {
        try {
            return InetAddress.getByAddress(new byte[] {127, 0, 0, 1});
        } catch (UnknownHostException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Starts listening; throws if the port cannot be bound. */
    public void startAndWait() throws Exception {
        start();
        try {
            started.get(5, TimeUnit.SECONDS);
        } catch (java.util.concurrent.ExecutionException e) {
            throw e.getCause() instanceof Exception ex ? ex : e;
        }
    }

    /** What the server does with the agents' processes that connect on {@link #LINK_PATH}. */
    void links(Links handler) {
        links = handler;
    }

    ObjectMapper json() {
        return json;
    }

    Supplier<String> token() {
        return token;
    }

    // ---------------------------------------------------------------- the agents

    /** An agent is served: the extension is told, and the agent's commands can go. */
    void add(WebSocketBridge agent) {
        synchronized (pairing) {
            agents.add(agent);
            tellAgents();
        }
    }

    /** The agent has gone: the extension is told, and what it still owed the agent is dropped. */
    void remove(WebSocketBridge agent) {
        synchronized (pairing) {
            agents.remove(agent);
            outstanding.values().removeIf(owner -> owner == agent);
            tellAgents();
        }
    }

    /** The agent's name changed: the extension is told the agents anew. */
    void renamed() {
        synchronized (pairing) {
            tellAgents();
        }
    }

    List<WebSocketBridge> agents() {
        return List.copyOf(agents);
    }

    private WebSocketBridge agent(String id) {
        for (WebSocketBridge agent : agents) {
            if (agent.clientId().equals(id)) {
                return agent;
            }
        }
        return null;
    }

    private ArrayNode agentsNode() {
        ArrayNode list = json.createArrayNode();
        for (WebSocketBridge agent : agents) {
            list.addObject().put("id", agent.clientId()).put("name", agent.clientName());
        }
        return list;
    }

    /** Under the pairing lock: the paired extension is told who the agents are now. */
    private void tellAgents() {
        WebSocket conn = paired;
        if (conn == null || !conn.isOpen()) {
            return;
        }
        ObjectNode msg = json.createObjectNode();
        msg.put("type", "agents");
        msg.set("agents", agentsNode());
        try {
            conn.send(json.writeValueAsString(msg));
        } catch (WebsocketNotConnectedException e) {
            // closed between the look and the send
        }
    }

    // ---------------------------------------------------------------- the connection, as the agents see it

    /** Whether the extension is paired, on the token as it is now. */
    boolean isConnected() {
        WebSocket conn = paired;
        return conn != null && conn.isOpen();
    }

    long connectedSince() {
        return isConnected() ? connectedSince : 0;
    }

    /** The close code of the last paired connection, or {@link Protocol#CLOSE_UNAUTHORIZED} while a browser with another token is why none is paired. */
    int lastCloseCode() {
        if (!isConnected() && turnedAway) {
            return Protocol.CLOSE_UNAUTHORIZED;
        }
        return lastCloseCode;
    }

    boolean isHeld() {
        return held;
    }

    /**
     * Switches the connection to the browser off or on, for the panel. Off closes the connection
     * that is there and takes no new one, so the extension's next look does not bring it back. It
     * can only take away: it gives an agent nothing the user did not give it in the popup, and on
     * again the extension pairs as it always does.
     */
    void setHeld(boolean off) {
        held = off;
        Log.info("connection to the browser switched " + (off ? "off" : "on") + " in the panel");
        if (off) {
            for (WebSocket conn : getConnections()) {
                Peer peer = conn.getAttachment();
                if (peer != null && !peer.link && conn.isOpen()) {
                    conn.close(CloseFrame.GOING_AWAY, "Switched off in the server's panel");
                }
            }
        }
    }

    /**
     * Whether an extension is paired on the token as it is now. A pairing that was made on an
     * older one is still open until its next heartbeat or command, and is about to end: it is none.
     */
    boolean pairedOnCurrentToken() {
        WebSocket conn = paired;
        Peer peer = conn == null ? null : conn.getAttachment();
        return peer != null && peer.authenticated && token.get().equals(peer.tokenAtPairing) && conn.isOpen();
    }

    /** A rotated token ends the pairing before the next command, not only at the next heartbeat. */
    void dropStalePairing() {
        WebSocket conn = paired;
        Peer peer = conn == null ? null : conn.getAttachment();
        if (peer != null && peer.authenticated && !token.get().equals(peer.tokenAtPairing) && conn.isOpen()) {
            Log.info("pairing ended reason=token_rotated");
            conn.closeConnection(CLOSE_UNAUTHORIZED, "Pairing token changed");
        }
    }

    /**
     * Sends one command of an agent on the paired connection and remembers whose it is. Never
     * retries. Throws when nothing is paired: the agent's view says why.
     *
     * @param before given the command's id before anything is sent: the agent waits for that id
     * @return the command's id, unique on this connection
     */
    String send(WebSocketBridge agent, String action, String session, JsonNode params, long deadline,
            java.util.function.Consumer<String> before) {
        dropStalePairing();
        WebSocket conn = paired;
        if (conn == null || !conn.isOpen()) {
            throw new WebsocketNotConnectedException();
        }
        String id = Long.toString(ids.incrementAndGet());
        outstanding.put(id, agent);
        before.accept(id);
        try {
            conn.send(new Protocol.Command(id, agent.clientId(), action, session, params, deadline).toJson(json));
        } catch (RuntimeException e) {
            outstanding.remove(id);
            throw e;
        }
        return id;
    }

    /** The command's answer came, or is no longer waited for. */
    void done(String id) {
        outstanding.remove(id);
    }

    /** Tells the extension to drop or stop a command, so it cannot run after its agent stopped waiting. */
    void cancel(String id) {
        WebSocket conn = paired;
        try {
            if (conn != null && conn.isOpen()) {
                conn.send("{\"type\":\"cancel\",\"id\":\"" + id + "\"}");
            }
        } catch (RuntimeException e) {
            // connection already gone: nothing left to cancel
        }
    }

    // ---------------------------------------------------------------- blocked sites and the policy

    /**
     * Gives the server the list of blocked sites. The extension is told the list once it is paired,
     * and again whenever it changes: it refuses as the server does, with what it knows of a tab at
     * the moment of a command, and its popup says that a site is blocked where the user would
     * authorize it.
     */
    void blockedSites(Supplier<BlockedSites.Rule> source) {
        blocked = source;
    }

    /**
     * The sites no agent may work on, as they are now. Where the list has changed since it was
     * last looked at, the extension is told at once: ahead of the command this look is for, so
     * that the two do not disagree about it for a moment.
     */
    BlockedSites.Rule blocked() {
        BlockedSites.Rule rule = blocked.get();
        if (!rule.equals(lastLooked)) {
            lastLooked = rule;
            for (WebSocket conn : getConnections()) {
                tellBlocked(conn);
            }
        }
        return rule;
    }

    /**
     * Tells a paired extension the list of blocked sites, unless it was told it as it is now.
     *
     * <p>Not right behind the pairing answer, but when the extension has said something as a
     * paired one, which it does at once: an extension from before this message would take it,
     * arriving while it still checks the server's proof, for a pairing that failed.
     */
    private void tellBlocked(WebSocket conn) {
        Peer peer = conn.getAttachment();
        if (peer == null || peer.link || !peer.authenticated || !peer.spoke) {
            return;
        }
        synchronized (peer) {
            BlockedSites.Rule rule = blocked.get();
            if (rule.equals(peer.told) || !conn.isOpen()) {
                return;
            }
            ObjectNode msg = json.createObjectNode();
            msg.put("type", "policy");
            var sites = msg.putArray("blocked");
            rule.domains().forEach(sites::add);
            msg.put("unreadable", rule.everything());
            BlockedSites.Limits limits = rule.limits();
            msg.put("strict", limits.strict());
            var allowed = msg.putArray("allowed");
            limits.allowed().forEach(allowed::add);
            msg.put("screenshots", limits.screenshots());
            msg.put("maxAccess", limits.maxAccess().wire());
            msg.put("sessionMaxMinutes", limits.sessionMaxMinutes());
            msg.put("sessionIdleMinutes", limits.sessionIdleMinutes());
            try {
                conn.send(json.writeValueAsString(msg));
                peer.told = rule;
            } catch (WebsocketNotConnectedException e) {
                // closed between the look and the send
            }
        }
    }

    // ---------------------------------------------------------------- the handshake

    private boolean originAllowed(String origin) {
        if (origin == null) {
            return false;
        }
        if (ANY_EXTENSION_ORIGIN.equals(allowedOrigin)) {
            return origin.startsWith("chrome-extension://");
        }
        return origin.equals(allowedOrigin);
    }

    private synchronized boolean lockedOut() {
        long cutoff = System.currentTimeMillis() - lockoutMs;
        while (!failedPairings.isEmpty() && failedPairings.peekFirst() < cutoff) {
            failedPairings.removeFirst();
        }
        return failedPairings.size() >= MAX_FAILED_PAIRINGS;
    }

    private synchronized void recordFailedPairing() {
        failedPairings.addLast(System.currentTimeMillis());
    }

    /** The path a connection asks for, without a query. */
    private static String pathOf(ClientHandshake request) {
        String resource = request.getResourceDescriptor();
        if (resource == null) {
            return "/";
        }
        int query = resource.indexOf('?');
        return query < 0 ? resource : resource.substring(0, query);
    }

    @Override
    public ServerHandshakeBuilder onWebsocketHandshakeReceivedAsServer(WebSocket conn, Draft draft,
            ClientHandshake request) throws InvalidDataException {
        String origin = request.getFieldValue("Origin");
        if (LINK_PATH.equals(pathOf(request))) {
            // A process on this machine, never a page: a browser always says where a page is from.
            if (origin != null && !origin.isEmpty()) {
                Log.warn("link rejected reason=origin");
                throw new InvalidDataException(CloseFrame.POLICY_VALIDATION, "Not a link");
            }
            conn.setAttachment(new Peer(true));
            return super.onWebsocketHandshakeReceivedAsServer(conn, draft, request);
        }
        if (!originAllowed(origin)) {
            Log.warn("connection rejected reason=origin");
            throw new InvalidDataException(CloseFrame.POLICY_VALIDATION, "Origin not allowed");
        }
        if (lockedOut()) {
            Log.warn("connection rejected reason=pairing_lockout");
            throw new InvalidDataException(CloseFrame.POLICY_VALIDATION, "Too many failed pairing attempts");
        }
        if (held) {
            // The extension looks for the server every half minute: said once when it was switched off, not each time.
            Log.debug("connection rejected reason=switched_off_in_panel");
            throw new InvalidDataException(CloseFrame.POLICY_VALIDATION, "Switched off in the server's panel");
        }
        conn.setAttachment(new Peer(false));
        return super.onWebsocketHandshakeReceivedAsServer(conn, draft, request);
    }

    @Override
    public void onOpen(WebSocket conn, ClientHandshake handshake) {
        Peer peer = conn.getAttachment();
        if (peer == null) {
            peer = new Peer(false);
            conn.setAttachment(peer);
        }
        if (peer.link) {
            links.opened(conn);
            return;
        }
        ObjectNode challenge = json.createObjectNode();
        challenge.put("type", "challenge");
        challenge.put("nonce", peer.nonce);
        challenge.put("version", Protocol.VERSION);
        conn.send(json.writeValueAsString(challenge));
        Peer waiting = peer;
        timer.schedule(() -> {
            if (!waiting.authenticated && conn.isOpen()) {
                conn.close(CLOSE_UNAUTHORIZED, "Pairing timeout");
            }
        }, authTimeoutMs, TimeUnit.MILLISECONDS);
    }

    @Override
    public void onMessage(WebSocket conn, String message) {
        Peer peer = conn.getAttachment();
        if (message.length() > MAX_MESSAGE_BYTES) {
            conn.close(CloseFrame.TOOBIG, "Message too large");
            return;
        }
        if (peer != null && peer.link) {
            links.message(conn, message);
            return;
        }
        if (peer != null && overRate(peer)) {
            Log.warn("connection closed reason=rate_limit");
            conn.close(Protocol.CLOSE_RATE_LIMITED, "Too many messages");
            return;
        }
        JsonNode msg;
        try {
            msg = json.readTree(message);
        } catch (RuntimeException e) {
            conn.close(CloseFrame.POLICY_VALIDATION, "Invalid JSON");
            return;
        }
        if (peer == null || !msg.isObject()) {
            conn.close(CloseFrame.POLICY_VALIDATION, "Invalid message");
            return;
        }
        if (!peer.authenticated) {
            authenticate(conn, peer, msg);
            return;
        }
        if (conn != paired) {
            // A connection that was replaced and has not closed yet: nothing of it counts.
            return;
        }
        if (!peer.spoke) {
            // Its first word as a paired extension: now it can be told what is blocked.
            peer.spoke = true;
            tellBlocked(conn);
        }
        switch (msg.path("type").asString("")) {
            case "ping" -> {
                // A rotated token ends the pairing at the next heartbeat.
                if (!token.get().equals(peer.tokenAtPairing)) {
                    conn.close(CLOSE_UNAUTHORIZED, "Pairing token changed");
                    return;
                }
                conn.send("{\"type\":\"pong\"}");
            }
            case "event" -> {
                WebSocketBridge agent = agent(msg.path("agent").asString(""));
                if (agent != null) {
                    agent.connection().onEvent(msg);
                }
            }
            case "agents_refused" -> {
                List<String> refused = new ArrayList<>();
                for (JsonNode id : msg.path("agents")) {
                    if (id.isString()) {
                        refused.add(id.asString());
                    }
                }
                for (WebSocketBridge agent : agents) {
                    agent.connection().refusedByUser(refused.contains(agent.clientId()));
                }
            }
            default -> {
                if (msg.has("id")) {
                    WebSocketBridge agent = outstanding.get(msg.path("id").asString(""));
                    if (agent != null) {
                        agent.connection().onResponse(msg);
                    }
                }
            }
        }
    }

    private static boolean overRate(Peer peer) {
        long now = System.currentTimeMillis();
        if (now - peer.windowStart >= 1000) {
            peer.windowStart = now;
            peer.messagesInWindow = 0;
        }
        return ++peer.messagesInWindow > MAX_MESSAGES_PER_SECOND;
    }

    /** The first message of an unpaired connection must be a valid proof; anything else closes it. */
    private void authenticate(WebSocket conn, Peer peer, JsonNode msg) {
        String current = token.get();
        String clientNonce = msg.path("nonce").asString("");
        String proof = msg.path("proof").asString("");
        boolean ok = "auth".equals(msg.path("type").asString(""))
                && clientNonce.length() >= 16 && clientNonce.length() <= 128
                && Pairing.constantTimeEquals(proof, Pairing.clientProof(current, peer.nonce, clientNonce));
        if (!ok) {
            recordFailedPairing();
            if ("auth".equals(msg.path("type").asString("")) && !isConnected()) {
                // An extension with another token, an older one as a rule: said in the window and to the agents.
                turnedAway = true;
            }
            Log.warn("connection rejected reason=pairing_proof");
            conn.close(CLOSE_UNAUTHORIZED, "Pairing failed");
            return;
        }
        if (msg.path("version").asInt(0) != Protocol.VERSION) {
            Log.warn("connection rejected reason=protocol_version peer=" + msg.path("version").asInt(0));
            conn.close(Protocol.CLOSE_VERSION, "Protocol version " + Protocol.VERSION
                    + " required: update the extension and the server to the same release");
            return;
        }
        ObjectNode ack = json.createObjectNode();
        ack.put("type", "auth_ok");
        ack.put("proof", Pairing.serverProof(current, peer.nonce, clientNonce));
        ack.put("version", Protocol.VERSION);
        // Becoming the paired connection and answering are one step for the other threads that send
        // on it: a tool call its command, an agent its name. Before that step neither sends here,
        // because the extension takes anything that reaches it ahead of `auth_ok` for a failed
        // pairing. After it both do: an extension that holds `auth_ok` is connected for every tool
        // call, and the agents that were not in the answer follow it.
        WebSocket replaced;
        synchronized (pairing) {
            ack.set("agents", agentsNode());
            peer.tokenAtPairing = current;
            peer.authenticated = true;
            replaced = paired;
            paired = conn;
            connectedSince = System.currentTimeMillis();
            lastCloseCode = 0;
            turnedAway = false;
            conn.send(json.writeValueAsString(ack));
            for (WebSocketBridge agent : agents) {
                agent.connection().connected();
            }
        }
        if (replaced != null && replaced != conn && replaced.isOpen()) {
            replaced.close(CLOSE_REPLACED, "Replaced by a newer connection");
        }
        Log.info("extension connected protocol=" + Protocol.VERSION + " agents=" + agents.size());
    }

    @Override
    public void onMessage(WebSocket conn, ByteBuffer message) {
        conn.close(CloseFrame.REFUSE, "Binary messages are not supported");
    }

    @Override
    public void onClose(WebSocket conn, int code, String reason, boolean remote) {
        Peer peer = conn.getAttachment();
        if (peer != null && peer.link) {
            links.closed(conn, code);
            return;
        }
        synchronized (pairing) {
            if (conn != paired) {
                return;
            }
            paired = null;
            lastCloseCode = code;
            Log.info("extension disconnected code=" + code);
            for (WebSocketBridge agent : agents) {
                agent.connection().disconnected(code);
            }
            outstanding.clear();
        }
    }

    @Override
    public void onError(WebSocket conn, Exception ex) {
        if (conn == null && !started.isDone()) {
            started.completeExceptionally(ex);
            return;
        }
        Log.warn("websocket error type=" + ex.getClass().getSimpleName());
    }

    @Override
    public void onStart() {
        started.complete(null);
    }
}
