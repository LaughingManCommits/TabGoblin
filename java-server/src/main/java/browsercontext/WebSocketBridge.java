package browsercontext;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.UnknownHostException;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Collections;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import org.java_websocket.WebSocket;
import org.java_websocket.drafts.Draft;
import org.java_websocket.drafts.Draft_6455;
import org.java_websocket.exceptions.InvalidDataException;
import org.java_websocket.framing.CloseFrame;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.handshake.ServerHandshakeBuilder;
import org.java_websocket.server.WebSocketServer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Localhost WebSocket endpoint the Chrome extension connects to. Knows nothing about MCP.
 *
 * <p>Each server process is one MCP client ("agent") with its own id; the extension connects to
 * every running server and keeps their sessions apart.
 *
 * <p>Security: binds to 127.0.0.1 only, rejects handshakes whose Origin is not the expected
 * extension, requires an HMAC challenge-response over the pairing token before any command is
 * exchanged, locks out after repeated failed pairings, re-checks the token when it is rotated,
 * and limits message size and rate. Every command has a deadline.
 */
public class WebSocketBridge extends WebSocketServer {

    /** Largest accepted inbound message (screenshots are the big ones). */
    static final int MAX_MESSAGE_BYTES = 8 * 1024 * 1024;
    static final int CLOSE_UNAUTHORIZED = Protocol.CLOSE_UNAUTHORIZED;
    static final int CLOSE_REPLACED = Protocol.CLOSE_REPLACED;
    /** Failed pairings within the window before new connections are refused for a while. */
    static final int MAX_FAILED_PAIRINGS = 10;
    static final int MAX_MESSAGES_PER_SECOND = 300;
    /** Matches any chrome-extension:// origin instead of one pinned extension id. */
    public static final String ANY_EXTENSION_ORIGIN = "any";

