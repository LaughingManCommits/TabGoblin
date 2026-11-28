package tabgoblin;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.locks.ReentrantLock;
import org.java_websocket.exceptions.WebsocketNotConnectedException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * One agent's view of the server's connection to the extension: request/response correlation,
 * deadlines, cancellation, the browser sessions the extension reports for this agent, and why the
 * agent has no browser when it has none.
 *
 * <p>Commands for the same session run one at a time; different sessions run in parallel.
 * Nothing is ever retried, and a command that times out or is interrupted is cancelled in the
 * extension so it cannot run later.
 */
final class ExtensionConnection {

    private final ExtensionServer server;
    private final WebSocketBridge agent;
    private final ObjectMapper json;
    private final Timings timings;
    private final Map<String, CompletableFuture<Protocol.Response>> pending = new ConcurrentHashMap<>();
    /** The action of each command sent and not yet answered, by its id: what the panel's goblin shows while it runs. */
    private final Map<String, String> running = new ConcurrentHashMap<>();
    private final Map<String, ReentrantLock> sessionLocks = new ConcurrentHashMap<>();
    private volatile List<Protocol.Session> sessions = List.of();
    /** The user disconnected this agent in the popup: the extension refuses it, though it is paired with the server. */
    private volatile boolean refusedByUser;
    /** The agent has gone: nothing of its is sent or taken any more. */
    private volatile boolean closed;

    /** What a tool call is told while the user has the connection switched off in the panel. */
    static final String NOT_CONNECTED_HELD = "The user switched this server's connection to the browser off, in the "
            + "TabGoblin server window. Ask them to switch it on again there.";

    /** The log of the agent this connection is for. */
    private final Log.Scope log;

    /**
     * @param server the server's one connection, or null for an agent whose server has no port
     */
    ExtensionConnection(ExtensionServer server, WebSocketBridge agent, ObjectMapper json, Timings timings, Log.Scope log) {
        this.server = server;
        this.agent = agent;
        this.json = json;
        this.timings = timings;
        this.log = log;
    }

    /** Whether this agent has a browser: the server is paired, and the user has not disconnected this agent. */
    boolean isConnected() {
        return server != null && !closed && server.isConnected() && !refusedByUser;
    }

    /** Sessions of this agent as last reported by the extension. */
    List<Protocol.Session> sessions() {
        return sessions;
    }

    /**
     * Why this agent has no browser: {@link Protocol#CLOSE_USER_DISCONNECTED} where the user
     * disconnected it, else the close code of the server's last connection, or 0.
     */
    int lastCloseCode() {
        if (refusedByUser) {
            return Protocol.CLOSE_USER_DISCONNECTED;
        }
        return server == null ? 0 : server.lastCloseCode();
    }

    /** When the extension connected, in milliseconds since the epoch, or 0 while it is not connected. */
    long connectedSince() {
        return isConnected() ? server.connectedSince() : 0;
    }

    boolean held() {
        return server != null && server.isHeld();
    }

    /** The extension paired with the server: this agent has it, unless the user disconnected the agent. */
    void connected() {
        sessions = List.of();
    }

    /** The extension's connection ended: what this agent was waiting for has an unknown outcome. */
    void disconnected(int closeCode) {
        sessions = List.of();
        failPending("The browser extension disconnected before answering. The outcome is unknown and the "
                + "command was not retried; inspect the page before repeating it.");
    }

    /** The agent has gone: nothing is waited for any more, and nothing more is sent. */
    void closed() {
        closed = true;
        failPending("The agent has gone.");
    }

    /**
     * The extension said which agents the user disconnected: whether this one is among them. One
     * that is has no browser, and is told so by every tool; one that is not any more has it again.
     */
    void refusedByUser(boolean refused) {
        if (refused == refusedByUser) {
            return;
        }
        refusedByUser = refused;
        if (refused) {
            sessions = List.of();
            log.info("agent disconnected by the user in the popup");
            failPending("The user disconnected this agent in the TabGoblin popup. The outcome is unknown and the "
                    + "command was not retried.");
        } else {
            log.info("agent allowed again by the user in the popup");
        }
    }

