package tabgoblin;

import io.modelcontextprotocol.json.McpJsonDefaults;
import io.modelcontextprotocol.json.McpJsonMapper;
import io.modelcontextprotocol.server.McpServer;
import io.modelcontextprotocol.server.McpSyncServer;
import io.modelcontextprotocol.server.transport.StdioServerTransportProvider;
import io.modelcontextprotocol.spec.McpSchema;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.function.Supplier;

/**
 * One agent as a server holds it: the MCP conversation with it, its tools, and its own view of the
 * server's connection to the extension. The one server has one of these for each agent that is
 * connected to it; a process that serves its agent alone has one.
 *
 * <p>Nothing here is shared between agents: an agent's sessions, its times and its tool calls are
 * its own, as they were when each agent had a process of its own.
 */
final class Agent {

    /**
     * What every agent of a server has in common: the server's port, the pairing token, and whose
     * extension may connect.
     *
     * @param agentKeys the folder of the agents' keys, or null where agents are not told apart by a key
     */
    record Settings(int port, Supplier<String> token, String extensionOrigin, Supplier<BlockedSites.Rule> blocked,
            java.nio.file.Path agentKeys) {
        /** With no site blocked. */
        Settings(int port, Supplier<String> token, String extensionOrigin) {
            this(port, token, extensionOrigin, () -> BlockedSites.Rule.NONE);
        }

        /** The same, on another port: where a server found one the system gives out. */
        Settings withPort(int port) {
            return new Settings(port, token, extensionOrigin, blocked, agentKeys);
        }

        /** Without keys for agents: each agent has an id for this start only. */
        Settings(int port, Supplier<String> token, String extensionOrigin, Supplier<BlockedSites.Rule> blocked) {
            this(port, token, extensionOrigin, blocked, null);
        }
    }

    private final WebSocketBridge bridge;
    private final BrowserService service;
    private final String startupProblem;
    /** The same for the log, in one short line: the window has the whole of it above. */
    private final String startupLogged;
    /** The conversation this agent was begun with; null for an agent that comes by commands, each with a conversation of its own. */
    private volatile McpSyncServer mcp;

    private Agent(WebSocketBridge bridge, String startupProblem, String startupLogged, BrowserService service, McpSyncServer mcp) {
        this.bridge = bridge;
        this.startupProblem = startupProblem;
        this.startupLogged = startupLogged;
        this.service = service;
        this.mcp = mcp;
    }

    /**
     * Begins to serve one agent on the server's connection to the extension; the MCP conversation
     * is read from {@code in} and answered on {@code out}.
     *
     * @param server     the server's one connection, or null where this process could get no port
     * @param onInputEnd run once when {@code in} ends: the agent has gone
     * @param unpaired   asked when a tool finds no browser: what is known of the browser. Whoever
     *                   answers may bring the server's window up
     * @param identity   who this agent is: the id of its key, proven before this is called, or an id for this start
     */
    static Agent serve(Settings settings, ExtensionServer server, InputStream in, OutputStream out, Runnable onInputEnd,
            Supplier<BrowserService.Unpaired> unpaired, AgentKeys.Identity identity) {
        Agent agent = open(settings, server, unpaired, identity, false);
        agent.mcp = agent.converse(in, out, onInputEnd);
        return agent;
    }

    /**
     * An agent with its view of the extension and its tools, and no conversation yet. For an agent
     * that comes by commands ({@link Cli}) each command is a conversation of its own
     * ({@link Commands}), and the agent stays between them.
     *
     * @param byCommands the agent comes by commands of the command line, and not by MCP
     */
    static Agent open(Settings settings, ExtensionServer server, Supplier<BrowserService.Unpaired> unpaired,
            AgentKeys.Identity identity, boolean byCommands) {
        WebSocketBridge bridge = new WebSocketBridge(server, identity.id());
        String startupProblem = null;
        String startupLogged = null;
        if (server == null) {
            boolean answering = answering(settings.port());
            startupProblem = noPort(settings.port(), answering);
            startupLogged = noPortLogged(settings.port(), answering);
        }
        BrowserService service = new BrowserService(bridge, startupProblem, unpaired, identity, byCommands);
        return new Agent(bridge, startupProblem, startupLogged, service, null);
    }

