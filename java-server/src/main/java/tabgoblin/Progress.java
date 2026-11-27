package tabgoblin;

import io.modelcontextprotocol.server.McpSyncServerExchange;
import io.modelcontextprotocol.spec.McpSchema;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * Tells the MCP client that a call is still running, when the client asked to be told by sending
 * a progress token. A submission can wait a minute and a half for the user's answer; without this
 * the client sees nothing in that time and may give the call up.
 *
 * <p>The value reported is the time the call has run, in seconds, so it increases with each
 * notification as the protocol requires. How long the call will take is not known, so no total
 * is given.
 */
final class Progress {

    static final long EVERY_MS = 3000;

    private static final ScheduledExecutorService TIMER = Executors.newSingleThreadScheduledExecutor(task -> {
        Thread thread = new Thread(task, "tabgoblin-progress");
        thread.setDaemon(true);
        return thread;
    });

    private final McpSyncServerExchange exchange;
    private final Object token;
    private final String message;
    private final long started = System.nanoTime();
    private ScheduledFuture<?> ticking;
    private boolean stopped;

    private Progress(McpSyncServerExchange exchange, Object token, String message) {
        this.exchange = exchange;
        this.token = token;
        this.message = message;
    }

    /** Starts reporting, or returns null when the client did not ask for it. */
    static Progress start(McpSyncServerExchange exchange, Object token, String message) {
        if (exchange == null || token == null) {
            return null;
        }
        Progress progress = new Progress(exchange, token, message);
        synchronized (progress) {
            progress.ticking = TIMER.scheduleAtFixedRate(progress::tick, EVERY_MS, EVERY_MS, TimeUnit.MILLISECONDS);
        }
        return progress;
    }

    private synchronized void tick() {
        if (stopped) {
            return;
        }
        try {
            double seconds = Math.round((System.nanoTime() - started) / 1e8) / 10.0;
            exchange.progressNotification(new McpSchema.ProgressNotification(token, seconds, null, message, null));
        } catch (RuntimeException e) {
            // a courtesy to the client: never a reason for the call to fail
        }
    }

    /** Ends it. Once this returns nothing more is sent: no notification may follow the answer. */
    synchronized void stop() {
        stopped = true;
        if (ticking != null) {
            ticking.cancel(false);
        }
    }
}
