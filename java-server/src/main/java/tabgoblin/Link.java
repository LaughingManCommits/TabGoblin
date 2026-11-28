package tabgoblin;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.PrintStream;
import java.net.ConnectException;
import java.net.Proxy;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import org.java_websocket.client.WebSocketClient;
import org.java_websocket.drafts.Draft_6455;
import org.java_websocket.handshake.ServerHandshake;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * What the process that an agent's program starts does when there is one server for all agents:
 * it passes its agent's MCP messages on to that server, and the answers back.
 *
 * <p>An agent's program starts the server as a child of its own and talks to it through that
 * child's input and output; that cannot be changed from here. So the child stays, and is this:
 * a pipe to the one server ({@link Hub}), which it reaches on the server's one port, on the path
 * {@code /link}, or starts as a process of its own if there is none. A line of the agent's is one
 * message of the connection, and a message of the server's one line to the agent. Each side proves
 * to the other that it knows the pairing token before a message passes.
 *
 * <p>If the server's process ends while the agent is still there, and nobody stopped it, the
 * link starts the server anew and goes on: it tells the new server who its agent is, by sending
 * the agent's opening message again, and tells the agent that the calls it was waiting for have
 * an unknown outcome. Nothing is sent twice for the agent, and nothing is retried.
 */
final class Link {

    /** The version of what a link and the server say to each other before the agent's messages pass. */
    static final int VERSION = 3;

    /** How the link's time with the server ended. */
    enum End {
        /** The agent closed its input. */
        AGENT_LEFT,
        /** The user stopped the server. */
        SERVER_STOPPED,
        /** The server went away and could not be had again. */
        SERVER_LOST
    }

    /** Starts the one server as a process of its own. */
    interface Starter {
        void start() throws IOException;
    }

    /** The other side did not prove itself, or is of another kind: no message of the agent's goes to it. */
    static final class Refused extends Exception {
        private static final long serialVersionUID = 1L;

        Refused(String why) {
            super(why);
        }
    }

    /**
     * One connection to the server. Its messages are taken from a queue, so that the handshake and
     * the pump read them in turn; its end is the last entry of the queue.
     */
    private static final class Wire extends WebSocketClient {
        private static final String END = "\u0000";
        private final BlockingQueue<String> in = new LinkedBlockingQueue<>();
        private final CountDownLatch opening = new CountDownLatch(1);
        private volatile boolean opened;
        private volatile Exception failure;

        Wire(URI uri) {
            super(uri, new Draft_6455(Collections.emptyList(), Collections.singletonList(new org.java_websocket.protocols.Protocol("")),
                    ExtensionServer.MAX_MESSAGE_BYTES), Map.of(), 2000);
            setTcpNoDelay(true);
            // Own the socket before connect() starts, so expiry can also interrupt an unfinished upgrade.
            setSocket(new Socket(Proxy.NO_PROXY));
        }

        @Override
        public void onOpen(ServerHandshake handshake) {
            opened = true;
            opening.countDown();
        }

        @Override
        public void onMessage(String message) {
            in.add(message);
        }

        @Override
        public void onClose(int code, String reason, boolean remote) {
            opening.countDown();
            in.add(END);
        }

        @Override
        public void onError(Exception ex) {
            if (failure == null) {
                failure = ex;
            }
            opening.countDown();
        }

        /** The next message, or null when the connection has ended. */
        String take() throws InterruptedException {
            String next = in.take();
            return END.equals(next) ? null : next;
        }

        /** The next message within a time, or null when the connection has ended. */
        String take(long ms, String stage) throws IOException {
            String next;
            try {
                next = in.poll(ms, TimeUnit.MILLISECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IOException(stage + " interrupted");
            }
            if (next == null) {
                throw new SocketTimeoutException(stage + " timed out after " + ms + " ms");
            }
            return END.equals(next) ? null : next;
        }
    }

    private static final String CONTROL = "{\"tabgoblin\":";
    private static final long CONNECT_WITHIN_MS = 20_000;
    private static final long ANSWER_WITHIN_MS = 5_000;

    private final BufferedReader in;
    private final OutputStream out;
    private final PrintStream err;
    private final Supplier<String> token;
    private final boolean quiet;
    /** The ports the one server may listen on, in the order they are tried. */
    private final List<Integer> ports;
    private final boolean panel;
    private final Starter starter;
    /** The label of this agent's key and the folder the keys are in; null for an agent that has none. */
    private final String agent;
    private final java.nio.file.Path agentKeys;
    private final ObjectMapper json = new ObjectMapper();