    private final Supplier<String> token;
    private final String allowedOrigin;
    private final long authTimeoutMs;
    private final long lockoutMs;
    private final String clientId = "c-" + Pairing.randomHex(4);
    private volatile String clientName = "";
    private final ObjectMapper json = new ObjectMapper();
    private final ExtensionConnection connection = new ExtensionConnection(json);
    private final CompletableFuture<Void> started = new CompletableFuture<>();
    private final Deque<Long> failedPairings = new ArrayDeque<>();
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "bcmcp-auth-timer");
        t.setDaemon(true);
        return t;
    });

    /** Per-connection handshake and rate state. */
    private static final class Peer {
        final String nonce = Pairing.randomHex(16);
        volatile boolean authenticated;
        volatile String tokenAtPairing;
        long windowStart;
        int messagesInWindow;
    }

    public WebSocketBridge(int port, Supplier<String> token, String allowedOrigin) {
        this(port, token, allowedOrigin, 5000, 60_000);
    }

    WebSocketBridge(int port, String token, String allowedOrigin, long authTimeoutMs) {
        this(port, () -> token, allowedOrigin, authTimeoutMs, 60_000);
    }

    WebSocketBridge(int port, Supplier<String> token, String allowedOrigin, long authTimeoutMs, long lockoutMs) {
        super(new InetSocketAddress(loopback(), port), 1, List.<Draft>of(new Draft_6455(
                Collections.emptyList(), Collections.singletonList(new org.java_websocket.protocols.Protocol("")), MAX_MESSAGE_BYTES)));
        this.token = token;
        this.allowedOrigin = allowedOrigin;
        this.authTimeoutMs = authTimeoutMs;
        this.lockoutMs = lockoutMs;
        setDaemon(true);
        setReuseAddr(true);
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

    public boolean isExtensionConnected() {
        return connection.isConnected();
    }

    /** Identity of this server as an MCP client, stable for the life of the process. */
    public String clientId() {
        return clientId;
    }

    /** Sessions the extension currently reports for this agent. */
    List<Protocol.Session> sessions() {
        return connection.sessions();
    }

    public ObjectMapper json() {
        return json;
    }

    /** Human-readable agent name (from the MCP client), shown in the extension popup. */
    public void setClientName(String name) {
        String clean = name == null ? "" : name.replaceAll("[\\p{Cntrl}]", " ").trim();
        if (clean.length() > 60) {
            clean = clean.substring(0, 60);
        }
        if (clean.equals(clientName)) {
            return;
        }
        clientName = clean;
        for (WebSocket conn : getConnections()) {
            Peer peer = conn.getAttachment();
            if (peer != null && peer.authenticated && conn.isOpen()) {
                ObjectNode msg = json.createObjectNode();
                msg.put("type", "client");
                msg.put("name", clean);
                conn.send(json.writeValueAsString(msg));
            }
        }
    }

    /** Sends one command to the extension. Never retries. */
    public JsonNode send(String action, String session, JsonNode params, Duration timeout) {
        dropStalePairings();
        return connection.request(action, session, params, timeout);
    }

    /** A rotated token ends existing pairings before the next command, not only at the next heartbeat. */
    private void dropStalePairings() {
        String current = token.get();
        for (WebSocket conn : getConnections()) {
            Peer peer = conn.getAttachment();
            if (peer != null && peer.authenticated && !peer.tokenAtPairing.equals(current) && conn.isOpen()) {
                Log.info("pairing ended reason=token_rotated");
                conn.closeConnection(CLOSE_UNAUTHORIZED, "Pairing token changed");
            }
        }
    }

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

    @Override
    public ServerHandshakeBuilder onWebsocketHandshakeReceivedAsServer(WebSocket conn, Draft draft,
            ClientHandshake request) throws InvalidDataException {
        if (!originAllowed(request.getFieldValue("Origin"))) {
            Log.warn("connection rejected reason=origin");
            throw new InvalidDataException(CloseFrame.POLICY_VALIDATION, "Origin not allowed");
        }
        if (lockedOut()) {
            Log.warn("connection rejected reason=pairing_lockout");
            throw new InvalidDataException(CloseFrame.POLICY_VALIDATION, "Too many failed pairing attempts");
        }
        return super.onWebsocketHandshakeReceivedAsServer(conn, draft, request);
    }

    @Override
    public void onOpen(WebSocket conn, ClientHandshake handshake) {
        Peer peer = new Peer();
        conn.setAttachment(peer);
        ObjectNode challenge = json.createObjectNode();
        challenge.put("type", "challenge");
        challenge.put("nonce", peer.nonce);
        challenge.putArray("versions").add(Protocol.VERSION);
        conn.send(json.writeValueAsString(challenge));
        timer.schedule(() -> {
            if (!peer.authenticated && conn.isOpen()) {
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
        switch (msg.path("type").asString("")) {
            case "ping" -> {
                // A rotated token ends existing pairings at the next heartbeat.
                if (!peer.tokenAtPairing.equals(token.get())) {
                    conn.close(CLOSE_UNAUTHORIZED, "Pairing token changed");
                    return;
                }
                conn.send("{\"type\":\"pong\"}");
            }
            case "event" -> connection.onEvent(msg);
            default -> {
                if (msg.has("id")) {
                    connection.onResponse(msg);
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
            Log.warn("connection rejected reason=pairing_proof");
            conn.close(CLOSE_UNAUTHORIZED, "Pairing failed");
            return;
        }
        if (msg.path("version").asInt(1) != Protocol.VERSION) {
            Log.warn("connection rejected reason=protocol_version peer=" + msg.path("version").asInt(1));
            conn.close(Protocol.CLOSE_VERSION, "Protocol version " + Protocol.VERSION
                    + " required: update the extension and the server to the same release");
            return;
        }
        ObjectNode ack = json.createObjectNode();
        ack.put("type", "auth_ok");
        ack.put("proof", Pairing.serverProof(current, peer.nonce, clientNonce));
        ack.put("version", Protocol.VERSION);
        ack.put("clientId", clientId);
        ack.put("clientName", clientName);
        // The answer goes out first. Once this is the paired connection, other threads send on it: a
        // waiting tool call its command, the MCP handshake the agent's name. Anything that reached the
        // extension ahead of `auth_ok` would be taken there for a failed pairing.
        conn.send(json.writeValueAsString(ack));
        peer.authenticated = true;
        peer.tokenAtPairing = current;
        WebSocket replaced = connection.attach(conn);
        if (replaced != null && replaced.isOpen()) {
            replaced.close(CLOSE_REPLACED, "Replaced by a newer connection");
        }
        Log.info("extension connected client=" + clientId + " protocol=" + Protocol.VERSION);
    }

    @Override
    public void onMessage(WebSocket conn, ByteBuffer message) {
        conn.close(CloseFrame.REFUSE, "Binary messages are not supported");
    }

    @Override
    public void onClose(WebSocket conn, int code, String reason, boolean remote) {
        Peer peer = conn.getAttachment();
        if (peer != null && peer.authenticated) {
            Log.info("extension disconnected client=" + clientId + " code=" + code);
        }
        connection.detach(conn, code);
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