    /**
     * One MCP conversation with this agent, read from {@code in} and answered on {@code out}. The
     * tools are this agent's, whichever conversation calls them.
     *
     * @param onInputEnd run once when {@code in} ends
     */
    McpSyncServer converse(InputStream in, OutputStream out, Runnable onInputEnd) {
        McpJsonMapper mapper = McpJsonDefaults.getMapper();
        // An agent's name is taken from its opening message: a server that was started again is
        // given its tabs back by that name, and should not have to wait for a tool call to have it.
        // And the input's end is the agent's going, also where the SDK does not say so.
        StdinTap tap = new StdinTap(in, onInputEnd, service::noteClient, Log.of(bridge.clientId()));
        return McpServer.sync(new StdioServerTransportProvider(mapper, tap, out))
                .serverInfo(McpMain.identity())
                .instructions(McpMain.INSTRUCTIONS)
                .capabilities(McpSchema.ServerCapabilities.builder().tools(false).build())
                .tools(McpMain.toolSpecs(service, mapper, tap))
                .build();
    }

    /**
     * Whether something listens on the port: a connection to it is taken. A port that could not be
     * listened on and that nothing answers on is not held by a program: the system keeps it back.
     * The error of the failed listening does not say which it is; on Windows it says "in use" for
     * both.
     */
    static boolean answering(int port) {
        try (java.net.Socket probe = new java.net.Socket()) {
            probe.connect(new java.net.InetSocketAddress(java.net.InetAddress.getByAddress(new byte[] {127, 0, 0, 1}), port), 300);
            return true;
        } catch (java.io.IOException e) {
            return false;
        }
    }

    /**
     * Why this process has no port, as it is said to the agent, in the log and in the window.
     *
     * @param answering whether something listens on the port
     */
    static String noPort(int port, boolean answering) {
        String could = "Could not listen on port " + port + " on 127.0.0.1: ";
        String other = "Start the server with --port and a port that is free, and set the same port in the extension's "
                + "popup under Connection.";
        if (answering) {
            return could + "it is taken by a program that is not a TabGoblin server. Close that program, or: " + other;
        }
        return could + "the system does not give it out. On Windows, a range of ports can be kept back for the system's "
                + "own networking, as Hyper-V, WSL and Docker have it done; \"netsh interface ipv4 show excludedportrange "
                + "protocol=tcp\" lists the ranges. " + other;
    }

    /** The same in the log's own form: what, the port, and the reason in a word. */
    static String noPortLogged(int port, boolean answering) {
        return "no port to listen on port=" + port + " reason=" + (answering ? "taken" : "kept_back_by_the_system");
    }

    /**
     * Says in the log that this agent is served, or why it has no browser. Said by the one who
     * serves it, once it holds the agent: the line is the agent's, and goes to the agent's log.
     */
    void announce() {
        if (startupProblem == null) {
            Log.of(bridge.clientId()).info("serving client=" + bridge.clientId() + " port=" + bridge.getPort());
        } else {
            Log.of(bridge.clientId()).warn(startupLogged);
        }
    }

    WebSocketBridge bridge() {
        return bridge;
    }

    BrowserService service() {
        return service;
    }

    /** Why this process has no port to the extension, or null when it has one. */
    String startupProblem() {
        return startupProblem;
    }

    /**
     * Ends this agent's part in order: the MCP conversation first, so that nothing new is taken on,
     * then its place among the server's agents, which tells the extension that this agent is going
     * away instead of leaving it to find out.
     */
    void close() {
        McpSyncServer own = mcp;
        if (own != null) {
            try {
                own.closeGracefully();
            } catch (RuntimeException e) {
                // ending anyway
            }
        }
        try {
            bridge.close();
        } catch (RuntimeException e) {
            // ending anyway
        }
    }
}
