package tabgoblin;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BiConsumer;
import org.java_websocket.WebSocket;
import org.java_websocket.exceptions.WebsocketNotConnectedException;
import org.java_websocket.framing.CloseFrame;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * The one server: every agent on this machine is connected to it. It has one port, on the loopback
 * address ({@link ExtensionServer}): the extension pairs there once, and the processes that agents'
 * programs start ({@link Link}) connect there too, on the path {@code /link}. Each process proves
 * that it knows the pairing token, the server proves the same in return, and the server then
 * serves that agent: its conversation, by MCP or by the command line's own messages, its tools,
 * and its view of the extension ({@link Agent}).
 *
 * <p>The agents share the process and the connection to the browser, and nothing else: each has
 * its own sessions and its own times, and no tool tells one agent anything of another. What is
 * one for all is what the user has: the window, the log in it, and Stop.
 *
 * <p>It ends when its last agent has gone, or when the user stops it. A server that the user
 * started stays until it is stopped.
 */
final class Hub implements ExtensionServer.Links {

    /** The reason a process is given when the user's settings have its interface off. */
    static final String INTERFACE_NOT_ALLOWED = "interface_not_allowed";
    /** How many MCP starts were turned away since this server started, because MCP is off: for the window. */
    private final java.util.concurrent.atomic.AtomicInteger turnedAway = new java.util.concurrent.atomic.AtomicInteger();

    /** Longest message a process may send before it has proven itself. */
    private static final int MAX_HANDSHAKE_BYTES = 4096;
    /** How long a process has to prove itself after it connected. */
    private static final long HANDSHAKE_MS = 5_000;
    /** Failed proofs within a minute before nothing new is listened to for a while. */
    private static final int MAX_FAILED_PROOFS = 10;
    private static final long LOCKOUT_MS = 60_000;
    /** How long the server waits for an agent after its last one has gone, before it ends. */
    static final long EMPTY_FOR_MS = 3_000;
    private volatile long emptyFor = EMPTY_FOR_MS;
    /**
     * How long an agent that comes by commands is kept after its last command has left: its view of
     * the browser stays for the next command, with the tabs the extension reports for it.
     */
    static final long COMMAND_IDLE_MS = 10 * 60_000;
    private volatile long commandIdle = COMMAND_IDLE_MS;

    /** One connection of an agent's process, and the way it is written to. */
    private static final class Conn {
        private final WebSocket socket;
        private final LineOut out;
        private final AtomicBoolean gone = new AtomicBoolean();
        /** The server's nonce of the handshake, until the process has proven itself. */
        private final String nonce = Pairing.randomHex(16);
        private volatile boolean proven;
        /** The agent's messages, as the agent's conversation reads them: a message is a line there. */
        private volatile PipedOutputStream toAgent;
        /** The conversation of one command; null for the one connection of an agent that stays connected. */
        private volatile Commands talk;
        /** The agent this connection belongs to, once it is served. */
        private volatile Member member;

        private Conn(WebSocket socket) {
            this.socket = socket;
            this.out = new LineOut(socket);
        }
    }

    /**
     * One agent of the server, and the connections of its processes: one for an agent whose program
     * stays connected, and one for each command that is running for an agent that comes by commands.
     */
    static final class Member {
        private final List<Conn> links = new CopyOnWriteArrayList<>();
        private final AtomicBoolean gone = new AtomicBoolean();
        private volatile Agent agent;
        /** The id this agent has by its key, which no other has while it is here; null for an id of this start. */
        private volatile String byKey;
        /** For an agent that comes by commands: when its last command left, or 0 while one is running. */
        private volatile long idleSince;

        private Member() {
        }

        private Member(Conn conn) {
            links.add(conn);
        }

        Agent agent() {
            return agent;
        }
    }

    /**
     * Writes whole lines to a link, one message each. The MCP conversation and what the server says
     * to the link itself go down the same connection: a line of the one never lands inside a line of
     * the other.
     */
    static final class LineOut extends OutputStream {
        private final WebSocket to;
        private final ByteArrayOutputStream line = new ByteArrayOutputStream();

