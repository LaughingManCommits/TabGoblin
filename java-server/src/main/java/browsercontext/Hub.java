package browsercontext;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BiConsumer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * The one server: every agent on this machine is connected to it. It listens on the loopback
 * address for the processes that agents' programs start ({@link Link}), has each prove that it
 * knows the pairing token and proves the same in return, and then serves that agent: its MCP
 * conversation, its tools, and its own connection to the extension ({@link Agent}).
 *
 * <p>The agents share the process and nothing else. Each has its own port to the extension, its
 * own sessions and its own times; no tool tells one agent anything of another. What is one for
 * all is what the user has: the window, the log in it, and Stop.
 *
 * <p>It ends when its last agent has gone, or when the user stops it. A server that the user
 * started stays until it is stopped.
 */
final class Hub {

    /** Longest line a process may send before it has proven itself. */
    private static final int MAX_HANDSHAKE_BYTES = 4096;
    /** Failed proofs within a minute before nothing new is listened to for a while. */
    private static final int MAX_FAILED_PROOFS = 10;
    private static final long LOCKOUT_MS = 60_000;
    /** How long the server waits for an agent after its last one has gone, before it ends. */
    static final long EMPTY_FOR_MS = 3_000;
    private volatile long emptyFor = EMPTY_FOR_MS;

    /** One agent that is connected, and the way its link is written to. */
    static final class Member {
        private final Socket socket;
        private final LineOut out;
        private final AtomicBoolean gone = new AtomicBoolean();
        private volatile Agent agent;

        private Member(Socket socket, LineOut out) {
            this.socket = socket;
            this.out = out;
        }

        Agent agent() {
            return agent;
        }
    }

    /**
     * Writes whole lines to a link, one at a time. The MCP conversation and what the server says to
     * the link itself go down the same connection: a line of the one never lands inside a line of
     * the other.
     */
    static final class LineOut extends OutputStream {
        private final OutputStream to;
        private final ByteArrayOutputStream line = new ByteArrayOutputStream();

        LineOut(OutputStream to) {
            this.to = to;
        }

        @Override
        public synchronized void write(int b) throws IOException {
            line.write(b);
            if (b == '\n') {
                send();
            }
        }

        @Override
        public synchronized void write(byte[] b, int off, int len) throws IOException {
            for (int i = off; i < off + len; i++) {
                line.write(b[i]);
                if (b[i] == '\n') {
                    send();
                }
            }
        }

        private void send() throws IOException {
            synchronized (to) {
                line.writeTo(to);
                to.flush();
            }
            line.reset();
        }

        /** A line for the link itself: what kind it is, and a text. Never thrown from: a link that is gone is found gone elsewhere. */
        void control(String kind, String text, ObjectMapper json) {
            ObjectNode msg = json.createObjectNode();
            msg.put("tabgoblin", kind);
            if (text != null) {
                msg.put("text", text);
            }
            byte[] bytes = (json.writeValueAsString(msg) + "\n").getBytes(StandardCharsets.UTF_8);
            try {
                synchronized (to) {
                    to.write(bytes);
                    to.flush();
                }
            } catch (IOException e) {
                // gone
            }
        }
    }

    private final Agent.Settings settings;
    private final ServerSocket listening;
    private final ObjectMapper json = new ObjectMapper();
    private final List<Member> members = new CopyOnWriteArrayList<>();
    private final Deque<Long> failedProofs = new ArrayDeque<>();
    private final BiConsumer<String, String> logTo = this::passOn;
    private volatile boolean standing;
    private volatile boolean held;
    private volatile boolean stopping;
    private volatile long emptySince = System.currentTimeMillis();
    /** Shows the server's window; run when a link asks for it, or when the browser has to be paired. */
    private volatile Runnable window = () -> { };
    /** Whether the window is there: a server without a display has none, whoever asks. */
    private volatile java.util.function.BooleanSupplier windowUp = () -> false;
    /** The window came up by itself for a pairing, and nothing has been paired since. */
    private final AtomicBoolean cameUp = new AtomicBoolean();
    /** Run when the last agent has gone and stayed gone, unless the user started this server. */
    private volatile Runnable whenEmpty = () -> { };

    private Hub(Agent.Settings settings, ServerSocket listening, boolean standing) {
        this.settings = settings;
        this.listening = listening;
        this.standing = standing;
    }

    /**
     * Begins to listen for links, on the port after the agents' own.
     *
     * @param standing the user started this server: it stays when no agent is connected
     * @throws IOException if the port is taken: there is a server already, or another program has it
     */
    static Hub open(Agent.Settings settings, boolean standing) throws IOException {
        ServerSocket socket = new ServerSocket(Link.port(settings.port()), 50, InetAddress.getByAddress(new byte[] {127, 0, 0, 1}));
        Hub hub = new Hub(settings, socket, standing);
        Log.written(hub.logTo);
        Log.info("server listening for agents port=" + socket.getLocalPort());
        return hub;
    }

    int port() {
        return listening.getLocalPort();
    }

