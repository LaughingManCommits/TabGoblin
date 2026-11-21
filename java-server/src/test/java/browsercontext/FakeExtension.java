package browsercontext;

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.drafts.Draft_6455;
import org.java_websocket.handshake.ServerHandshake;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Test double for the Chrome extension end of the WebSocket. */
final class FakeExtension extends WebSocketClient {

    static final String ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
    static final ObjectMapper JSON = new ObjectMapper();

    final List<JsonNode> commands = new CopyOnWriteArrayList<>();
    /** Ids of commands the server cancelled. */
    final List<String> cancels = new CopyOnWriteArrayList<>();
    final List<String> clientNames = new CopyOnWriteArrayList<>();
    /** The agent's name as the extension knows it: from the pairing answer, then from each {@code client} message. */
    volatile String agentName;
    /** What arrived ahead of the pairing answer. The real extension takes any such message for a failed pairing. */
    final List<String> early = new CopyOnWriteArrayList<>();
    final CompletableFuture<Boolean> paired = new CompletableFuture<>();
    final CompletableFuture<Integer> closed = new CompletableFuture<>();
    /** Produces the full response for a command, or null to stay silent. */
    volatile Function<JsonNode, JsonNode> responder = cmd -> ok(cmd, JSON.createObjectNode());
    /** Protocol version announced in the handshake; 0 announces none, like a pre-versioning extension. */
    volatile int version = Protocol.VERSION;
    volatile String clientId;
    volatile JsonNode challenge;
    private final String token;
    private final String clientNonce = Pairing.randomHex(16);
    private volatile String serverNonce;

    /** @param token token to pair with, or null to never answer the challenge */
    FakeExtension(int port, String origin, String token) {
        super(URI.create("ws://127.0.0.1:" + port), new Draft_6455(),
                origin == null ? Map.of() : Map.of("Origin", origin), 2000);
        this.token = token;
    }

    static FakeExtension paired(int port, String token) throws Exception {
        FakeExtension ext = new FakeExtension(port, ORIGIN, token);
        if (!ext.connectBlocking(3, TimeUnit.SECONDS) || !ext.paired.get(3, TimeUnit.SECONDS)) {
            throw new IllegalStateException("fake extension failed to pair");
        }
        return ext;
    }

    static JsonNode ok(JsonNode cmd, JsonNode result) {
        ObjectNode resp = JSON.createObjectNode();
        resp.put("id", cmd.path("id").asString());
        resp.put("success", true);
        resp.set("result", result);
        return resp;
    }

    static JsonNode fail(JsonNode cmd, String code, String message) {
        ObjectNode resp = JSON.createObjectNode();
        resp.put("id", cmd.path("id").asString());
        resp.put("success", false);
        resp.putObject("error").put("code", code).put("message", message);
        return resp;
    }

    void reply(JsonNode response) {
        send(JSON.writeValueAsString(response));
    }

    @Override
    public void onMessage(String message) {
        JsonNode msg = JSON.readTree(message);
        String type = msg.path("type").asString("");
        if (!type.equals("challenge") && !type.equals("auth_ok") && !paired.isDone()) {
            early.add(type.isEmpty() ? "command" : type);
        }
        if (type.equals("challenge")) {
            challenge = msg;
            if (token != null) {
                serverNonce = msg.path("nonce").asString();
                ObjectNode auth = JSON.createObjectNode();
                auth.put("type", "auth");
                auth.put("nonce", clientNonce);
                auth.put("proof", Pairing.clientProof(token, serverNonce, clientNonce));
                if (version > 0) {
                    auth.put("version", version);
                }
                send(JSON.writeValueAsString(auth));
            }
        } else if (type.equals("auth_ok")) {
            clientId = msg.path("clientId").asString(null);
            agentName = msg.path("clientName").asString("");
            paired.complete(msg.path("proof").asString("")
                    .equals(Pairing.serverProof(token, serverNonce, clientNonce)));
        } else if (type.equals("cancel")) {
            cancels.add(msg.path("id").asString());
        } else if (type.equals("client")) {
            clientNames.add(msg.path("name").asString());
            agentName = msg.path("name").asString();
        } else if (msg.has("id") && msg.has("action")) {
            commands.add(msg);
            JsonNode resp = responder.apply(msg);
            if (resp != null) {
                send(JSON.writeValueAsString(resp));
            }
        }
    }

    @Override
    public void onOpen(ServerHandshake handshake) {
    }

    @Override
    public void onClose(int code, String reason, boolean remote) {
        closed.complete(code);
        paired.complete(false);
    }

    @Override
    public void onError(Exception ex) {
    }
}