        LineOut(WebSocket to) {
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
            String text = line.toString(StandardCharsets.UTF_8);
            line.reset();
            // The line's end is the frame's end.
            text = text.endsWith("\n") ? text.substring(0, text.length() - 1) : text;
            try {
                to.send(text);
            } catch (WebsocketNotConnectedException | IllegalArgumentException e) {
                throw new IOException("the link is gone", e);
            }
        }

        /** A line for the link itself: what kind it is, and a text. Never thrown from: a link that is gone is found gone elsewhere. */
        void control(String kind, String text, ObjectMapper json) {
            ObjectNode msg = json.createObjectNode();
            msg.put("tabgoblin", kind);
            if (text != null) {
                msg.put("text", text);
            }
            try {
                to.send(json.writeValueAsString(msg));
            } catch (RuntimeException e) {
                // gone
            }
        }
    }

    private final Agent.Settings settings;
    private final ExtensionServer server;
    private final ObjectMapper json = new ObjectMapper();
    private final List<Member> members = new CopyOnWriteArrayList<>();
    private final Deque<Long> failedProofs = new ArrayDeque<>();
    /** The ids of the agents that are here by a key: a key has one agent at a time. */
    private final Set<String> present = ConcurrentHashMap.newKeySet();
    /**
     * The agents that come by commands, by the id of their key. Each is the one agent of its key,
     * as any other: its commands are processes that proved that key, one after another or several
     * at once, and they have the one agent's sessions. Guards itself.
     */
    private final java.util.Map<String, Member> commanded = new java.util.HashMap<>();
    /** The connections of processes, by their socket. */
    private final java.util.Map<WebSocket, Conn> conns = new ConcurrentHashMap<>();
    /** Said by {@link #identify} to a command whose key an agent holds that stays connected. */
    private static final AgentKeys.Identity IN_USE = new AgentKeys.Identity("", null, false, () -> false);
    private final BiConsumer<String, String> logTo = this::passOn;
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "tabgoblin-hub-timer");
        t.setDaemon(true);
        return t;
    });
    private volatile boolean standing;
    private volatile boolean stopping;
    private volatile boolean closed;
    private volatile long emptySince = System.currentTimeMillis();
    /** Shows the server's window; run when a link asks for it, or when the browser has to be paired. */
    private volatile Runnable window = () -> { };
    /** Whether the window is there: a server without a display has none, whoever asks. */
    private volatile java.util.function.BooleanSupplier windowUp = () -> false;
    /** The window came up by itself for a pairing, and nothing has been paired since. */
    private final AtomicBoolean cameUp = new AtomicBoolean();
    /** Run when the last agent has gone and stayed gone, unless the user started this server. */
    private volatile Runnable whenEmpty = () -> { };

    private Hub(Agent.Settings settings, ExtensionServer server, boolean standing) {
        this.settings = settings;
        this.server = server;
        this.standing = standing;
    }

    /**
     * Begins to listen on the one port: for the extension, and for the agents' processes.
     *
     * @param standing the user started this server: it stays when no agent is connected
     * @throws IOException if the port is taken: there is a server already, or another program has it
     */
    static Hub open(Agent.Settings settings, boolean standing) throws IOException {
        ExtensionServer server = new ExtensionServer(settings.port(), settings.token(), settings.extensionOrigin());
        server.blockedSites(settings.blocked());
        Hub hub = new Hub(settings, server, standing);
        server.links(hub);
        try {
            server.startAndWait();
        } catch (Exception e) {
            try {
                server.stop(100);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
            throw e instanceof IOException io ? io : new IOException("port " + settings.port() + " could not be listened on", e);
        }
        Log.written(hub.logTo);
        Log.info("server listening port=" + server.getPort());
        return hub;
    }

    int port() {
        return server.getPort();
    }

    /** The server's one connection to the browser, which every agent's view is of. */
    ExtensionServer server() {
        return server;
    }

    /** The agents that are connected, in the order they came. */
    List<Agent> agents() {
        return members.stream().map(Member::agent).filter(java.util.Objects::nonNull).toList();
    }

    boolean standing() {
        return standing;
    }

    /** How many MCP starts this server turned away because MCP is off by the settings. */
    int turnedAway() {
        return turnedAway.get();
    }

    boolean held() {
        return server.isHeld();
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
     * Asked when a tool of one agent finds no browser: what the server knows of it. If a browser
     * came with a token that is not the server's, the user has to paste the token: the window,
     * where it is copied, comes up by itself, once until something is paired. Where no browser has
     * come at all, none does: a paired extension is on its way as a rule.
     *
     * @param quiet the agent's process was started with --no-panel: no window comes up for it
     */
    BrowserService.Unpaired unpaired(boolean quiet) {
        // Paired on the token as it is now: after a new token the old pairing is still open for a moment.
        if (server.pairedOnCurrentToken()) {
            cameUp.set(false);
            return new BrowserService.Unpaired(true, false, windowUp.getAsBoolean());
        }
        boolean refused = server.lastCloseCode() == Protocol.CLOSE_UNAUTHORIZED;
        if (refused && !quiet && !server.isHeld() && cameUp.compareAndSet(false, true)) {
            Log.info("window asked for reason=browser_has_another_token");
            window.run();
        }
        return new BrowserService.Unpaired(false, refused, windowUp.getAsBoolean());
    }

    /** Whether the browser is connected to this server. */
    boolean hasBrowser() {
        return server.isConnected();
    }

    /** Shows the server's window, or brings it up if it is there already. */
    void showWindow() {
        window.run();
    }

    void whenEmpty(Runnable end) {
        this.whenEmpty = end;
    }

    /**
     * Switches the connection to the browser off or on, for the panel. Off closes the connection
     * and takes no new one; the agents' tools say so. On lets the extension pair again.
     */
    void setHeld(boolean off) {
        server.setHeld(off);
    }

    /** Serves until the server is closed: watches for the last agent to go, and lets idle agents of the command line go. */
    void serve() {
        watchEmptiness();
    }

    // ---------------------------------------------------------------- the links

    @Override
    public void opened(WebSocket socket) {
        if (lockedOut()) {
            Log.warn("link rejected reason=lockout");
            socket.close(CloseFrame.POLICY_VALIDATION, "lockout");
            return;
        }
        Conn conn = new Conn(socket);
        conns.put(socket, conn);
        ObjectNode hello = json.createObjectNode();
        hello.put("type", "hello");
        hello.put("nonce", conn.nonce);
        hello.put("link", Link.VERSION);
        try {
            socket.send(json.writeValueAsString(hello));
        } catch (RuntimeException e) {
            conns.remove(socket);
            return;
        }
        timer.schedule(() -> {
            if (!conn.proven && socket.isOpen()) {
                socket.close(CloseFrame.POLICY_VALIDATION, "no proof in time");
            }
        }, HANDSHAKE_MS, TimeUnit.MILLISECONDS);
    }

    @Override
    public void message(WebSocket socket, String text) {
        Conn conn = conns.get(socket);
        if (conn == null) {
            socket.close(CloseFrame.POLICY_VALIDATION, "unknown link");
            return;
        }
        if (conn.proven) {
            // The agent's own message: a line of its conversation.
            PipedOutputStream toAgent = conn.toAgent;
            if (toAgent == null) {
                return;
            }
            try {
                toAgent.write((text + "\n").getBytes(StandardCharsets.UTF_8));
                toAgent.flush();
            } catch (IOException e) {
                // The agent's side has ended: the connection is on its way out.
            }
            return;
        }
        if (text.length() > MAX_HANDSHAKE_BYTES) {
            socket.close(CloseFrame.TOOBIG, "handshake too long");
            return;
        }
        welcome(conn, text);
    }

    @Override
    public void closed(WebSocket socket, int code) {
        Conn conn = conns.remove(socket);
        if (conn == null) {
            return;
        }
        PipedOutputStream toAgent = conn.toAgent;
        if (toAgent != null) {
            try {
                // The agent's conversation reads the end of its input: that is the agent's going.
                toAgent.close();
            } catch (IOException e) {
                // closing anyway
            }
        }
        Member member = conn.member;
        if (member != null && conn.talk != null) {
            commandLeft(member, conn);
        }
    }

    /** The first exchange with a process that connected: proofs both ways, and what it wants. */
    private void welcome(Conn conn, String text) {
        WebSocket socket = conn.socket;
        boolean kept = false;
        Member joining = null;
        String byKey = null;
        String commandOf = null;
        try {
            JsonNode ask = json.readTree(text);
            String type = ask.path("type").asString("");
            String linkNonce = ask.path("nonce").asString("");
            String current = settings.token().get();
            boolean proven = (type.equals("attach") || type.equals("show") || type.equals("turned_away"))
                    && linkNonce.length() >= 16 && linkNonce.length() <= 128
                    && Pairing.constantTimeEquals(ask.path("proof").asString(""), Pairing.linkProof(current, conn.nonce, linkNonce));
            if (!proven) {
                noteFailedProof();
                Log.warn("link rejected reason=proof");
                refuse(socket, "proof");
                return;
            }
            if (ask.path("link").asInt(0) != Link.VERSION) {
                Log.warn("link rejected reason=version peer=" + ask.path("link").asInt(0));
                refuse(socket, "link_of_another_version");
                return;
            }
            if (stopping) {
                refuse(socket, "server_stopping");
                return;
            }
            ObjectNode answer = json.createObjectNode();
            answer.put("proof", Pairing.hubProof(current, conn.nonce, linkNonce));
            if (type.equals("show")) {
                // The user ran the command for the window: it is theirs to close, so the server stays for them.
                standing = true;
                window.run();
                answer.put("type", "shown");
                socket.send(json.writeValueAsString(answer));
                return;
            }
            boolean command = ask.path("cli").asBoolean(false);
            BlockedSites.Rule policy = settings.blocked().get();
            boolean off = !policy.everything() && !policy.limits().allows(command);
            if (type.equals("turned_away")) {
                // An MCP start that found MCP off before it reached this server: counted while MCP is off here too,
                // so that the window can say how many were turned away. Nothing of the agent's follows.
                if (off) {
                    turnedAway.incrementAndGet();
                }
                answer.put("type", "counted");
                socket.send(json.writeValueAsString(answer));
                return;
            }
            if (off) {
                // The user's settings have this interface off: said in the window, and the process is told why.
                if (!command) {
                    turnedAway.incrementAndGet();
                }
                Log.warn("link refused reason=" + INTERFACE_NOT_ALLOWED + " interface=" + (command ? "cli" : "mcp"));
                refuse(socket, INTERFACE_NOT_ALLOWED);
                return;
            }
            AgentKeys.Identity identity = identify(ask, conn.nonce, linkNonce, command);
            if (identity == null) {
                noteFailedProof();
                Log.warn("link rejected reason=agent_proof");
                refuse(socket, "agent_proof");
                return;
            }
            if (identity == IN_USE) {
                Log.warn("command refused reason=agent_in_use");
                refuse(socket, "agent_in_use");
                return;
            }
            commandOf = command && identity.persistent() ? identity.id() : null;
            answer.put("type", "attached");
            // The agent's conversation reads its input from here: a pipe that the connection's messages are lines of.
            PipedOutputStream toAgent = new PipedOutputStream();
            PipedInputStream fromLink = new PipedInputStream(toAgent, 1 << 16);
            conn.toAgent = toAgent;
            conn.proven = true;
            socket.send(json.writeValueAsString(answer));
            if (ask.path("panel").asBoolean(false)) {
                window.run();
            }
            boolean quiet = ask.path("quiet").asBoolean(false);
            if (commandOf != null) {
                // The key's agent is taken from here on by the list of those that come by commands.
                serveCommand(identity, conn, fromLink, quiet);
                kept = true;
                return;
            }
            byKey = identity.persistent() ? identity.id() : null;
            Member member = new Member(conn);
            conn.member = member;
            // In the list before it is served: its first lines in the log are passed on to it.
            joining = member;
            member.byKey = byKey;
            members.add(member);
            emptySince = 0;
            if (command) {
                // A command of a name that has no agent to keep (the user revoked it): served once, by the
                // command line's own conversation, on an agent that goes with it. Every tool says why.
                member.agent = Agent.open(settings, server, () -> unpaired(quiet), identity, true);
                member.agent.announce();
                // One whose key could not be read or made has no label: it is not called "null".
                String called = identity.label() == null ? "command line" : identity.label() + " (command line)";
                conn.talk = Commands.serve(member.agent.service(), fromLink, conn.out, called, () -> left(member));
                kept = true;
                return;
            }
            member.agent = Agent.serve(settings, server, fromLink, conn.out, () -> left(member), () -> unpaired(quiet), identity);
            member.agent.announce();
            kept = true;
        } catch (IOException | RuntimeException e) {
            // Not a link, or one that went away at once.
        } finally {
            if (!kept) {
                if (byKey != null) {
                    present.remove(byKey);
                }
                if (commandOf != null) {
                    // A first command that did not get as far as its agent leaves the key free again.
                    synchronized (commanded) {
                        if (!commanded.containsKey(commandOf)) {
                            present.remove(commandOf);
                        }
                    }
                }
                conns.remove(socket);
                closeSocket(socket);
                // One that was taken into the list and could not be served is not kept there: a server
                // that counts an agent it does not have never ends.
                if (joining != null && members.remove(joining) && members.isEmpty()) {
                    emptySince = System.currentTimeMillis();
                }
            }
        }
    }

    /**
     * Who the agent of a process is. A process that names a label has to prove that it holds the
     * label's key, and is then the agent that the key says, at every start. One that names none
     * has an id for this start. Null for a label that is none, or a proof that is none.
     *
     * <p>A label the user revoked is served without a key: every tool then says that it is
     * revoked. And of two processes that hold the same key at once, the second has an id for
     * this start: a tab has one agent, and the first is the one that has the key's tabs.
     */
    private AgentKeys.Identity identify(JsonNode ask, String nonce, String linkNonce, boolean command) {
        Path keys = settings.agentKeys();
        if (!ask.hasNonNull("agent") || keys == null) {
            return AgentKeys.Identity.ephemeral();
        }
        String label = AgentKeys.label(ask.path("agent").asString(""));
        if (label == null) {
            return null;
        }
        if (AgentKeys.revoked(keys, label)) {
            Log.warn("agent revoked label=" + label);
            return AgentKeys.Identity.revoked(keys, label);
        }
        String key = AgentKeys.read(keys, label);
        if (key.isEmpty()
                || !Pairing.constantTimeEquals(ask.path("agentProof").asString(""), AgentKeys.proof(key, nonce, linkNonce))) {
            return null;
        }
        String id = AgentKeys.idOf(key);
        if (command) {
            synchronized (commanded) {
                // The agent of this key comes by commands and is here: this command is one more of its own.
                if (commanded.containsKey(id)) {
                    return new AgentKeys.Identity(id, label, true, () -> AgentKeys.revoked(keys, label));
                }
            }
        }
        // An agent that is started again may be here before its former process has been let go: that
        // is given a moment, so that the agent is itself again and not taken for a second one.
        boolean free = present.add(id);
        for (int i = 0; !free && i < 20; i++) {
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
            free = present.add(id);
        }
        if (!free && command) {
            return IN_USE;
        }
        if (!free) {
            Log.warn("agent label=" + label + " is connected already: this one has an id for this start only");
            return new AgentKeys.Identity(id + "~" + Pairing.randomHex(2), label, false, () -> AgentKeys.revoked(keys, label));
        }
        return new AgentKeys.Identity(id, label, true, () -> AgentKeys.revoked(keys, label));
    }

    /**
     * One command of an agent that comes by commands. The agent is made at its first command and
     * stays between them, with its view of the browser; a command is one conversation of the
     * command line's own with it ({@link Commands}), and ends with its process.
     */
    private void serveCommand(AgentKeys.Identity identity, Conn conn, PipedInputStream fromLink, boolean quiet) {
        Member member;
        synchronized (commanded) {
            member = commanded.get(identity.id());
            if (member == null) {
                // The first of its commands: the key's id is among those present from here on.
                present.add(identity.id());
                member = new Member();
                member.byKey = identity.id();
                members.add(member);
                emptySince = 0;
                member.agent = Agent.open(settings, server, () -> unpaired(quiet), identity, true);
                member.agent.announce();
                commanded.put(identity.id(), member);
            }
            member.links.add(conn);
            member.idleSince = 0;
        }
        conn.member = member;
        Member its = member;
        try {
            conn.talk = Commands.serve(member.agent.service(), fromLink, conn.out, identity.label() + " (command line)",
                    () -> commandLeft(its, conn));
        } catch (RuntimeException e) {
            commandLeft(its, conn);
            throw e;
        }
        if (conn.gone.get()) {
            closeTalk(conn);
        }
    }

    /** A command's process has gone. Its conversation ends; the agent stays for the next one. */
    private void commandLeft(Member member, Conn conn) {
        if (!conn.gone.compareAndSet(false, true)) {
            return;
        }
        Thread ending = new Thread(() -> {
            closeTalk(conn);
            closeSocket(conn.socket);
            synchronized (commanded) {
                member.links.remove(conn);
                if (member.links.isEmpty()) {
                    member.idleSince = System.currentTimeMillis();
                }
            }
        }, "tabgoblin-hub-command-left");
        ending.setDaemon(true);
        ending.start();
    }

    private static void closeTalk(Conn conn) {
        Commands talk = conn.talk;
        if (talk != null) {
            talk.close();
        }
    }

    /** Lets go of the agents that come by commands and have had none for a while. */
    private void letIdleGo() {
        // All of it at once: a command that comes meanwhile finds its agent either here or gone, and its key free.
        synchronized (commanded) {
            long now = System.currentTimeMillis();
            for (var it = commanded.values().iterator(); it.hasNext();) {
                Member member = it.next();
                if (!member.links.isEmpty() || member.idleSince == 0 || now - member.idleSince < commandIdle) {
                    continue;
                }
                it.remove();
                Agent agent = member.agent;
                Log.of(agent.bridge().clientId()).info("agent left reason=no_command_for_a_while client=" + agent.bridge().clientId());
                agent.close();
                present.remove(member.byKey);
                members.remove(member);
                if (members.isEmpty()) {
                    emptySince = System.currentTimeMillis();
                }
            }
        }
    }

    private void refuse(WebSocket to, String reason) {
        ObjectNode no = json.createObjectNode();
        no.put("type", "refused");
        no.put("reason", reason);
        try {
            to.send(json.writeValueAsString(no));
        } catch (RuntimeException e) {
            // gone
        }
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
            if (member.byKey != null) {
                present.remove(member.byKey);
            }
            members.remove(member);
            member.links.forEach(conn -> closeSocket(conn.socket));
            if (members.isEmpty()) {
                emptySince = System.currentTimeMillis();
            }
        }, "tabgoblin-hub-left");
        ending.setDaemon(true);
        ending.start();
    }

    /** Ends the server when its last agent has gone and none has come since, unless the user started it. */
    private void watchEmptiness() {
        while (!closed) {
            try {
                Thread.sleep(250);
            } catch (InterruptedException e) {
                return;
            }
            letIdleGo();
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
                member.links.forEach(conn -> conn.out.control("log", message, json));
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
            member.links.forEach(conn -> conn.out.control("stopping", null, json));
        }
        for (Member member : members) {
            Agent agent = member.agent;
            member.links.forEach(Hub::closeTalk);
            if (agent != null) {
                agent.close();
            }
            member.links.forEach(conn -> closeSocket(conn.socket));
        }
        members.clear();
        end();
    }

    private void end() {
        closed = true;
        timer.shutdownNow();
        try {
            server.stop(1000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (RuntimeException e) {
            // ending anyway
        }
    }

    private static void closeSocket(WebSocket socket) {
        try {
            if (socket.isOpen()) {
                socket.close(CloseFrame.NORMAL, "");
            }
        } catch (RuntimeException e) {
            // closing anyway
        }
    }

    /** For tests: whether the port is still listened on. */
    boolean open() {
        return !closed;
    }

    /** How long an agent that comes by commands is kept without one, where it is not {@link #COMMAND_IDLE_MS}. */
    void commandIdle(long ms) {
        commandIdle = ms;
    }

    /** For tests: a shorter wait for an agent after the last one has gone. */
    void emptyFor(long ms) {
        emptyFor = ms;
    }

    /**
     * For tests: ends as a process that is killed ends, without a word to anyone. The links find
     * their connections gone, and the extension its socket.
     */
    void drop() {
        stopping = true;
        Log.unwritten(logTo);
        for (Member member : members) {
            Agent agent = member.agent;
            if (agent != null) {
                agent.close();
            }
        }
        members.clear();
        end();
    }
}