    /** What the agent is waiting for an answer to, by the request's id as it was written: whether it is a tool call. */
    private final Map<String, Boolean> pending = new LinkedHashMap<>();
    /** The agent's opening message and what it said after the answer: a new server is told both. */
    private String opening;
    private String openingId;
    private String opened;
    /** The id of an answer the agent has already: the new server's answer to the opening sent anew. */
    private String swallow;
    private Wire channel;
    private volatile boolean inputEnded;
    private volatile boolean stopping;
    /** This process runs one command for its agent and ends ({@link Cli}): the server keeps the agent between such commands. */
    private boolean command;
    /** The last unsuccessful attempt to reach the server, including local failures. */
    private volatile String refusal;

    /**
     * @param port    the port the server listens on
     * @param panel   the agent's settings ask for the server's window
     * @param starter starts the one server when there is none
     * @param err     where this process's own log goes: the server's lines for this agent are written there
     */
    Link(InputStream in, OutputStream out, PrintStream err, Supplier<String> token, int port, boolean panel, Starter starter) {
        this(in, out, err, token, port, panel, false, starter);
    }

    /**
     * @param quiet the agent was started with --no-panel: the server's window does not come up by
     *              itself for it when the browser has to be paired
     */
    Link(InputStream in, OutputStream out, PrintStream err, Supplier<String> token, int port, boolean panel, boolean quiet,
            Starter starter) {
        this(in, out, err, token, port, panel, quiet, starter, null, null);
    }

    /**
     * @param agent     the label of this agent's key, as its program names it with --agent; null for none
     * @param agentKeys the folder the agents' keys are in
     */
    Link(InputStream in, OutputStream out, PrintStream err, Supplier<String> token, int port, boolean panel, boolean quiet,
            Starter starter, String agent, java.nio.file.Path agentKeys) {
        this(in, out, err, token, List.of(port), panel, quiet, starter, agent, agentKeys);
    }

    /**
     * @param ports the ports the server may listen on, in the order they are tried: the list that
     *              every part knows, or the one the user chose
     */
    Link(InputStream in, OutputStream out, PrintStream err, Supplier<String> token, List<Integer> ports, boolean panel,
            boolean quiet, Starter starter, String agent, java.nio.file.Path agentKeys) {
        this.agent = agentKeys == null ? null : agent;
        this.agentKeys = agentKeys;
        this.quiet = quiet;
        this.in = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        this.out = out;
        this.err = err;
        this.token = token;
        this.ports = ports;
        this.panel = panel;
        this.starter = starter;
    }

    /**
     * For a process that runs one command and ends. The server is told so, and keeps the agent's
     * view of the browser for the next command; and a server that goes away under the command is
     * not started anew: the command's outcome is unknown, and that is its answer.
     */
    Link forCommand() {
        command = true;
        return this;
    }

    /** The local connection failure or the server's refusal, for the command's answer. */
    String refusal() {
        return refusal;
    }

    /**
     * Has the server: connects to the one that runs, or starts it and connects. Says false if no
     * server is to be had here: its port is held by something else, or it cannot be started. The
     * agent's messages have not been touched then, and the process can serve its agent alone.
     */
    boolean connect() {
        Wire found = reach();
        if (found == null) {
            return false;
        }
        synchronized (this) {
            channel = found;
            notifyAll();
        }
        return true;
    }

    /** A connection to the server on which both sides have proven themselves, or null if there is none to be had. */
    private Wire reach() {
        refusal = null;
        long deadline = System.currentTimeMillis() + CONNECT_WITHIN_MS;
        long started = 0;
        while (true) {
            try {
                return attach("attach");
            } catch (ConnectException e) {
                // Nobody listens there: there is no server. One is started, and given a moment.
                if (System.currentTimeMillis() - started > 5_000) {
                    try {
                        starter.start();
                        started = System.currentTimeMillis();
                    } catch (IOException | RuntimeException failed) {
                        refusal = "server start failed: " + failed.getClass().getSimpleName();
                        say("the server could not be started reason=" + failed.getClass().getSimpleName());
                        return null;
                    }
                }
            } catch (Refused e) {
                refusal = reasonOf(e);
                say("no server to connect to reason=" + refusal);
                return null;
            } catch (IOException e) {
                refusal = reasonOf(e);
                say("no server to connect to reason=" + refusal);
                return null;
            }
            if (System.currentTimeMillis() > deadline) {
                refusal = "server not started within " + CONNECT_WITHIN_MS / 1000 + " seconds";
                say("no server to connect to reason=" + refusal);
                return null;
            }
            try {
                Thread.sleep(150);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                refusal = "server start wait interrupted";
                say("no server to connect to reason=" + refusal);
                return null;
            }
        }
    }