    /** The agents that are connected, in the order they came. */
    List<Agent> agents() {
        return members.stream().map(Member::agent).filter(java.util.Objects::nonNull).toList();
    }

    boolean standing() {
        return standing;
    }

    boolean held() {
        return held;
    }

    void window(Runnable show) {
        window(show, () -> false);
    }

    /**
     * @param show shows the window, or brings it up if it is there
     * @param up   whether the window is there
     */
    void window(Runnable show, java.util.function.BooleanSupplier up) {
        this.window = show;
        this.windowUp = up;
    }

    /**
     * Asked when a tool of one agent finds no browser on that agent's connection: what the server
     * knows of it. If a browser came to one of its agents with a token that is not the server's,
     * the user has to paste the token: the window, where it is copied, comes up by itself, once
     * until something is paired. Where no browser has come at all, none does: a paired extension
     * is on its way as a rule.
     *
     * @param quiet the agent's process was started with --no-panel: no window comes up for it
     */
    BrowserService.Unpaired unpaired(boolean quiet) {
        // Paired on the token as it is now: after a new token an agent's old pairing is still open for a moment.
        if (agents().stream().anyMatch(agent -> agent.bridge().pairedOnCurrentToken())) {
            cameUp.set(false);
            return new BrowserService.Unpaired(true, false, windowUp.getAsBoolean());
        }
        boolean refused = agents().stream().anyMatch(agent -> agent.bridge().lastCloseCode() == Protocol.CLOSE_UNAUTHORIZED);
        if (refused && !quiet && !held && cameUp.compareAndSet(false, true)) {
            Log.info("window asked for reason=browser_has_another_token");
            window.run();
        }
        return new BrowserService.Unpaired(false, refused, windowUp.getAsBoolean());
    }

    /** Shows the server's window, or brings it up if it is there already. */
    void showWindow() {
        window.run();
    }

    void whenEmpty(Runnable end) {
        this.whenEmpty = end;
    }

    /**
     * Switches every agent's connection to the browser off or on, for the window's switch. An
     * agent that connects while it is off starts with its connection off.
     */
    void setHeld(boolean off) {
        held = off;
        for (Agent agent : agents()) {
            agent.bridge().setHeld(off);
        }
    }

    /** Takes links until the server is closed. Each is dealt with on a thread of its own. */
    void serve() {
        Thread emptiness = new Thread(this::watchEmptiness, "bcmcp-hub-empty");
        emptiness.setDaemon(true);
        emptiness.start();
        while (!listening.isClosed()) {
            Socket socket;
            try {
                socket = listening.accept();
            } catch (IOException e) {
                break;
            }
            Thread thread = new Thread(() -> welcome(socket), "bcmcp-hub-link");
            thread.setDaemon(true);
            thread.start();
        }
    }

    /** The first exchange with a process that connected: proofs both ways, and what it wants. */
    private void welcome(Socket socket) {
        boolean kept = false;
        Member joining = null;
        try {
            socket.setSoTimeout(5000);
            socket.setTcpNoDelay(true);
            if (lockedOut()) {
                Log.warn("link rejected reason=lockout");
                return;
            }
            String nonce = Pairing.randomHex(16);
            OutputStream to = socket.getOutputStream();
            ObjectNode hello = json.createObjectNode();
            hello.put("type", "hello");
            hello.put("nonce", nonce);
            hello.put("link", Link.VERSION);
            line(to, hello);
            JsonNode ask = json.readTree(readLine(socket.getInputStream()));
            String type = ask.path("type").asString("");
            String linkNonce = ask.path("nonce").asString("");
            String current = settings.token().get();
            boolean proven = (type.equals("attach") || type.equals("show"))
                    && linkNonce.length() >= 16 && linkNonce.length() <= 128
                    && Pairing.constantTimeEquals(ask.path("proof").asString(""), Pairing.linkProof(current, nonce, linkNonce));
            if (!proven) {
                noteFailedProof();
                Log.warn("link rejected reason=proof");
                refuse(to, "proof");
                return;
            }
            if (ask.path("link").asInt(0) != Link.VERSION) {
                Log.warn("link rejected reason=version peer=" + ask.path("link").asInt(0));
                refuse(to, "link_of_another_version");
                return;
            }
            if (stopping) {
                refuse(to, "server_stopping");
                return;
            }
            ObjectNode answer = json.createObjectNode();
            answer.put("proof", Pairing.hubProof(current, nonce, linkNonce));
            if (type.equals("show")) {
                // The user ran the command for the window: it is theirs to close, so the server stays for them.
                standing = true;
                window.run();
                answer.put("type", "shown");
                line(to, answer);
                return;
            }
            answer.put("type", "attached");
            line(to, answer);
            if (ask.path("panel").asBoolean(false)) {
                window.run();
            }
            socket.setSoTimeout(0);
            LineOut out = new LineOut(to);
            Member member = new Member(socket, out);
            // In the list before it is served: its first lines in the log are passed on to it.
            joining = member;
            members.add(member);
            emptySince = 0;
            boolean quiet = ask.path("quiet").asBoolean(false);
            member.agent = Agent.serve(settings, socket.getInputStream(), out, () -> left(member), held, () -> unpaired(quiet));
            member.agent.announce();
            kept = true;
        } catch (IOException | RuntimeException e) {
            // Not a link, or one that went away at once.
        } finally {
            if (!kept) {
                close(socket);
                // One that was taken into the list and could not be served is not kept there: a server
                // that counts an agent it does not have never ends.
                if (joining != null && members.remove(joining) && members.isEmpty()) {
                    emptySince = System.currentTimeMillis();
                }
            }
        }
    }

