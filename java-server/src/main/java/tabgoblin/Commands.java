package tabgoblin;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * One command of the command line, as the server runs it: the conversation on the connection of
 * one command's process ({@link Cli}), after the process has proven itself to the server
 * ({@link Hub}). It is the command line's own adapter to {@link BrowserService}, beside the one for
 * MCP ({@link McpMain#toolSpecs}) and not on top of it: nothing of MCP is spoken or run here.
 *
 * <p>Three messages, one line of JSON each:
 *
 * <pre>
 *   -> {"type":"call","tool":"browser_snapshot","arguments":{...}}     one for each connection
 *   -> {"type":"cancel"}                                                the process is ending
 *   <- {"type":"result","tool":...,"isError":false,"code":null,"text":"...","structured":{...},"image":null}
 * </pre>
 *
 * <p>A call runs on a thread of its own, and is interrupted on {@code cancel} and when the
 * connection ends, which cancels the command in the browser at its next safe point, as a
 * cancelled MCP call is. Nothing is retried, and a call that was cancelled gets no answer: nobody
 * waits for it.
 */
final class Commands {

    static final String CALL = "call";
    static final String CANCEL = "cancel";
    static final String RESULT = "result";
    static final String ERROR = "error";

    private final ObjectMapper json = new ObjectMapper();
    private final BrowserService service;
    private final BufferedReader in;
    private final OutputStream out;
    private final Runnable onEnd;
    private final Log.Scope log;
    private final AtomicBoolean ended = new AtomicBoolean();
    private final AtomicBoolean called = new AtomicBoolean();
    private final AtomicBoolean cancelled = new AtomicBoolean();
    private volatile Thread running;

    private Commands(BrowserService service, InputStream in, OutputStream out, Runnable onEnd) {
        this.service = service;
        this.in = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        this.out = out;
        this.onEnd = onEnd;
        this.log = Log.of(service.clientId());
    }

    /**
     * Serves one command on its connection: the messages are read from {@code in} and the result
     * is written to {@code out}, a line at a time.
     *
     * @param clientName what the agent is called where the user sees it, as an MCP client says its
     *                   own name when it opens its connection
     * @param onEnd      run once when the connection ends: the command's process has gone
     */
    static Commands serve(BrowserService service, InputStream in, OutputStream out, String clientName, Runnable onEnd) {
        Commands commands = new Commands(service, in, out, onEnd);
        service.noteClient(clientName);
        Thread reading = new Thread(commands::read, "tabgoblin-command");
        reading.setDaemon(true);
        reading.start();
        return commands;
    }

    private void read() {
        try {
            String line;
            while ((line = in.readLine()) != null) {
                take(line);
            }
        } catch (IOException e) {
            // The process is gone without having closed its connection: that is its going too.
        }
        end();
    }

    private void take(String line) {
        JsonNode message;
        try {
            message = json.readTree(line);
        } catch (RuntimeException e) {
            tell(error("Not a message of the command line."));
            return;
        }
        switch (message.path("type").asString("")) {
            case CALL -> call(message);
            case CANCEL -> cancel();
            default -> tell(error("Not a message of the command line: " + message.path("type").asString("(no type)") + "."));
        }
    }

    private void call(JsonNode message) {
        if (!called.compareAndSet(false, true)) {
            tell(error("One call for each connection: this connection has had its call."));
            return;
        }
        String tool = message.path("tool").asString("");
        JsonNode arguments = message.path("arguments");
        Thread worker = new Thread(() -> {
            BrowserService.ToolResult result = service.call(tool, arguments.isMissingNode() ? null : arguments);
            boolean wanted;
            synchronized (this) {
                // Either the result is told or the call was given up: never both, and never after the connection ended.
                Thread.interrupted();
                running = null;
                wanted = !cancelled.get() && !ended.get();
            }
            if (wanted) {
                tell(result(tool, result));
            }
        }, "tabgoblin-command-call");
        worker.setDaemon(true);
        synchronized (this) {
            running = worker;
        }
        worker.start();
    }

    /** The process is ending while its call runs: the call is given up, and the command in the browser stops at its next safe point. */
    private void cancel() {
        Thread worker;
        synchronized (this) {
            cancelled.set(true);
            worker = running;
        }
        if (worker != null) {
            log.info("command cancelled by its process");
            worker.interrupt();
        }
    }

    /** The connection has ended: the process has gone, and a call that still runs has nobody to answer to. */
    private void end() {
        if (!ended.compareAndSet(false, true)) {
            return;
        }
        Thread worker;
        synchronized (this) {
            worker = running;
        }
        if (worker != null) {
            worker.interrupt();
        }
        onEnd.run();
    }

    /** Ends this conversation from the server's side: the agent is let go, or the server stops. */
    void close() {
        end();
        try {
            in.close();
        } catch (IOException e) {
            // closing anyway
        }
    }

    /** A tool's result as the one message a command gets, with the error's code as a field and not only in the text. */
    ObjectNode result(String tool, BrowserService.ToolResult result) {
        ObjectNode said = json.createObjectNode();
        said.put("type", RESULT);
        said.put("tool", tool);
        said.put("isError", result.isError());
        said.put("code", result.code());
        said.put("text", result.text() == null ? "" : result.text());
        said.set("structured", result.structured());
        if (result.imageBase64() != null) {
            said.putObject("image").put("mimeType", result.imageMimeType()).put("base64", result.imageBase64());
        } else {
            said.putNull("image");
        }
        return said;
    }

    private ObjectNode error(String message) {
        return json.createObjectNode().put("type", ERROR).put("message", message);
    }

    private void tell(ObjectNode message) {
        try {
            synchronized (out) {
                out.write((json.writeValueAsString(message) + "\n").getBytes(StandardCharsets.UTF_8));
                out.flush();
            }
        } catch (IOException e) {
            // The process is gone: there is nobody to tell.
        }
    }
}
