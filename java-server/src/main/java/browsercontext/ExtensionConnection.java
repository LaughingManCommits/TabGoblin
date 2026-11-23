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
    private final Timings timings;
    private final Map<String, CompletableFuture<Protocol.Response>> pending = new ConcurrentHashMap<>();
    private final Map<String, ReentrantLock> sessionLocks = new ConcurrentHashMap<>();
    private final AtomicLong ids = new AtomicLong();
    private volatile WebSocket conn;
    private volatile List<Protocol.Session> sessions = List.of();
    private volatile int lastCloseCode;
    /** When the paired connection was made, or 0 while there is none. */
    private volatile long connectedSince;
    /** The user switched this server's connection to the browser off, in its panel. */
    private volatile boolean held;

    /** What a tool call is told while the user has the connection switched off in the panel. */
    static final String NOT_CONNECTED_HELD = "The user switched this server's connection to the browser off, in the "
            + "TabGoblin server window. Ask them to switch it on again there.";

    /** The log of the agent this connection is for. */
    private final Log.Scope log;

    ExtensionConnection(ObjectMapper json, Timings timings) {
        this(json, timings, Log.of(null));
    }

    ExtensionConnection(ObjectMapper json, Timings timings, Log.Scope log) {
        this.json = json;
        this.timings = timings;
        this.log = log;
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

    /** When the extension connected, in milliseconds since the epoch, or 0 while it is not connected. */
    long connectedSince() {
        return isConnected() ? connectedSince : 0;
    }

    boolean held() {
        return held;
    }

    void held(boolean on) {
        held = on;
    }

    /**
     * Makes {@code newConn} the paired connection and sends it {@code answer}, the message that
     * completes its pairing. Returns the connection it replaced, if any.
     *
     * <p>For a command the two are one step ({@link #paired()}). The connection is taken first, so
     * that an extension which holds the answer is connected for every tool call. And no command
     * goes out on it before the answer does: the extension takes whatever reaches it ahead of the
     * answer for a failed pairing.
     */
    synchronized WebSocket attach(WebSocket newConn, String answer) {
        WebSocket old = conn;
        conn = newConn;
        sessions = List.of();
        lastCloseCode = 0;
        connectedSince = System.currentTimeMillis();
        newConn.send(answer);
        return old == newConn ? null : old;
    }

    /**
     * A browser came with a token that is not this server's. While none is paired, that is the
     * reason why: the user has to paste this server's token.
     */
    synchronized void turnedAway() {
        if (conn == null || !conn.isOpen()) {
            lastCloseCode = Protocol.CLOSE_UNAUTHORIZED;
        }
    }

    /** The paired connection to send a command on: never one whose pairing answer is not out yet. */
    private synchronized WebSocket paired() {
        return conn;
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
        long asked = System.nanoTime();
        if (lock != null) {
            lock.lock();
        }
        String id = Long.toString(ids.incrementAndGet());
        long started = System.nanoTime();
        // Behind another call on the same session: that is waiting, not the round trip.
        timings.waited(started - asked);
        String errorCode = null;
        // What the extension says happened inside the round trip, if it answered and says so.
        Protocol.Timing[] inside = new Protocol.Timing[1];
        // The session the command ran in: the one it named, or the one the extension says it found for
        // a command that named none. The panel shows the times and the calls of one tab by it.
        String[] ranIn = {session};
        try {
            return exchange(id, action, session, params, timeout, inside, ranIn);
        } catch (BrowserException e) {
            errorCode = e.code();
            throw e;
        } finally {
            long trip = System.nanoTime() - started;
            log.command(id, ranIn[0], action, trip / 1_000_000, errorCode);
            timings.trip(trip, inside[0], ranIn[0]);
            if (lock != null) {
                lock.unlock();
            }
        }
    }

    private JsonNode exchange(String id, String action, String session, JsonNode params, Duration timeout,
            Protocol.Timing[] inside, String[] ranIn) {
        WebSocket c = paired();
        if (c == null || !c.isOpen()) {
            if (held) {
                // The nearest cause comes first: nothing else can connect while this is so.
                throw new BrowserException("NOT_CONNECTED", NOT_CONNECTED_HELD);
            }
            throw new BrowserException("NOT_CONNECTED", switch (lastCloseCode) {
                case Protocol.CLOSE_USER_DISCONNECTED ->
                    "The user disconnected this agent in the TabGoblin popup. Ask them to allow it again.";
                // What the user has to do about these two is said by the one who knows where the token is.
                case Protocol.CLOSE_UNAUTHORIZED ->
                    "The Chrome extension is not paired with this server: the token it holds is not this server's.";
                default -> "The Chrome extension is not connected.";
            });
        }
        Protocol.Command command = new Protocol.Command(id, action, session, params,
                System.currentTimeMillis() + timeout.toMillis());
        CompletableFuture<Protocol.Response> future = new CompletableFuture<>();
        pending.put(id, future);
        try {
            c.send(command.toJson(json));
            Protocol.Response response = future.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
            inside[0] = response.timing();
            if (response.session() != null) {
                ranIn[0] = response.session();
            }
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
