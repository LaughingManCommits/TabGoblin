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
    record Settings(int port, Supplier<String> token, String extensionOrigin, Supplier<BlockedSites.Rule> blocked) {
        /** With no site blocked. */
        Settings(int port, Supplier<String> token, String extensionOrigin) {
            this(port, token, extensionOrigin, () -> BlockedSites.Rule.NONE);
        }
    }

    private final WebSocketBridge bridge;
    private final BrowserService service;
    private final String startupProblem;
    private final boolean listening;
    private final McpSyncServer mcp;

    private Agent(WebSocketBridge bridge, String startupProblem, boolean listening, BrowserService service, McpSyncServer mcp) {
        this.bridge = bridge;
        this.startupProblem = startupProblem;
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
        WebSocketBridge bridge = null;
        String startupProblem = null;
        for (int candidate = settings.port(); candidate < settings.port() + McpMain.PORT_RANGE && bridge == null; candidate++) {
            WebSocketBridge attempt = new WebSocketBridge(candidate, settings.token(), settings.extensionOrigin());
            try {
                attempt.startAndWait();
                bridge = attempt;
            } catch (Exception e) {
                // Port taken, by another agent or by another program: try the next one.
            }
        }
        boolean listening = bridge != null;
        if (!listening) {
            bridge = new WebSocketBridge(settings.port(), settings.token(), settings.extensionOrigin());
            startupProblem = "Could not listen on any of ports " + settings.port() + "-"
                    + (settings.port() + McpMain.PORT_RANGE - 1) + " on 127.0.0.1: too many TabGoblin servers are running.";
        }
        if (held) {
            bridge.setHeld(true);
        }
        bridge.blockedSites(settings.blocked());
        BrowserService service = new BrowserService(bridge, startupProblem, unpaired);
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
        return new Agent(bridge, startupProblem, listening, service, mcp);
    }

    /**
     * Says in the log that this agent is served, and on which port, or why it has none. Said by the
     * one who serves it, once it holds the agent: the line is the agent's, and goes to the agent's log.
     */
    void announce() {
        if (listening) {
            Log.of(bridge.clientId()).info("listening port=" + bridge.getPort() + " client=" + bridge.clientId());
        } else {
            Log.of(bridge.clientId()).warn(startupProblem);
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
