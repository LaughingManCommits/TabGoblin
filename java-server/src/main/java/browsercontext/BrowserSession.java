package browsercontext;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.locks.ReentrantLock;
import org.java_websocket.WebSocket;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * The single paired extension connection: request/response correlation, timeouts, and the last
 * state the extension reported. Commands are sent one at a time and are never retried.
 */
final class BrowserSession {

    private final ObjectMapper json;
    private final Map<String, CompletableFuture<JsonNode>> pending = new ConcurrentHashMap<>();
    private final AtomicLong ids = new AtomicLong();
    private final ReentrantLock commandLock = new ReentrantLock(true);
    private volatile WebSocket conn;
    private volatile JsonNode lastState;

    BrowserSession(ObjectMapper json) {
        this.json = json;
    }

    boolean isConnected() {
        WebSocket c = conn;
        return c != null && c.isOpen();
    }

    JsonNode lastState() {
        return lastState;
    }

    /** Makes {@code newConn} the active connection and returns the one it replaced, if any. */
    synchronized WebSocket attach(WebSocket newConn) {
        WebSocket old = conn;
        conn = newConn;
        lastState = null;
        return old == newConn ? null : old;
    }

    synchronized void detach(WebSocket closed) {
        if (conn != closed) {
            return;
        }
        conn = null;
        lastState = null;
        BrowserException lost = new BrowserException("CONNECTION_LOST",
                "The browser extension disconnected before answering. The outcome is unknown and the "
                        + "command was not retried; inspect the page before repeating it.");
        pending.values().forEach(f -> f.completeExceptionally(lost));
    }

    void onEvent(JsonNode msg) {
        if ("state".equals(msg.path("event").asString(""))) {
            lastState = msg.path("data");
        }
    }

    void onResponse(JsonNode msg) {
        CompletableFuture<JsonNode> f = pending.get(msg.path("id").asString(""));
        if (f != null) {
            f.complete(msg);
        }
    }

    /** Sends one command and waits for its response. Throws {@link BrowserException} on any failure. */
    JsonNode request(String action, JsonNode params, Duration timeout) {
        commandLock.lock();
        try {
            WebSocket c = conn;
            if (c == null || !c.isOpen()) {
                throw new BrowserException("NOT_CONNECTED",
                        "The Chrome extension is not connected. Ask the user to open the Browser Context MCP "
                                + "popup, check that it is paired, and try again.");
            }
            String id = Long.toString(ids.incrementAndGet());
            ObjectNode req = json.createObjectNode();
            req.put("id", id);
            req.put("action", action);
            req.set("params", params == null ? json.createObjectNode() : params);

            CompletableFuture<JsonNode> future = new CompletableFuture<>();
            pending.put(id, future);
            try {
                c.send(json.writeValueAsString(req));
                JsonNode resp = future.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
                if (resp.path("success").asBoolean(false)) {
                    return resp.path("result");
                }
                JsonNode err = resp.path("error");
                throw new BrowserException(err.path("code").asString("ERROR"),
                        err.path("message").asString("The extension reported an error."));
            } catch (TimeoutException e) {
                throw new BrowserException("TIMEOUT", "No response from the browser within "
                        + timeout.toSeconds() + "s. The outcome is unknown and the command was not retried; "
                        + "inspect the page before repeating it.");
            } catch (ExecutionException e) {
                if (e.getCause() instanceof BrowserException be) {
                    throw be;
                }
                throw new BrowserException("ERROR", "Command failed: " + e.getCause().getMessage());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new BrowserException("INTERRUPTED", "Command interrupted.");
            } catch (BrowserException e) {
                throw e;
            } catch (RuntimeException e) {
                // e.g. WebsocketNotConnectedException from send()
                throw new BrowserException("NOT_CONNECTED", "The Chrome extension connection was lost.");
            } finally {
                pending.remove(id);
            }
        } finally {
            commandLock.unlock();
        }
    }
}