    /**
     * Asks the server that is running to show its window, without becoming an agent of it. Says
     * false if no server is running.
     */
    boolean show() throws IOException, Refused {
        try {
            attach("show").close();
            return true;
        } catch (ConnectException e) {
            return false;
        }
    }

    /**
     * Tells the server that is running that an MCP start was turned away, because the settings have
     * MCP off: the server counts it for its window. Says false if no server is running. Nothing of
     * the agent's is sent, and no server is started for it.
     */
    boolean turnedAway() throws IOException, Refused {
        try {
            attach("turned_away").close();
            return true;
        } catch (ConnectException e) {
            return false;
        }
    }

    /**
     * Connects to the server on the first of its ports that somebody listens on. Where the system
     * keeps the usual port back, the server is on a later one of the list.
     *
     * @throws ConnectException       if nobody listens on any of them: there is no server
     * @throws SocketTimeoutException if the connection did not open within two seconds: something
     *                                took it and does not answer, or a server that is still starting
     * @throws IOException            if the connection failed with an I/O error before it opened
     * @throws Refused                if it ended before opening without one: the other side turned
     *                                the upgrade down, or does not speak WebSocket
     */
    private Wire open() throws IOException, Refused {
        IOException nobody = new ConnectException("no port to look for the server on");
        for (int port : ports) {
            Wire wire = new Wire(URI.create("ws://127.0.0.1:" + port + ExtensionServer.LINK_PATH));
            boolean keep = false;
            try {
                wire.connect();
                if (!wire.opening.await(2, TimeUnit.SECONDS)) {
                    throw new SocketTimeoutException("WebSocket open timed out after 2 seconds");
                }
                if (wire.opened) {
                    keep = true;
                    return wire;
                }
                if (wire.failure instanceof ConnectException refused) {
                    nobody = refused;
                    continue;
                }
                String detail = wire.failure == null ? "" : ": " + wire.failure.getClass().getSimpleName();
                String ended = "WebSocket connection ended before opening" + detail;
                // An I/O error stays one, of its own kind: the window's command tells a connection that
                // timed out from a program that is not the server (McpMain.showWindow).
                if (wire.failure instanceof SocketTimeoutException) {
                    throw new SocketTimeoutException(ended);
                }
                if (wire.failure instanceof IOException io) {
                    throw new IOException(ended, io);
                }
                throw new Refused(ended);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IOException("WebSocket open interrupted");
            } finally {
                if (!keep) {
                    wire.getSocket().close();
                }
            }
        }
        throw nobody;
    }

    /** Proves this side, has the other side proven, and says what is wanted: to pass an agent's messages, or the window. */
    private Wire attach(String what) throws IOException, Refused {
        Wire wire = null;
        boolean kept = false;
        try {
            wire = open();
            JsonNode hello = message(wire, "server greeting");
            String serverNonce = hello.path("nonce").asString("");
            if (!hello.path("type").asString("").equals("hello") || serverNonce.length() < 16) {
                throw new Refused("invalid server greeting");
            }
            if (hello.path("link").asInt(0) != VERSION) {
                throw new Refused("server_of_another_version");
            }
            String current = token.get();
            String nonce = Pairing.randomHex(16);
            ObjectNode ask = json.createObjectNode();
            ask.put("type", what);
            ask.put("nonce", nonce);
            ask.put("proof", Pairing.linkProof(current, serverNonce, nonce));
            ask.put("link", VERSION);
            ask.put("panel", panel);
            ask.put("quiet", quiet);
            if (command && what.equals("attach")) {
                ask.put("cli", true);
            }
            if (what.equals("attach") && agent != null) {
                // Who this agent is: the label of its key, and the proof that this process holds the
                // key. A label the user revoked is named without a proof: no key is made for it.
                ask.put("agent", agent);
                if (!AgentKeys.revoked(agentKeys, agent)) {
                    try {
                        ask.put("agentProof", AgentKeys.proof(AgentKeys.loadOrCreate(agentKeys, agent), serverNonce, nonce));
                    } catch (IOException e) {
                        // Without a key there is nothing to prove: the agent is served as one without a label.
                        say("the agent's key could not be read or made: this agent has an id for this start only");
                        ask.remove("agent");
                    }
                }
            }
            wire.send(json.writeValueAsString(ask));
            JsonNode answer = message(wire, what + " reply");
            if (answer.path("type").asString("").equals("refused")) {
                throw new Refused(answer.path("reason").asString("refused"));
            }
            // The server proves that it knows the token too: a program that only sits on the port does not.
            if (!Pairing.constantTimeEquals(answer.path("proof").asString(""), Pairing.hubProof(current, serverNonce, nonce))) {
                throw new Refused("server_without_proof");
            }
            kept = true;
            return wire;
        } catch (RuntimeException e) {
            // The connection went while a message was sent: as a connection that closed.
            throw new IOException(what + " handshake failed: " + e.getClass().getSimpleName(), e);
        } finally {
            if (!kept && wire != null) {
                wire.close();
            }
        }
    }