    private void failPending(String why) {
        BrowserException lost = new BrowserException("CONNECTION_LOST", why);
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
        long started = System.nanoTime();
        // Behind another call on the same session: that is waiting, not the round trip.
        timings.waited(started - asked);
        String errorCode = null;
        // What the extension says happened inside the round trip, if it answered and says so.
        Protocol.Timing[] inside = new Protocol.Timing[1];
        // The session the command ran in: the one it named, or the one the extension says it found for
        // a command that named none. The panel shows the times and the calls of one tab by it.
        String[] ranIn = {session};
        String[] id = {"-"};
        try {
            return exchange(action, session, params, timeout, inside, ranIn, id);
        } catch (BrowserException e) {
            errorCode = e.code();
            throw e;
        } finally {
            long trip = System.nanoTime() - started;
            log.command(id[0], ranIn[0], action, trip / 1_000_000, errorCode);
            timings.trip(trip, inside[0], ranIn[0]);
            if (lock != null) {
                lock.unlock();
            }
        }
    }

    private JsonNode exchange(String action, String session, JsonNode params, Duration timeout,
            Protocol.Timing[] inside, String[] ranIn, String[] idOut) {
        if (server != null) {
            // A pairing made on an older token ends before anything is sent on it, and is then none.
            server.dropStalePairing();
        }
        if (!isConnected()) {
            if (held()) {
                // The nearest cause comes first: nothing else can connect while this is so.
                throw new BrowserException("NOT_CONNECTED", NOT_CONNECTED_HELD);
            }
            throw new BrowserException("NOT_CONNECTED", switch (lastCloseCode()) {
                case Protocol.CLOSE_USER_DISCONNECTED ->
                    "The user disconnected this agent in the TabGoblin popup. Ask them to allow it again.";
                // What the user has to do about these two is said by the one who knows where the token is.
                case Protocol.CLOSE_UNAUTHORIZED ->
                    "The Chrome extension is not paired with this server: the token it holds is not this server's.";
                default -> "The Chrome extension is not connected.";
            });
        }
        // The id is given with the sending: both are the server's, so that an answer finds its agent.
        CompletableFuture<Protocol.Response> future = new CompletableFuture<>();
        String id = null;
        try {
            long deadline = System.currentTimeMillis() + timeout.toMillis();
            id = server.send(agent, action, session, params, deadline, sent -> {
                pending.put(sent, future);
                running.put(sent, action);
            });
            idOut[0] = id;
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
            server.cancel(id);
            throw new BrowserException("TIMEOUT", "No response from the browser within " + timeout.toSeconds()
                    + "s. The command was cancelled and not retried, but its outcome is unknown; inspect the "
                    + "page before repeating it.");
        } catch (ExecutionException e) {
            if (e.getCause() instanceof BrowserException be) {
                throw be;
            }
            throw new BrowserException("ERROR", "Command failed: " + e.getCause().getMessage());
        } catch (InterruptedException e) {
            server.cancel(id);
            Thread.currentThread().interrupt();
            throw new BrowserException("INTERRUPTED", "The command was cancelled. If it had already reached "
                    + "the page its outcome is unknown; inspect the page before repeating it.");
        } catch (BrowserException e) {
            throw e;
        } catch (WebsocketNotConnectedException e) {
            throw new BrowserException("NOT_CONNECTED", "The Chrome extension connection was lost.");
        } catch (RuntimeException e) {
            throw new BrowserException("NOT_CONNECTED", "The Chrome extension connection was lost.");
        } finally {
            if (id != null) {
                pending.remove(id);
                running.remove(id);
                server.done(id);
            }
        }
    }

    /** The action of a command that was sent and is not answered yet, or null when none is. */
    String running() {
        return running.values().stream().findFirst().orElse(null);
    }
}
