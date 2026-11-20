package browsercontext;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
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

/**
 * The paired extension connection of this server: request/response correlation, deadlines,
 * cancellation, and the browser sessions the extension reports for this agent.
 *
 * <p>Commands for the same session run one at a time; different sessions run in parallel.
 * Nothing is ever retried, and a command that times out or is interrupted is cancelled in the
 * extension so it cannot run later.
 */
final class ExtensionConnection {

    private final ObjectMapper json;
    private final Map<String, CompletableFuture<Protocol.Response>> pending = new ConcurrentHashMap<>();
    private final Map<String, ReentrantLock> sessionLocks = new ConcurrentHashMap<>();
    private final AtomicLong ids = new AtomicLong();
    private volatile WebSocket conn;
    private volatile List<Protocol.Session> sessions = List.of();
    private volatile int lastCloseCode;

    ExtensionConnection(ObjectMapper json) {
        this.json = json;
    }

    boolean isConnected() {
        WebSocket c = conn;
        return c != null && c.isOpen();
    }

    /** Sessions of this agent as last reported by the extension. */
    List<Protocol.Session> sessions() {
        return sessions;
    }

    int lastCloseCode() {
        return lastCloseCode;
    }

    /** Makes {@code newConn} the active connection and returns the one it replaced, if any. */
    synchronized WebSocket attach(WebSocket newConn) {
        WebSocket old = conn;
        conn = newConn;
        sessions = List.of();
        lastCloseCode = 0;
        return old == newConn ? null : old;
    }

    synchronized void detach(WebSocket closed, int closeCode) {
        if (conn != closed) {
            return;
        }
        conn = null;
        sessions = List.of();
        lastCloseCode = closeCode;
        BrowserException lost = new BrowserException("CONNECTION_LOST",
                "The browser extension disconnected before answering. The outcome is unknown and the "
                        + "command was not retried; inspect the page before repeating it.");
        pending.values().forEach(f -> f.completeExceptionally(lost));
    }

    void onEvent(JsonNode msg) {
        if (!"sessions".equals(msg.path("event").asString(""))) {
            return;
        }
        List<Protocol.Session> parsed = new ArrayList<>();
        for (JsonNode node : msg.path("data").path("sessions")) {
            parsed.add(Protocol.Session.parse(node));
        }
        sessions = List.copyOf(parsed);
    }

    void onResponse(JsonNode msg) {
        Protocol.Response response = Protocol.Response.parse(msg);
        if (response == null) {
            return;
        }
        CompletableFuture<Protocol.Response> f = pending.get(response.id());
        if (f != null) {
            f.complete(response);
        }
    }

    /** Sends one command and waits for its response. Throws {@link BrowserException} on any failure. */
    JsonNode request(String action, String session, JsonNode params, Duration timeout) {
        // Status is never queued behind a long-running operation.
        ReentrantLock lock = action.equals("status") ? null
                : sessionLocks.computeIfAbsent(session == null ? "" : session, k -> new ReentrantLock(true));
        if (lock != null) {
            lock.lock();
        }
        String id = Long.toString(ids.incrementAndGet());
        long started = System.nanoTime();
        String errorCode = null;
        try {
            return exchange(id, action, session, params, timeout);
        } catch (BrowserException e) {
            errorCode = e.code();
            throw e;
        } finally {
            Log.command(id, session, action, (System.nanoTime() - started) / 1_000_000, errorCode);
            if (lock != null) {
                lock.unlock();
            }
        }
    }

    private JsonNode exchange(String id, String action, String session, JsonNode params, Duration timeout) {
        WebSocket c = conn;
        if (c == null || !c.isOpen()) {
            throw new BrowserException("NOT_CONNECTED", lastCloseCode == Protocol.CLOSE_USER_DISCONNECTED
                    ? "The user disconnected this agent in the Browser Context MCP popup. Ask them to allow it again."
                    : "The Chrome extension is not connected. Ask the user to open the Browser Context MCP "
                            + "popup, check that it is paired, and try again.");
        }
        Protocol.Command command = new Protocol.Command(id, action, session, params,
                System.currentTimeMillis() + timeout.toMillis());
        CompletableFuture<Protocol.Response> future = new CompletableFuture<>();
        pending.put(id, future);
        try {
            c.send(command.toJson(json));
            Protocol.Response response = future.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
            if (response.success()) {
                return response.result();
            }
            throw new BrowserException(response.errorCode(), response.errorMessage());
        } catch (TimeoutException e) {
            cancel(c, id);
            throw new BrowserException("TIMEOUT", "No response from the browser within " + timeout.toSeconds()
                    + "s. The command was cancelled and not retried, but its outcome is unknown; inspect the "
                    + "page before repeating it.");
        } catch (ExecutionException e) {
            if (e.getCause() instanceof BrowserException be) {
                throw be;
            }
            throw new BrowserException("ERROR", "Command failed: " + e.getCause().getMessage());
        } catch (InterruptedException e) {
            cancel(c, id);
            Thread.currentThread().interrupt();
            throw new BrowserException("INTERRUPTED", "The command was cancelled. If it had already reached "
                    + "the page its outcome is unknown; inspect the page before repeating it.");
        } catch (BrowserException e) {
            throw e;
        } catch (RuntimeException e) {
            // e.g. WebsocketNotConnectedException from send()
            throw new BrowserException("NOT_CONNECTED", "The Chrome extension connection was lost.");
        } finally {
            pending.remove(id);
        }
    }

    /** Tells the extension to drop or stop a command, so it cannot run after we stopped waiting. */
    private void cancel(WebSocket c, String id) {
        try {
            if (c.isOpen()) {
                c.send("{\"type\":\"cancel\",\"id\":\"" + id + "\"}");
            }
        } catch (RuntimeException e) {
            // connection already gone: nothing left to cancel
        }
    }
}
