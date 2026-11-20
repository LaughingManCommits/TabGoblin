package browsercontext;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.UnknownHostException;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.java_websocket.WebSocket;
import org.java_websocket.drafts.Draft;
import org.java_websocket.drafts.Draft_6455;
import org.java_websocket.exceptions.InvalidDataException;
import org.java_websocket.framing.CloseFrame;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.handshake.ServerHandshakeBuilder;
import org.java_websocket.protocols.Protocol;
import org.java_websocket.server.WebSocketServer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Localhost WebSocket endpoint the Chrome extension connects to. Knows nothing about MCP.
 *
 * <p>Security: binds to 127.0.0.1 only, rejects handshakes whose Origin is not the expected
 * extension, and requires an HMAC challenge-response over the pairing token before any command is
 * exchanged. Messages are size-limited and every command has a timeout.
 */
public class WebSocketBridge extends WebSocketServer {

    /** Largest accepted inbound message (screenshots are the big ones). */
    static final int MAX_MESSAGE_BYTES = 8 * 1024 * 1024;
    static final int CLOSE_UNAUTHORIZED = 4401;
    static final int CLOSE_REPLACED = 4409;
    /** Matches any chrome-extension:// origin instead of one pinned extension id. */
    public static final String ANY_EXTENSION_ORIGIN = "any";

    private final String token;
    private final String allowedOrigin;
    private final long authTimeoutMs;
    private final ObjectMapper json = new ObjectMapper();
    private final BrowserSession session = new BrowserSession(json);
    private final CompletableFuture<Void> started = new CompletableFuture<>();
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "bcmcp-auth-timer");
        t.setDaemon(true);
        return t;
    });

    /** Per-connection handshake state. */
    private static final class Peer {
        final String nonce = Pairing.randomHex(16);
        volatile boolean authenticated;
    }

    public WebSocketBridge(int port, String token, String allowedOrigin) {
        this(port, token, allowedOrigin, 5000);
    }

    WebSocketBridge(int port, String token, String allowedOrigin, long authTimeoutMs) {
        super(new InetSocketAddress(loopback(), port), 1, List.<Draft>of(new Draft_6455(
                Collections.emptyList(), Collections.singletonList(new Protocol("")), MAX_MESSAGE_BYTES)));
        this.token = token;
        this.allowedOrigin = allowedOrigin;
        this.authTimeoutMs = authTimeoutMs;
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
        return session.isConnected();
    }

    /** Last state the extension pushed (authorization, pause), or null. */
    public JsonNode lastState() {
        return session.lastState();
    }

    public ObjectMapper json() {
        return json;
    }

    /** Sends one command to the extension. Never retries. */
    public JsonNode send(String action, JsonNode params, Duration timeout) {
        return session.request(action, params, timeout);
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

    @Override
    public ServerHandshakeBuilder onWebsocketHandshakeReceivedAsServer(WebSocket conn, Draft draft,
            ClientHandshake request) throws InvalidDataException {
        if (!originAllowed(request.getFieldValue("Origin"))) {
            log("Rejected WebSocket handshake from a disallowed origin.");
            throw new InvalidDataException(CloseFrame.POLICY_VALIDATION, "Origin not allowed");
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
            case "ping" -> conn.send("{\"type\":\"pong\"}");
            case "event" -> session.onEvent(msg);
            default -> {
                if (msg.has("id")) {
                    session.onResponse(msg);
                }
            }
        }
    }

    /** The first message of an unpaired connection must be a valid proof; anything else closes it. */
    private void authenticate(WebSocket conn, Peer peer, JsonNode msg) {
        String clientNonce = msg.path("nonce").asString("");
        String proof = msg.path("proof").asString("");
        boolean ok = "auth".equals(msg.path("type").asString(""))
                && clientNonce.length() >= 16 && clientNonce.length() <= 128
                && Pairing.constantTimeEquals(proof, Pairing.clientProof(token, peer.nonce, clientNonce));
        if (!ok) {
            log("Rejected an extension connection: pairing proof invalid.");
            conn.close(CLOSE_UNAUTHORIZED, "Pairing failed");
            return;
        }
        peer.authenticated = true;
        WebSocket replaced = session.attach(conn);
        if (replaced != null && replaced.isOpen()) {
            replaced.close(CLOSE_REPLACED, "Replaced by a newer connection");
        }
        ObjectNode ack = json.createObjectNode();
        ack.put("type", "auth_ok");
        ack.put("proof", Pairing.serverProof(token, peer.nonce, clientNonce));
        conn.send(json.writeValueAsString(ack));
        log("Chrome extension paired and connected.");
    }

    @Override
    public void onMessage(WebSocket conn, ByteBuffer message) {
        conn.close(CloseFrame.REFUSE, "Binary messages are not supported");
    }

    @Override
    public void onClose(WebSocket conn, int code, String reason, boolean remote) {
        session.detach(conn);
    }

    @Override
    public void onError(WebSocket conn, Exception ex) {
        if (conn == null && !started.isDone()) {
            started.completeExceptionally(ex);
            return;
        }
        log("WebSocket error: " + ex.getClass().getSimpleName());
    }

    @Override
    public void onStart() {
        started.complete(null);
    }

    private static void log(String message) {
        System.err.println("[browser-context-mcp] " + message);
    }
}
