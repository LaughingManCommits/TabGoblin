package tabgoblin;

import java.time.Duration;
import java.util.List;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * One agent's way to the browser: what the agent's tools and the window know of the extension,
 * for this agent alone, over the one connection of the server ({@link ExtensionServer}). Knows
 * nothing about MCP.
 *
 * <p>Nothing here is shared between agents: this agent's sessions, its times, its tool calls and
 * what it is told when it has no browser are its own. An agent whose server could not open its
 * port has a bridge without a server: nothing is ever connected to it, and its tools say why.
 */
public class WebSocketBridge {

    /** Matches any chrome-extension:// origin instead of one pinned extension id. */
    public static final String ANY_EXTENSION_ORIGIN = ExtensionServer.ANY_EXTENSION_ORIGIN;
    static final int CLOSE_UNAUTHORIZED = Protocol.CLOSE_UNAUTHORIZED;
    static final int CLOSE_REPLACED = Protocol.CLOSE_REPLACED;

    private final ExtensionServer server;
    private final String clientId;
    /** This agent's lines in the log: they carry its id, and go to its own log and to no other agent's. */
    private final Log.Scope log;
    private final ObjectMapper json;
    private final Timings timings;
    private final ExtensionConnection connection;
    private volatile String clientName = "";
    private volatile boolean added;

    /**
     * An agent of the server: the extension is told its id, and binds the agent's tabs to it.
     *
     * @param server   the server's one connection, or null for an agent whose server has no port
     * @param clientId who this agent is to the extension: the id of its key, which is the same at
     *                 every start, or an id made for this start
     */
    public WebSocketBridge(ExtensionServer server, String clientId) {
        this.server = server;
        this.clientId = clientId;
        this.log = Log.of(clientId);
        this.json = server == null ? new ObjectMapper() : server.json();
        this.timings = new Timings(log);
        this.connection = new ExtensionConnection(server, this, json, timings, log);
        if (server != null) {
            added = true;
            server.add(this);
        }
    }

    /** The agent goes: the extension is told, and nothing of this agent's is sent any more. */
    void close() {
        if (server != null && added) {
            added = false;
            server.remove(this);
        }
        connection.closed();
    }

    /** Whether this agent has a browser: the extension is paired with the server, and the user has not disconnected this agent. */
    public boolean isExtensionConnected() {
        return connection.isConnected();
    }

    /** Identity of this agent, stable for the life of the process. */
    public String clientId() {
        return clientId;
    }

    /** The server's port, or 0 for an agent whose server has none. */
    public int getPort() {
        return server == null ? 0 : server.getPort();
    }

    /** Sessions the extension currently reports for this agent. */
    List<Protocol.Session> sessions() {
        return connection.sessions();
    }

    /** The name the MCP client gave itself, or empty while it has not. */
    String clientName() {
        return clientName;
    }

    /** When the extension connected, in milliseconds since the epoch, or 0 while it is not connected. */
    long connectedSince() {
        return connection.connectedSince();
    }

    /** Why this agent has no browser, as a close code, or 0. */
    int lastCloseCode() {
        return connection.lastCloseCode();
    }

    /** The action of a tool call sent to the extension and not answered yet, or null. */
    String running() {
        return connection.running();
    }

    /** Whether the user switched the server's connection to the browser off, in the panel. */
    boolean isHeld() {
        return server != null && server.isHeld();
    }

    /** Switches the server's connection to the browser off or on, for the panel. */
    void setHeld(boolean off) {
        if (server != null) {
            server.setHeld(off);
        }
    }

    public ObjectMapper json() {
        return json;
    }

    /** The sites no agent may work on, as they are now; the extension is told where they changed. */
    BlockedSites.Rule blocked() {
        return server == null ? BlockedSites.Rule.NONE : server.blocked();
    }

    /**
     * Notes an action that this server refused itself, before anything was sent: in the log, as the
     * line of a command that failed, and with the session it was meant for.
     */
    void refused(String session, String action, String code) {
        log.command("-", session, action, 0, code);
        timings.trip(0, null, session);
    }

    /** Human-readable agent name (from the MCP client), shown in the extension popup. */
    public void setClientName(String name) {
        String clean = name == null ? "" : name.replaceAll("[\\p{Cntrl}]", " ").trim();
        if (clean.length() > 60) {
            clean = clean.substring(0, 60);
        }
        if (clean.equals(clientName)) {
            return;
        }
        clientName = clean;
        if (server != null && added) {
            server.renamed();
        }
    }

    /** Where the time of the last tool calls went. */
    Timings timings() {
        return timings;
    }

    ExtensionConnection connection() {
        return connection;
    }

    Log.Scope log() {
        return log;
    }

    /** Sends one command to the extension. Never retries. */
    public JsonNode send(String action, String session, JsonNode params, Duration timeout) {
        return connection.request(action, session, params, timeout);
    }

    /** Whether the extension is paired with the server on the token as it is now. */
    boolean pairedOnCurrentToken() {
        return server != null && server.pairedOnCurrentToken();
    }
}