    private void refuse(OutputStream to, String reason) throws IOException {
        ObjectNode no = json.createObjectNode();
        no.put("type", "refused");
        no.put("reason", reason);
        line(to, no);
    }

    private void line(OutputStream to, ObjectNode message) throws IOException {
        to.write((json.writeValueAsString(message) + "\n").getBytes(StandardCharsets.UTF_8));
        to.flush();
    }

    /** One line, byte by byte, so that nothing behind it is taken from the stream: that is the agent's. */
    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream line = new ByteArrayOutputStream();
        int b;
        while ((b = in.read()) >= 0 && b != '\n') {
            if (line.size() >= MAX_HANDSHAKE_BYTES) {
                throw new IOException("line too long");
            }
            line.write(b);
        }
        if (b < 0 && line.size() == 0) {
            throw new IOException("closed");
        }
        return line.toString(StandardCharsets.UTF_8);
    }

    private synchronized void noteFailedProof() {
        long now = System.currentTimeMillis();
        failedProofs.addLast(now);
        while (!failedProofs.isEmpty() && now - failedProofs.peekFirst() > LOCKOUT_MS) {
            failedProofs.removeFirst();
        }
    }

    private synchronized boolean lockedOut() {
        long now = System.currentTimeMillis();
        while (!failedProofs.isEmpty() && now - failedProofs.peekFirst() > LOCKOUT_MS) {
            failedProofs.removeFirst();
        }
        return failedProofs.size() >= MAX_FAILED_PROOFS;
    }

    /** An agent's input has ended: the agent is gone. Its part is ended in order, away from the thread that read the input. */
    private void left(Member member) {
        if (!member.gone.compareAndSet(false, true)) {
            return;
        }
        Thread ending = new Thread(() -> {
            Agent agent = member.agent;
            if (agent != null) {
                Log.of(agent.bridge().clientId()).info("agent left client=" + agent.bridge().clientId());
                agent.close();
            }
            members.remove(member);
            close(member.socket);
            if (members.isEmpty()) {
                emptySince = System.currentTimeMillis();
            }
        }, "bcmcp-hub-left");
        ending.setDaemon(true);
        ending.start();
    }

    /** Ends the server when its last agent has gone and none has come since, unless the user started it. */
    private void watchEmptiness() {
        while (!listening.isClosed()) {
            try {
                Thread.sleep(250);
            } catch (InterruptedException e) {
                return;
            }
            long since = emptySince;
            if (!standing && !stopping && members.isEmpty() && since > 0 && System.currentTimeMillis() - since >= emptyFor) {
                Log.info("server ending reason=no_agent_left");
                whenEmpty.run();
                return;
            }
        }
    }

    /** A line that was written to the log: it goes to the agent it belongs to, or to every agent if it is the server's own. */
    private void passOn(String agent, String message) {
        for (Member member : members) {
            Agent its = member.agent;
            if (agent == null || (its != null && agent.equals(its.bridge().clientId()))) {
                member.out.control("log", message, json);
            }
        }
    }

    /**
     * Ends the server in order: every link is told that this is a stop and no loss, so that none of
     * them starts the server anew; then each agent's part is ended, and the port is given up.
     */
    void close() {
        stopping = true;
        Log.unwritten(logTo);
        for (Member member : members) {
            member.out.control("stopping", null, json);
        }
        for (Member member : members) {
            Agent agent = member.agent;
            if (agent != null) {
                agent.close();
            }
            close(member.socket);
        }
        members.clear();
        try {
            listening.close();
        } catch (IOException e) {
            // ending anyway
        }
    }

    private static void close(Socket socket) {
        try {
            socket.close();
        } catch (IOException e) {
            // closing anyway
        }
    }

    /** For tests: whether the port is still listened on. */
    boolean open() {
        return !listening.isClosed();
    }

    /** For tests: a shorter wait for an agent after the last one has gone. */
    void emptyFor(long ms) {
        emptyFor = ms;
    }

    /**
     * For tests: ends as a process that is killed ends, without a word to anyone. The links find
     * their connections gone, and the extension its sockets.
     */
    void drop() {
        stopping = true;
        Log.unwritten(logTo);
        try {
            listening.close();
        } catch (IOException e) {
            // gone anyway
        }
        for (Member member : members) {
            close(member.socket);
            Agent agent = member.agent;
            if (agent != null) {
                agent.close();
            }
        }
        members.clear();
    }
}
