package browsercontext;

import java.io.ByteArrayOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Sits between stdin and the MCP transport. It passes every byte through untouched and, on the
 * side, does two things the MCP SDK does not:
 *
 * <ul>
 * <li>notices end of input, so the process can exit when the MCP client goes away;</li>
 * <li>honours {@code notifications/cancelled}: the SDK has no handler for it, so a tool call the
 * client gave up on would keep running. Here the matching call's thread is interrupted, which
 * cancels the command in the browser at its next safe point.</li>
 * </ul>
 *
 * <p>The SDK does not tell a tool handler its JSON-RPC id, so calls are matched to handlers by
 * tool name and arguments, oldest first. Two identical calls are interchangeable for this purpose.
 */
final class StdinTap extends FilterInputStream {

    private record Call(String id, String tool, JsonNode arguments) {
    }

    private final ObjectMapper json = new ObjectMapper();
    private final Runnable onEnd;
    private final java.util.function.Consumer<String> onClientName;
    private final ByteArrayOutputStream line = new ByteArrayOutputStream();
    private final Deque<Call> arrived = new ArrayDeque<>();
    private final Map<String, Thread> running = new HashMap<>();
    private final Set<String> cancelledEarly = new HashSet<>();
    /** Calls the client gave up on while they ran, until their handler has been told. */
    private final Set<String> givenUp = new HashSet<>();

    StdinTap(InputStream in, Runnable onEnd) {
        this(in, onEnd, name -> { });
    }

    /**
     * @param onClientName told the name the MCP client gives itself when it opens the connection.
     *                     The SDK hands that name to a tool handler only, which is at the first tool
     *                     call; a server that was started again needs it at once, because its
     *                     sessions come back to it by that name
     */
    StdinTap(InputStream in, Runnable onEnd, java.util.function.Consumer<String> onClientName) {
        super(in);
        this.onEnd = onEnd;
        this.onClientName = onClientName;
    }

    @Override
    public int read(byte[] b, int off, int len) throws IOException {
        int n = super.read(b, off, len);
        if (n < 0) {
            onEnd.run();
            return n;
        }
        for (int i = off; i < off + n; i++) {
            accept(b[i]);
        }
        return n;
    }

    @Override
    public int read() throws IOException {
        int c = super.read();
        if (c < 0) {
            onEnd.run();
        } else {
            accept((byte) c);
        }
        return c;
    }

    private void accept(byte b) {
        if (b != '\n') {
            line.write(b);
            return;
        }
        String text = line.toString(StandardCharsets.UTF_8);
        line.reset();
        // Only three kinds of message matter here; everything else is not even parsed.
        if (text.contains("\"tools/call\"") || text.contains("\"notifications/cancelled\"")) {
            inspect(text);
        } else if (text.contains("\"initialize\"")) {
            introduce(text);
        }
    }

    /** The client's opening message says who it is. */
    private void introduce(String text) {
        try {
            JsonNode msg = json.readTree(text);
            String name = msg.path("params").path("clientInfo").path("name").asString("");
            if (msg.path("method").asString("").equals("initialize") && !name.isBlank()) {
                onClientName.accept(name);
            }
        } catch (RuntimeException e) {
            // Not a message this server understands; the SDK will say so.
        }
    }

    private synchronized void inspect(String text) {
        JsonNode msg;
        try {
            msg = json.readTree(text);
        } catch (RuntimeException e) {
            return;
        }
        String method = msg.path("method").asString("");
        if (method.equals("tools/call") && msg.has("id")) {
            arrived.addLast(new Call(msg.path("id").asString(msg.path("id").toString()),
                    msg.path("params").path("name").asString(""), msg.path("params").path("arguments")));
            while (arrived.size() > 200) {
                arrived.removeFirst();
            }
        } else if (method.equals("notifications/cancelled")) {
            JsonNode requestId = msg.path("params").path("requestId");
            String id = requestId.asString(requestId.toString());
            Thread thread = running.get(id);
            if (thread != null) {
                Log.info("tool call cancelled by the MCP client id=" + id);
                givenUp.add(id);
                thread.interrupt();
            } else {
                cancelledEarly.add(id);
            }
        }
    }

    /**
     * Called by a tool handler when it starts: claims the oldest unclaimed call with this tool and
     * these arguments. Returns its request id, or null when it cannot be told apart.
     */
    synchronized String begin(String tool, JsonNode arguments) {
        JsonNode wanted = arguments == null || arguments.isNull() ? json.createObjectNode() : arguments;
        for (var it = arrived.iterator(); it.hasNext();) {
            Call call = it.next();
            JsonNode given = call.arguments().isMissingNode() || call.arguments().isNull()
                    ? json.createObjectNode() : call.arguments();
            if (!call.tool().equals(tool) || !given.equals(wanted)) {
                continue;
            }
            it.remove();
            running.put(call.id(), Thread.currentThread());
            if (cancelledEarly.remove(call.id())) {
                givenUp.add(call.id());
                Thread.currentThread().interrupt();
            }
            return call.id();
        }
        return null;
    }

    /**
     * Called by the tool handler when it is done; also clears a late interrupt. Returns whether
     * the client gave this call up: it then expects no answer.
     */
    synchronized boolean end(String id) {
        Thread.interrupted();
        if (id == null) {
            return false;
        }
        running.remove(id);
        return givenUp.remove(id);
    }
}
