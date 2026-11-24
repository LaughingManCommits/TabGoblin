package browsercontext;

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
 * One agent as a server holds it: the MCP conversation with it, its tools, and its own connection
 * to the extension on a port of its own. The one server has one of these for each agent that is
 * connected to it; a process that serves its agent alone has one.
 *
 * <p>Nothing here is shared between agents: an agent's sessions, its times and its tool calls are
 * its own, as they were when each agent had a process of its own.
 */
final class Agent {

    /** What every agent of a server has in common: where the ports begin, the pairing token, and whose extension may connect. */
    /**
     * @param agentKeys the folder of the agents' keys, or null where agents are not told apart by a key
     */
    record Settings(int port, Supplier<String> token, String extensionOrigin, Supplier<BlockedSites.Rule> blocked,
            java.nio.file.Path agentKeys) {
        /** With no site blocked. */
        Settings(int port, Supplier<String> token, String extensionOrigin) {
            this(port, token, extensionOrigin, () -> BlockedSites.Rule.NONE);
        }

        /** The same, with the ports beginning elsewhere: where a server found a range the system gives out. */
        Settings withPort(int first) {
            return new Settings(first, token, extensionOrigin, blocked, agentKeys);
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
    private final boolean listening;
    private final McpSyncServer mcp;

    private Agent(WebSocketBridge bridge, String startupProblem, String startupLogged, boolean listening, BrowserService service,
            McpSyncServer mcp) {
        this.bridge = bridge;
        this.startupProblem = startupProblem;
        this.startupLogged = startupLogged;
        this.listening = listening;
        this.service = service;
        this.mcp = mcp;
    }

    /**
     * Begins to serve one agent. Its connection to the extension takes the first free port from
     * the settings' port up; the MCP conversation is read from {@code in} and answered on
     * {@code out}.
     *
     * @param onInputEnd run once when {@code in} ends: the agent has gone
     * @param held       the user has the connection to the browser switched off in the server's window
     */
    static Agent serve(Settings settings, InputStream in, OutputStream out, Runnable onInputEnd, boolean held) {
        return serve(settings, in, out, onInputEnd, held, () -> BrowserService.Unpaired.NOTHING_KNOWN);
    }

    /**
     * @param unpaired asked when a tool finds no browser on this agent's connection: what is known of
     *                 the browser. Whoever answers may bring the server's window up.
     */
    static Agent serve(Settings settings, InputStream in, OutputStream out, Runnable onInputEnd, boolean held,
            Supplier<BrowserService.Unpaired> unpaired) {
        return serve(settings, in, out, onInputEnd, held, unpaired, AgentKeys.Identity.ephemeral());
    }

    /**
     * @param identity who this agent is: the id of its key, proven before this is called, or an id for this start
     */
    static Agent serve(Settings settings, InputStream in, OutputStream out, Runnable onInputEnd, boolean held,
            Supplier<BrowserService.Unpaired> unpaired, AgentKeys.Identity identity) {
        WebSocketBridge bridge = null;
        String startupProblem = null;
        String startupLogged = null;
        for (int candidate = settings.port(); candidate < settings.port() + McpMain.PORT_RANGE && bridge == null; candidate++) {
            WebSocketBridge attempt = new WebSocketBridge(candidate, settings.token(), settings.extensionOrigin(), identity.id());
            try {
                attempt.startAndWait();
                bridge = attempt;
            } catch (Exception e) {
                // Port taken, by another agent or by another program: try the next one.
            }
        }
        boolean listening = bridge != null;
        if (!listening) {
            bridge = new WebSocketBridge(settings.port(), settings.token(), settings.extensionOrigin(), identity.id());
            int answering = answering(settings.port());
            startupProblem = noPort(settings.port(), answering);
            startupLogged = noPortLogged(settings.port(), answering);
        }
        if (held) {
            bridge.setHeld(true);
        }
        bridge.blockedSites(settings.blocked());
        BrowserService service = new BrowserService(bridge, startupProblem, unpaired, identity);
        McpJsonMapper mapper = McpJsonDefaults.getMapper();
        // An agent's name is taken from its opening message: a server that was started again is
        // given its tabs back by that name, and should not have to wait for a tool call to have it.
        // And the input's end is the agent's going, also where the SDK does not say so.
        StdinTap tap = new StdinTap(in, onInputEnd, service::noteClient, Log.of(bridge.clientId()));
        McpSyncServer mcp = McpServer.sync(new StdioServerTransportProvider(mapper, tap, out))
                .serverInfo(McpMain.identity())
                .instructions(McpMain.INSTRUCTIONS)
                .capabilities(McpSchema.ServerCapabilities.builder().tools(false).build())
                .tools(McpMain.toolSpecs(service, mapper, tap))
                .build();
        return new Agent(bridge, startupProblem, startupLogged, listening, service, mcp);
    }

    /**
     * How many of the ports from {@code first} on have something listening: a connection to it is
     * taken. A port that could not be listened on and that nothing answers on is not held by a
     * program: the system keeps it back. The error of the failed listening does not say which it
     * is; on Windows it says "in use" for both.
     */
    static int answering(int first) {
        int answering = 0;
        for (int port = first; port < first + McpMain.PORT_RANGE; port++) {
            try (java.net.Socket probe = new java.net.Socket()) {
                probe.connect(new java.net.InetSocketAddress(java.net.InetAddress.getByAddress(new byte[] {127, 0, 0, 1}), port), 300);
                answering++;
            } catch (java.io.IOException e) {
                // nobody there
            }
        }
        return answering;
    }

    /**
     * Why this agent has no port, as it is said to the agent, in the log and in the window.
     *
     * @param answering how many of the ports have something listening on them
     */
    static String noPort(int first, int answering) {
        int last = first + McpMain.PORT_RANGE - 1;
        String could = "Could not listen on any of ports " + first + "-" + last + " on 127.0.0.1: ";
        String other = "Start the server with --port and a port that is free, and set the same first port in the "
                + "extension's popup under Connection.";
        if (answering >= McpMain.PORT_RANGE) {
            return could + "all of them are taken, by TabGoblin servers or by other programs. Close agents that are "
                    + "not used, or: " + other;
        }
        String kept = "the system does not give them out. On Windows, a range of ports can be kept back for the "
                + "system's own networking, as Hyper-V, WSL and Docker have it done; "
                + "\"netsh interface ipv4 show excludedportrange protocol=tcp\" lists the ranges. " + other;
        if (answering == 0) {
            return could + "no program is listening on them, and " + kept;
        }
        return could + answering + " of them are taken by programs, and of the rest " + kept;
    }

    /** The same in the log's own form: what, the ports, how many are taken, and the reason in a word. */
    static String noPortLogged(int first, int answering) {
        String reason = answering >= McpMain.PORT_RANGE ? "all_taken" : answering == 0 ? "kept_back_by_the_system" : "taken_or_kept_back";
        return "no port to listen on ports=" + first + "-" + (first + McpMain.PORT_RANGE - 1) + " taken=" + answering + " reason=" + reason;
    }

    /**
     * Says in the log that this agent is served, and on which port, or why it has none. Said by the
     * one who serves it, once it holds the agent: the line is the agent's, and goes to the agent's log.
     */
    void announce() {
        if (listening) {
            Log.of(bridge.clientId()).info("listening port=" + bridge.getPort() + " client=" + bridge.clientId());
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

    /** Why this agent has no port to the extension, or null when it has one. */
    String startupProblem() {
        return startupProblem;
    }

    /**
     * Ends this agent's part in order: the MCP conversation first, so that nothing new is taken on,
     * then its socket, which tells the extension that this agent is going away instead of leaving
     * it to find the connection gone.
     */
    void close() {
        try {
            mcp.closeGracefully();
        } catch (RuntimeException e) {
            // ending anyway
        }
        if (listening) {
            try {
                bridge.stop(1000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } catch (RuntimeException e) {
                // ending anyway
            }
        }
    }
}