    private JsonNode message(Wire wire, String stage) throws IOException, Refused {
        String text = wire.take(ANSWER_WITHIN_MS, stage);
        if (text == null) {
            throw new Refused("connection closed before " + stage);
        }
        try {
            return json.readTree(text);
        } catch (RuntimeException e) {
            throw new Refused("invalid JSON in " + stage);
        }
    }

    /**
     * Passes the agent's messages to the server and the answers back, until the agent closes its
     * input or the user stops the server. Call it after {@link #connect()} has said true.
     */
    End run() {
        Thread up = new Thread(this::pumpUp, "tabgoblin-link-up");
        up.setDaemon(true);
        up.start();
        while (true) {
            Wire now;
            synchronized (this) {
                now = channel;
            }
            pumpDown(now);
            synchronized (this) {
                channel = null;
            }
            close(now);
            if (inputEnded) {
                return End.AGENT_LEFT;
            }
            if (stopping) {
                return End.SERVER_STOPPED;
            }
            // The server's process is gone, and nobody stopped it. What the agent waits for has an
            // unknown outcome; then the server is had again, and told who this agent is.
            failPending();
            if (command) {
                return End.SERVER_LOST;
            }
            say("the server has gone: starting it anew");
            Wire again;
            try {
                again = reconnect();
            } catch (IOException e) {
                again = null;
            }
            if (again == null) {
                return End.SERVER_LOST;
            }
            synchronized (this) {
                channel = again;
                notifyAll();
            }
        }
    }

    /** Has the server again, and sends it the agent's opening anew before any other message goes to it. */
    private Wire reconnect() throws IOException {
        Wire found = reach();
        if (found == null) {
            return null;
        }
        String first;
        String second;
        synchronized (this) {
            first = opening;
            second = opened;
            if (first != null) {
                // The agent has the answer to its opening already: the new server's is not passed on.
                swallow = openingId;
            }
        }
        // Before any other message of the agent's: the caller hands the connection over after this.
        if (first != null) {
            write(found, first);
            if (second != null) {
                write(found, second);
            }
        }
        return found;
    }

    /** The agent's messages, to the server. A message waits while the server is being had again, and is not lost. */
    private void pumpUp() {
        try {
            String line;
            while ((line = in.readLine()) != null) {
                String id = note(line);
                send(line, id);
            }
        } catch (IOException e) {
            // The agent's end of the pipe is gone: as if it had closed it.
        }
        inputEnded = true;
        Wire now;
        synchronized (this) {
            now = channel;
            notifyAll();
        }
        close(now);
    }

    /** Remembers the agent's opening, and says the id of a request, as it was written, or null for anything else. */
    private String note(String line) {
        JsonNode msg;
        try {
            msg = json.readTree(line);
        } catch (RuntimeException e) {
            return null;
        }
        String method = msg.path("method").asString("");
        if (method.equals("initialize") && msg.has("id")) {
            synchronized (this) {
                opening = line;
                openingId = msg.get("id").toString();
            }
        } else if (method.equals("notifications/initialized")) {
            synchronized (this) {
                opened = line;
            }
        }
        if (method.isEmpty() || !msg.has("id")) {
            return null;
        }
        return (method.equals("tools/call") ? "T" : "R") + msg.get("id").toString();
    }

    private void send(String line, String request) {
        Wire last = null;
        while (true) {
            Wire now;
            synchronized (this) {
                while ((channel == null || channel == last) && !inputEnded && !stopping) {
                    try {
                        wait(500);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        return;
                    }
                }
                if (channel == null || channel == last) {
                    return;
                }
                now = channel;
                if (request != null) {
                    // From now on the agent waits for this server's answer to it.
                    pending.put(request.substring(1), request.charAt(0) == 'T');
                }
            }
            try {
                write(now, line);
                return;
            } catch (IOException e) {
                // That server is gone before it had the message: it goes to the next one, once.
                synchronized (this) {
                    if (request != null) {
                        pending.remove(request.substring(1));
                    }
                }
                last = now;
            }
        }
    }

    /** The server's messages, to the agent, until that server's connection ends. */
    private void pumpDown(Wire from) {
        try {
            String line;
            while ((line = from.take()) != null) {
                if (line.startsWith(CONTROL)) {
                    control(line);
                    continue;
                }
                if (answered(line)) {
                    continue;
                }
                synchronized (out) {
                    writeLine(out, line);
                }
            }
        } catch (IOException | InterruptedException e) {
            // The connection is gone: the caller decides what that means.
        }
    }

    /** Takes note of an answer. Says true for the one the agent must not see: to the opening that was sent anew. */
    private boolean answered(String line) {
        JsonNode msg;
        try {
            msg = json.readTree(line);
        } catch (RuntimeException e) {
            return false;
        }
        if (!msg.has("id") || msg.has("method")) {
            return false;
        }
        String id = msg.get("id").toString();
        synchronized (this) {
            if (id.equals(swallow)) {
                swallow = null;
                return true;
            }
            pending.remove(id);
        }
        return false;
    }

    /** What the server says to the link itself, and not to the agent. */
    private void control(String line) {
        try {
            JsonNode msg = json.readTree(line);
            switch (msg.path("tabgoblin").asString("")) {
                // The server's lines for this agent: they belong in the log of the process the agent started.
                case "log" -> err.println("[tabgoblin] " + msg.path("text").asString(""));
                // The user stopped the server: this is its end, and not a loss to make good.
                case "stopping" -> stopping = true;
                default -> {
                }
            }
        } catch (RuntimeException e) {
            // Not a line this link understands: left out.
        }
    }

    /**
     * Tells the agent that the calls it is waiting for have an unknown outcome: the server that had
     * them is gone. A tool call gets the answer a failed tool call gets, in the words the tools use;
     * any other request gets an error.
     */
    private void failPending() {
        Map<String, Boolean> waiting;
        synchronized (this) {
            waiting = new LinkedHashMap<>(pending);
            pending.clear();
        }
        String what = "The TabGoblin server ended while this call was running. Whether it took effect in the "
                + "browser is unknown, and it was not retried: inspect the page before repeating it.";
        waiting.forEach((id, toolCall) -> {
            String answer;
            if (toolCall) {
                ObjectNode result = json.createObjectNode();
                result.putArray("content").addObject().put("type", "text").put("text", "Error [CONNECTION_LOST]: " + what);
                result.put("isError", true);
                answer = "{\"jsonrpc\":\"2.0\",\"id\":" + id + ",\"result\":" + json.writeValueAsString(result) + "}";
            } else {
                ObjectNode error = json.createObjectNode();
                error.put("code", -32000);
                error.put("message", what);
                answer = "{\"jsonrpc\":\"2.0\",\"id\":" + id + ",\"error\":" + json.writeValueAsString(error) + "}";
            }
            try {
                synchronized (out) {
                    writeLine(out, answer);
                }
            } catch (IOException e) {
                // The agent is gone as well.
            }
        });
    }

    /** One line of the agent's, as one message of the connection. */
    private static void write(Wire to, String line) throws IOException {
        try {
            to.send(line);
        } catch (RuntimeException e) {
            throw new IOException("the server is gone", e);
        }
    }

    private static void writeLine(OutputStream to, String line) throws IOException {
        to.write((line + "\n").getBytes(StandardCharsets.UTF_8));
        to.flush();
    }

    private static void close(Wire channel) {
        if (channel != null) {
            try {
                channel.close();
            } catch (RuntimeException e) {
                // closing anyway
            }
        }
    }

    /** What a failure says, or its kind where it says nothing: never null in a command's answer. */
    private static String reasonOf(Exception e) {
        String said = e.getMessage();
        return said == null || said.isBlank() ? e.getClass().getSimpleName() : said;
    }

    private void say(String message) {
        err.println("[tabgoblin] " + message);
    }
}
