package tabgoblin;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * The generic browser tools. Validates tool arguments, forwards one command to the extension and
 * renders the answer. It has no knowledge of any particular website and no dependency on MCP types.
 *
 * <p>Every tool is bound to a browser session (one authorized tab). The session may be left out
 * only while this agent has exactly one; the extension enforces ownership and permissions.
 */
public final class BrowserService {

    /** Tool outcome: text, an image, or an image with a note. */
    /**
     * @param structured the result as an object, when it is one: the text is then that object
     *     written out, and a client may take either
     */
    /**
     * @param code the error's code, as the tool reference lists it, where the result is an error; null otherwise.
     *             The text begins with the same code, for an agent that reads text: "Error [CODE]: ..."
     */
    public record ToolResult(String text, String imageBase64, String imageMimeType, boolean isError, JsonNode structured, String code) {
        ToolResult(String text, String imageBase64, String imageMimeType, boolean isError, JsonNode structured) {
            this(text, imageBase64, imageMimeType, isError, structured, null);
        }

        static ToolResult ok(String text) {
            return new ToolResult(text, null, null, false, null);
        }

        /** An error with its code: in the text, as agents read it, and as a field, as the command line reads it. */
        static ToolResult error(String code, String message) {
            return new ToolResult("Error [" + code + "]: " + message, null, null, true, null, code);
        }
    }

    static final int MAX_FILL_CHARS = 100_000;
    static final int MAX_TYPE_CHARS = 2_000;
    static final int MAX_URL_CHARS = 2048;
    static final int MAX_WAIT_MS = 30_000;
    static final int MAX_SUBMIT_FIELDS = 20;
    /** The extension waits up to 60s for the user to confirm a submission, then verifies the outcome. */
    static final Duration SUBMIT_TIMEOUT = Duration.ofSeconds(95);
    private static final int REMEMBERED_SUBMISSIONS = 200;
    private static final Set<String> UNCERTAIN_CODES = Set.of("TIMEOUT", "CONNECTION_LOST", "INTERRUPTED");

    private final WebSocketBridge bridge;
    private final ObjectMapper json;
    private final Duration defaultTimeout;
    private final String startupProblem;
    /** How long the first call after a (re)start waits for the extension to find this server. */
    private final Duration connectGrace;
    private volatile boolean graceUsed;
    /** Outcome per submission id, so a repeated id is answered from memory instead of re-submitted. */
    private final Map<String, String> submissions = new LinkedHashMap<>() {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, String> eldest) {
            return size() > REMEMBERED_SUBMISSIONS;
        }
    };

    /**
     * What is known when a tool finds no browser on this agent's connection.
     *
     * @param pairedElsewhere the browser is paired with this server, by way of another agent: it has only not found this one yet
     * @param refused         a browser came with a token that is not this server's: the user has to paste the server's
     * @param window          the server's window is on the user's screen: the token is copied there
     */
    record Unpaired(boolean pairedElsewhere, boolean refused, boolean window) {
        static final Unpaired NOTHING_KNOWN = new Unpaired(false, false, false);
    }

    /** What the user has to do when the browser holds another token. */
    static final String HOLDS_ANOTHER = "The browser holds a token that is not this server's.";
    static final String PAIR = "Ask the user to pair the browser with this server: in Chrome, with the TabGoblin extension "
            + "loaded, open its popup and paste this server's pairing token.";
    /** No browser has come: one that is paired is on its way as a rule, and one that is not has to be paired. */
    static final String WAIT_OR_PAIR = "An extension that is paired finds this server within about 30 seconds, or at once "
            + "when the user opens the TabGoblin popup. If it is not paired yet, ask the user to load the TabGoblin "
            + "extension in Chrome, open its popup and paste this server's pairing token.";
    /** The window as it is while the browser holds another token: the step and its button are at the top. */
    static final String TOKEN_AT_WINDOWS_TOP = "The TabGoblin server's window is open on the user's screen: Copy token, at "
            + "its top, puts the token on the clipboard.";
    static final String TOKEN_IN_WINDOW = "The TabGoblin server's window is open on the user's screen: Copy, next to "
            + "Pairing token, puts the token on the clipboard.";
    static final String TOKEN_BY_COMMAND = "The user sees the token by running the server's jar with --show-token in a "
            + "terminal.";
    static final String FOUND_SOON = "The browser is paired with this server and finds this agent within about 30 "
            + "seconds, or at once when the user opens the TabGoblin popup. Try again then.";

    private final java.util.function.Supplier<Unpaired> unpaired;
    /** Who this agent is: by a key of its own, or for this start only. */
    private final AgentKeys.Identity identity;
    /** Which way the agent comes: by commands of the command line, or by MCP. The policy can turn one of them off. */
    private final boolean byCommands;

    public BrowserService(WebSocketBridge bridge, String startupProblem) {
        this(bridge, startupProblem, () -> Unpaired.NOTHING_KNOWN);
    }

    BrowserService(WebSocketBridge bridge, String startupProblem, java.util.function.Supplier<Unpaired> unpaired) {
        this(bridge, startupProblem, Duration.ofSeconds(30), Duration.ofSeconds(10), unpaired, null);
    }

    BrowserService(WebSocketBridge bridge, String startupProblem, java.util.function.Supplier<Unpaired> unpaired,
            AgentKeys.Identity identity) {
        this(bridge, startupProblem, Duration.ofSeconds(30), Duration.ofSeconds(10), unpaired, identity, false);
    }

    /** @param byCommands the agent comes by commands of the command line, and not by MCP */
    BrowserService(WebSocketBridge bridge, String startupProblem, java.util.function.Supplier<Unpaired> unpaired,
            AgentKeys.Identity identity, boolean byCommands) {
        this(bridge, startupProblem, Duration.ofSeconds(30), Duration.ofSeconds(10), unpaired, identity, byCommands);
    }

    BrowserService(WebSocketBridge bridge, String startupProblem, Duration defaultTimeout) {
        this(bridge, startupProblem, defaultTimeout, Duration.ZERO);
    }

    BrowserService(WebSocketBridge bridge, String startupProblem, Duration defaultTimeout, Duration connectGrace) {
        this(bridge, startupProblem, defaultTimeout, connectGrace, () -> Unpaired.NOTHING_KNOWN);
    }

    BrowserService(WebSocketBridge bridge, String startupProblem, Duration defaultTimeout, Duration connectGrace,
            java.util.function.Supplier<Unpaired> unpaired) {
        this(bridge, startupProblem, defaultTimeout, connectGrace, unpaired, null);
    }

    BrowserService(WebSocketBridge bridge, String startupProblem, Duration defaultTimeout, Duration connectGrace,
            java.util.function.Supplier<Unpaired> unpaired, AgentKeys.Identity identity) {
        this(bridge, startupProblem, defaultTimeout, connectGrace, unpaired, identity, false);
    }

    BrowserService(WebSocketBridge bridge, String startupProblem, Duration defaultTimeout, Duration connectGrace,
            java.util.function.Supplier<Unpaired> unpaired, AgentKeys.Identity identity, boolean byCommands) {
        // Without a word on who the agent is, it is the bridge's id for this start.
        this.identity = identity != null ? identity
                : new AgentKeys.Identity(bridge.clientId(), null, false, () -> false);
        this.byCommands = byCommands;
        this.unpaired = unpaired;
        this.bridge = bridge;
        this.json = bridge.json();
        this.startupProblem = startupProblem;
        this.defaultTimeout = defaultTimeout;
        this.connectGrace = connectGrace;
    }

    /**
     * An agent often calls a tool moments after its server started, before the extension has found
     * the new server. Wait for that once, instead of reporting "not connected" too early.
     */
    private void awaitExtension() {
        if (bridge.isExtensionConnected()) {
            graceUsed = false;
            return;
        }
        if (graceUsed || startupProblem != null) {
            return;
        }
        graceUsed = true;
        long deadline = System.nanoTime() + connectGrace.toNanos();
        while (!bridge.isExtensionConnected() && System.nanoTime() < deadline) {
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    /**
     * What the user has to do so that this agent has a browser, and where the token is. Asking may
     * bring the server's window up: it is asked only when a tool has found no browser.
     *
     * @param said that the browser holds another token has been said already, by the reason in front of this
     */
    private String pairingHelp(boolean said) {
        Unpaired known = unpaired.get();
        if (known.pairedElsewhere()) {
            return FOUND_SOON;
        }
        boolean refused = known.refused() || bridge.lastCloseCode() == Protocol.CLOSE_UNAUTHORIZED;
        String where = !known.window() ? TOKEN_BY_COMMAND : refused ? TOKEN_AT_WINDOWS_TOP : TOKEN_IN_WINDOW;
        if (refused) {
            return (said ? "" : HOLDS_ANOTHER + " ") + PAIR + " " + where;
        }
        return WAIT_OR_PAIR + " " + where;
    }

    /** Whether pairing is what is missing: not while the user has switched it off or disconnected this agent, which are theirs to undo. */
    private boolean pairingIsMissing() {
        return !bridge.isExtensionConnected() && !bridge.isHeld() && startupProblem == null
                && bridge.lastCloseCode() != Protocol.CLOSE_USER_DISCONNECTED && bridge.lastCloseCode() != Protocol.CLOSE_VERSION;
    }

    ObjectMapper json() {
        return json;
    }

    /** What an agent is told when the user has revoked it on this machine. Only the user can undo it. */
    private String revokedMessage() {
        return "The user revoked this agent (\"" + identity.label() + "\") on this machine, so it has no tool. Nothing "
                + "was done. Do not try another way: tell the user, who can allow it again by running the server's jar "
                + "with --allow-agent " + identity.label() + " and starting this agent again.";
    }

    /** Who this agent is, in the words of the status: whether its tabs are its own again after a restart. */
    private String identityLine() {
        if (identity.persistent()) {
            return " (identity \"" + identity.label() + "\": the same agent at every start)";
        }
        if (identity.label() != null) {
            return " (another agent with the identity \"" + identity.label() + "\" is connected: this one has an id "
                    + "for this start only, and its tabs do not come back after a restart)";
        }
        return " (no identity of its own: its tabs do not come back after a restart. The user gives it one by "
                + "adding --agent <name> to the command that starts this server)";
    }

    /** Whether this agent comes by commands of the command line, and not by MCP. */
    boolean byCommands() {
        return byCommands;
    }

    /** The id of this agent, as the extension and the log know it. */
    String clientId() {
        return bridge.clientId();
    }

    /** Records what the agent is called, for the extension's activity panel: an MCP client's own name, or the command line's. */
    public void noteClient(String name) {
        bridge.setClientName(name);
    }

    /** Runs one tool. Never throws: failures come back as an error result with a stable code. */
    public ToolResult call(String tool, JsonNode args) {
        // From here to the answer is one tool call; what came before it was the agent's time.
        Timings.Running timed = bridge.timings().begin(tool);
        ToolResult result = null;
        try {
            result = run(tool, args);
            return result;
        } finally {
            bridge.timings().end(timed, result != null && !result.isError());
        }
    }

    private ToolResult run(String tool, JsonNode args) {
        JsonNode a = args == null || !args.isObject() ? json.createObjectNode() : args;
        // An agent the user revoked is told so by every tool, before anything is looked at or sent.
        if (identity.revoked().getAsBoolean()) {
            bridge.refused(null, tool, "AGENT_REVOKED");
            return ToolResult.error("AGENT_REVOKED", revokedMessage());
        }
        // An agent of an interface the user's policy turned off is told so by every tool, and nothing is sent for it.
        BlockedSites.Rule policy = bridge.blocked();
        if (!policy.everything() && !policy.limits().allows(byCommands)) {
            bridge.refused(null, tool, "INTERFACE_NOT_ALLOWED");
            return ToolResult.error("INTERFACE_NOT_ALLOWED", interfaceOff(byCommands, policy.limits()));
        }
        long asked = System.nanoTime();
        awaitExtension();
        bridge.timings().waited(System.nanoTime() - asked);
        try {
            return switch (tool) {
                case "browser_status" -> status(a);
                case "browser_snapshot" -> snapshot(a);
                case "browser_extract" -> extract(a);
                case "browser_click" -> click(a);
                case "browser_fill" -> fill(a);
                case "browser_press_key" -> pressKey(a);
                case "browser_scroll" -> scroll(a);
                case "browser_hover" -> hover(a);
                case "browser_collect" -> collect(a);
                case "browser_request_access" -> requestAccess(a);
                case "browser_navigate" -> navigate(a);
                case "browser_screenshot" -> screenshot(a);
                case "browser_wait_for" -> waitFor(a);
                case "browser_submit" -> submit(a);
                default -> throw new BrowserException("UNKNOWN_TOOL", "Unknown tool: " + tool);
            };
        } catch (BrowserException e) {
            // If this server never got its port, say so: that is why no extension can be connected.
            String hint = startupProblem != null && e.code().equals("NOT_CONNECTED") ? " " + startupProblem : "";
            // And if it is the pairing that is missing, say what the user has to do and where the token is.
            if (e.code().equals("NOT_CONNECTED") && pairingIsMissing()) {
                hint += " " + pairingHelp(bridge.lastCloseCode() == Protocol.CLOSE_UNAUTHORIZED);
            }
            return ToolResult.error(e.code(), e.getMessage() + hint);
        }
    }

    private JsonNode send(String action, JsonNode a, ObjectNode params, Duration timeout) {
        return send(action, action, a, params, timeout);
    }

    /**
     * @param checkedAs the action whose access level this command needs, where that depends on its
     *                  arguments: collecting by pages needs what a click on a link needs
     */
    private JsonNode send(String action, String checkedAs, JsonNode a, ObjectNode params, Duration timeout) {
        String session = session(a);
        refuseIfBlocked(checkedAs, session, null);
        return bridge.send(action, session, params, timeout);
    }

    /** What an agent is told when the user's settings have turned its interface off. Only the user can change it. */
    static String interfaceOff(boolean byCommands, BlockedSites.Limits limits) {
        return (byCommands ? "The command line is off" : "MCP is off") + " by the TabGoblin server's settings file (interfaces = "
                + limits.interfaces() + "): no agent comes this way, and nothing was sent. Only the user can change that, in the "
                + "settings of the TabGoblin server. Do not switch to the other interface by yourself; tell the user.";
    }

    /** What an agent is told of a site on the user's list. It names the one site it tried, and never the list. */
    static String blockedMessage(String host) {
        return host + " is on the user's list of blocked sites: no agent may work there. Only the user can "
                + "change that, in the settings of the TabGoblin server.";
    }

    static final String SETTINGS_UNREADABLE = "The TabGoblin server's settings file cannot be read, so every site "
            + "counts as blocked until the user has mended it. Tell the user: the server's window says what is wrong.";

    /**
     * Refuses an action on a blocked site, before anything is sent to the browser: where the
     * session's site, one of the sites the user added to it, or its page is on the list, and where
     * the action would go to an address that is. The server knows a session's sites from the
     * extension's last report; a tab cannot leave them without the session being suspended. A
     * session that is in no report yet is asked for before the command is sent: what the server
     * refuses must not depend on which extension it talks to.
     *
     * @param address where the action would take the tab, if it names an address of its own
     */
    private void refuseIfBlocked(String action, String session, String address) {
        BlockedSites.Rule rule = bridge.blocked();
        if (rule.everything()) {
            bridge.refused(session, action, "SETTINGS_UNREADABLE");
            throw new BrowserException("SETTINGS_UNREADABLE", SETTINGS_UNREADABLE);
        }
        // What the user's policy takes away from every agent, as far as it can be told before anything is sent.
        BlockedSites.Limits limits = rule.limits();
        if (action.equals("screenshot") && !limits.screenshots()) {
            bridge.refused(session, action, "SCREENSHOTS_DISABLED");
            throw new BrowserException("SCREENSHOTS_DISABLED", "The user's security policy allows no screenshots. Nothing was "
                    + "captured. Read the page with browser_snapshot or browser_extract instead.");
        }
        BlockedSites.Access needs = NEEDS.getOrDefault(action, BlockedSites.Access.READ);
        if (!limits.allows(needs)) {
            bridge.refused(session, action, "ACCESS_RESTRICTED");
            throw new BrowserException("ACCESS_RESTRICTED", "The user's security policy allows no session more than "
                    + limits.maxAccess().label() + " access, and this needs " + needs.label() + ". Nothing was done. Only the user can change the policy, "
                    + "in the settings of the TabGoblin server.");
        }
        if (rule.domains().isEmpty() && limits.allowed().isEmpty()) {
            return;
        }
        java.util.List<String> addresses = new java.util.ArrayList<>();
        if (address != null) {
            addresses.add(address);
        }
        java.util.List<Protocol.Session> known = bridge.sessions();
        Protocol.Session meant = session == null
                ? (known.size() == 1 ? known.get(0) : null)
                : known.stream().filter(s -> s.sessionId().equals(session)).findFirst().orElse(null);
        String id = meant == null ? session : meant.sessionId();
        if (meant != null) {
            addresses.addAll(meant.origins());
            addresses.add(meant.url());
        } else if (bridge.isExtensionConnected()) {
            // The report may be a moment old. Where the session is, is asked: an answer that does not
            // come is the end of this call, and nothing was sent.
            JsonNode found = null;
            int count = 0;
            for (JsonNode each : bridge.send("status", null, json.createObjectNode(), defaultTimeout).path("sessions")) {
                count++;
                if (session == null || session.equals(each.path("session").asString(""))) {
                    found = each;
                }
            }
            // Without a name the command is for the agent's only session; with several it reaches none.
            if (found != null && (session != null || count == 1)) {
                id = found.path("session").asString("");
                addresses.addAll(addressesOf(found));
            }
        }
        String host = rule.among(addresses);
        if (host != null) {
            bridge.refused(id, action, "SITE_BLOCKED");
            throw new BrowserException("SITE_BLOCKED", blockedMessage(host));
        }
        String outside = rule.outside(addresses);
        if (outside != null) {
            bridge.refused(id, action, "SITE_NOT_ALLOWED");
            throw new BrowserException("SITE_NOT_ALLOWED", notAllowedMessage(outside));
        }
    }

    /** The least access each action needs: what the extension's rules have, said here to refuse ahead of sending. */
    private static final Map<String, BlockedSites.Access> NEEDS = Map.of(
            "navigate", BlockedSites.Access.EXPLORE, "click", BlockedSites.Access.EXPLORE,
            "press_key", BlockedSites.Access.EXPLORE, "hover", BlockedSites.Access.EXPLORE,
            "fill", BlockedSites.Access.WRITE, "submit", BlockedSites.Access.WRITE);

    /** What an agent is told of a site outside the ones the user limits agents to. It names the one site, and never the list. */
    static String notAllowedMessage(String host) {
        return host + " is not among the sites the user's security policy allows agents to work on. Only the user "
                + "can change that, in the settings of the TabGoblin server.";
    }

    /** Whether an address names a site of its own, and is not one within the site the tab is on. */
    private static boolean absolute(String url) {
        // As a browser reads it: a backslash is a slash, and blanks in front do not count.
        String address = url.strip().replace('\\', '/');
        return address.startsWith("//") || address.matches("(?i)^[a-z][a-z0-9+.-]*:.*");
    }

    /** The site of a session, as the extension reports it, that is on the list of blocked sites; or null. */
    private static String blockedIn(BlockedSites.Rule rule, JsonNode session) {
        return rule.among(addressesOf(session));
    }

    /** Every address a session is at, as the extension reports it: its site, the sites added to it, and its page. */
    private static java.util.List<String> addressesOf(JsonNode session) {
        java.util.List<String> addresses = new java.util.ArrayList<>();
        addresses.add(session.path("origin").asString(""));
        session.path("origins").forEach(origin -> addresses.add(origin.asString("")));
        addresses.add(session.path("tab").path("url").asString(""));
        return addresses;
    }

    /** The session argument, validated; null lets the extension pick this agent's only session. */
    private static String session(JsonNode a) {
        if (!a.hasNonNull("session")) {
            return null;
        }
        String session = requireString(a, "session").trim();
        if (!session.matches("s[0-9]{1,9}")) {
            throw new BrowserException("INVALID_ARGUMENT",
                    "session must be an id like \"s1\" as listed by browser_status.");
        }
        return session;
    }

    private ToolResult status(JsonNode a) {
        StringBuilder sb = new StringBuilder();
        if (startupProblem != null) {
            sb.append("Server problem: ").append(startupProblem).append('\n');
        }
        if (!bridge.isExtensionConnected() && bridge.isHeld()) {
            sb.append("Extension: not connected (switched off in this server's window)\n");
            sb.append(ExtensionConnection.NOT_CONNECTED_HELD);
            return ToolResult.ok(sb.toString());
        }
        if (!bridge.isExtensionConnected()) {
            sb.append("Extension: not connected\n");
            sb.append("Listening on: ws://127.0.0.1:").append(bridge.getPort()).append('\n');
            if (pairingIsMissing()) {
                sb.append(pairingHelp(false));
            } else if (bridge.lastCloseCode() == Protocol.CLOSE_USER_DISCONNECTED) {
                sb.append("The user disconnected this agent in the TabGoblin popup. Ask them to allow it again.");
            } else if (bridge.lastCloseCode() == Protocol.CLOSE_VERSION) {
                sb.append("The extension is of another version than this server: both have to be of the same release.");
            }
            return ToolResult.ok(sb.toString());
        }
        BlockedSites.Rule rule = bridge.blocked();
        if (rule.everything()) {
            sb.append("Blocked sites: ").append(SETTINGS_UNREADABLE).append('\n');
        } else if (!rule.limits().equals(BlockedSites.Limits.NONE)) {
            // What the user's settings take away from every agent. The sites it is limited to are not listed to it.
            sb.append("Security policy: ").append(policyLine(rule.limits())).append('\n');
        }
        ObjectNode p = json.createObjectNode();
        p.put("diagnostics", optBool(a, "diagnostics", false));
        JsonNode s = bridge.send("status", null, p, defaultTimeout);
        sb.append("Extension: connected (protocol ").append(Protocol.VERSION).append(")\n");
        sb.append("This agent: ").append(bridge.clientId()).append(" on port ").append(bridge.getPort())
                .append(identityLine()).append('\n');
        // Where the usual ports could not be had: said so that the agent can tell the user why the port is another.
        String ports = Ports.note(bridge.getPort());
        if (!ports.isEmpty()) {
            sb.append(ports).append('\n');
        }
        // The general setting. Older extensions say only yes or no.
        String asking = s.path("confirmation").asString(s.path("confirmSubmissions").asBoolean(true) ? "always" : "never");
        sb.append("Submissions need user confirmation: ").append(describeAsking(asking)).append('\n');
        JsonNode sessions = s.path("sessions");
        if (sessions.isEmpty()) {
            sb.append("Authorized origin: none\n");
            sb.append("Ask the user to open the site in Chrome, click the TabGoblin icon, ")
                    .append("and authorize that tab.");
        } else {
            sb.append("Sessions: ").append(sessions.size())
                    .append(sessions.size() > 1 ? " (pass session=<id> to every tool)" : "").append('\n');
        }
        for (JsonNode session : sessions) {
            sb.append("Session ").append(session.path("session").asString("?")).append('\n');
            sb.append("  Authorized origin: ").append(session.path("origin").asString("?")).append('\n');
            sb.append("  Access: ").append(describeMode(session.path("mode").asString(""))).append('\n');
            sb.append("  Paused: ").append(session.path("paused").asBoolean(false) ? "yes" : "no").append('\n');
            // The user can set one session differently from the general setting. Said where it matters:
            // only a session with write access can submit.
            String own = session.path("confirmation").asString(asking);
            if (!own.equals(asking) && session.path("mode").asString("").equals("write")) {
                sb.append("  Submissions need user confirmation in this session: ").append(describeAsking(own)).append('\n');
            }
            if (session.path("workspace").isString()) {
                // A name the user filed the tab under. It groups tabs of one task, and gives nothing.
                sb.append("  Workspace: ").append(session.path("workspace").asString()).append('\n');
            }
            if (session.path("origins").size() > 1) {
                sb.append("  All authorized sites of this session:");
                for (JsonNode origin : session.path("origins")) {
                    sb.append(' ').append(origin.asString(""));
                }
                sb.append('\n');
            }
            if (session.path("suspended").asBoolean(false)) {
                sb.append("  State: suspended (the tab left the authorized sites; nothing can be read until ")
                        .append("the user clicks the extension icon on that tab and resumes the session)\n");
            }
            if (session.path("owner").asString("").equals("unclaimed")) {
                sb.append("  Owner: not yet claimed (your first command on it claims it)\n");
            }
            if (blockedIn(rule, session) != null) {
                sb.append("  Blocked: ").append(blockedMessage(blockedIn(rule, session))).append('\n');
            } else if (rule.outside(addressesOf(session)) != null) {
                sb.append("  Not allowed: ").append(notAllowedMessage(rule.outside(addressesOf(session)))).append('\n');
            }
            JsonNode tab = session.path("tab");
            if (tab.isObject()) {
                sb.append("  Tab: ").append(tab.path("title").asString("")).append('\n');
                sb.append("  URL: ").append(tab.path("url").asString("")).append('\n');
            }
        }
        for (JsonNode asked : s.path("requests")) {
            // What this agent asked the user for and has no answer to yet.
            sb.append("Access requested, waiting for the user: ").append(asked.path("level").asString("?")).append(" on ")
                    .append(asked.path("session").isString() ? "session " + asked.path("session").asString() : asked.path("origin").asString("?"))
                    .append('\n');
        }
        if (optBool(a, "diagnostics", false)) {
            // Measured here, because only the server sees the agent, itself and the extension.
            sb.append(bridge.timings().report());
        }
        if (s.path("diagnostics").isArray()) {
            sb.append("Recent operations (newest last):\n");
            for (JsonNode op : s.path("diagnostics")) {
                sb.append("  ").append(op.path("session").asString("-")).append(' ')
                        .append(op.path("action").asString("?")).append(' ')
                        .append(op.path("ms").asInt(0)).append("ms ")
                        .append(op.path("code").asString("ok")).append('\n');
            }
        }
        return ToolResult.ok(sb.toString().stripTrailing());
    }

    /** The user's restrictions as an agent is told them: what holds, and not which sites are allowed. */
    private static String policyLine(BlockedSites.Limits limits) {
        BlockedSites.Limits shown = new BlockedSites.Limits(limits.strict(), List.of(), limits.screenshots(), limits.maxAccess(),
                limits.sessionMaxMinutes(), limits.sessionIdleMinutes(), limits.cli(), limits.mcp());
        String said = shown.summary();
        if (!limits.allowed().isEmpty()) {
            said = (said.isEmpty() ? "" : said + "; ") + "agents work only on the sites the user allows";
        }
        return said;
    }

    /** When the user is asked before a submission, in the words agents read. */
    private static String describeAsking(String asking) {
        return switch (asking) {
            case "never" -> "no (only high-impact ones are put to the user)";
            case "auto" -> "yes, the first time for each control; what the user allowed passes for a while";
            default -> "yes";
        };
    }

    private static String describeMode(String mode) {
        return switch (mode) {
            case "write" -> "read/write";
            case "explore" -> "explore (read, navigate, open links and expand sections)";
            default -> "read only";
        };
    }

    private ToolResult snapshot(JsonNode a) {
        ObjectNode p = json.createObjectNode();
        p.put("interactiveOnly", optBool(a, "interactive_only", false));
        p.put("viewportOnly", optBool(a, "viewport_only", false));
        p.put("diff", optBool(a, "diff", false));
        p.put("maxLines", range(optInt(a, "max_lines", 250), "max_lines", 20, 1000));
        p.put("startLine", range(optInt(a, "start_line", 0), "start_line", 0, Integer.MAX_VALUE));
        if (a.hasNonNull("ref")) {
            p.put("ref", requireInt(a, "ref"));
        }
        return render(send("snapshot", a, p, defaultTimeout));
    }

    private static final int MAX_FIND_CHARS = 200;
    private static final int MAX_EXTRACT_REFS = 10;
    private static final Set<String> EXTRACT_KINDS = Set.of("tables", "code", "articles");

    private ToolResult extract(JsonNode a) {
        String links = optString(a, "links", "ref");
        if (!Set.of("none", "ref", "url").contains(links)) {
            throw new BrowserException("INVALID_ARGUMENT", "links must be one of none, ref, url.");
        }
        ObjectNode p = json.createObjectNode();
        p.put("maxChars", range(optInt(a, "max_chars", 12_000), "max_chars", 100, 100_000));
        p.put("offset", range(optInt(a, "offset", 0), "offset", 0, Integer.MAX_VALUE));
        p.put("outline", optBool(a, "outline", false));
        p.put("mainOnly", optBool(a, "main_only", false));
        p.put("links", links);
        if (a.hasNonNull("ref")) {
            p.put("ref", requireInt(a, "ref"));
        }
        extractParts(a, p);
        return render(send("extract", a, p, defaultTimeout));
    }

    /**
     * The arguments that return parts of a page: matching lines, regions of one kind, several refs.
     * Whether a regular expression is one that can be run is decided where it is run, in the page.
     */
    private static void extractParts(JsonNode a, ObjectNode p) {
        boolean outline = p.path("outline").asBoolean();
        if (a.hasNonNull("find")) {
            String find = requireString(a, "find");
            if (find.isEmpty() || find.length() > MAX_FIND_CHARS) {
                throw new BrowserException("INVALID_ARGUMENT", "find must be 1-" + MAX_FIND_CHARS + " characters.");
            }
            if (outline) {
                throw new BrowserException("INVALID_ARGUMENT", "find cannot be combined with outline.");
            }
            p.put("find", find);
            p.put("regex", optBool(a, "regex", false));
            p.put("contextLines", range(optInt(a, "context_lines", 2), "context_lines", 0, 20));
            p.put("maxMatches", range(optInt(a, "max_matches", 20), "max_matches", 1, 200));
        } else if (optBool(a, "regex", false)) {
            throw new BrowserException("INVALID_ARGUMENT", "regex needs find: the text to search for.");
        }
        if (a.hasNonNull("kind")) {
            String kind = requireString(a, "kind");
            if (!EXTRACT_KINDS.contains(kind)) {
                throw new BrowserException("INVALID_ARGUMENT", "kind must be one of tables, code, articles.");
            }
            if (outline) {
                throw new BrowserException("INVALID_ARGUMENT", "kind cannot be combined with outline.");
            }
            p.put("kind", kind);
        }
        if (a.hasNonNull("refs")) {
            JsonNode refs = a.path("refs");
            if (!refs.isArray() || refs.isEmpty() || refs.size() > MAX_EXTRACT_REFS) {
                throw new BrowserException("INVALID_ARGUMENT", "refs must be an array of 1-" + MAX_EXTRACT_REFS + " refs.");
            }
            if (p.has("ref")) {
                throw new BrowserException("INVALID_ARGUMENT", "Provide ref or refs, not both.");
            }
            if (outline) {
                throw new BrowserException("INVALID_ARGUMENT", "refs cannot be combined with outline.");
            }
            if (p.path("offset").asInt() > 0) {
                throw new BrowserException("INVALID_ARGUMENT",
                        "offset cannot be combined with refs: continue one region with ref and offset.");
            }
            ArrayNode list = p.putArray("refs");
            for (JsonNode ref : refs) {
                if (!ref.isIntegralNumber() || !ref.canConvertToInt()) {
                    throw new BrowserException("INVALID_ARGUMENT", "refs must hold integers: refs from an outline or a snapshot.");
                }
                list.add(ref.intValue());
            }
        }
    }

    private ToolResult click(JsonNode a) {
        String intent = intent(a);
        ObjectNode p = json.createObjectNode();
        p.put("ref", requireInt(a, "ref"));
        p.put("intent", intent);
        return render(send("click", a, p, intent.equals("submit") ? SUBMIT_TIMEOUT : defaultTimeout));
    }

    private static String intent(JsonNode a) {
        String intent = optString(a, "intent", "interact");
        if (!intent.equals("interact") && !intent.equals("submit")) {
            throw new BrowserException("INVALID_ARGUMENT", "intent must be \"interact\" or \"submit\".");
        }
        return intent;
    }

    private ToolResult fill(JsonNode a) {
        String text = requireString(a, "text");
        String method = optString(a, "method", "set");
        if (!method.equals("set") && !method.equals("type")) {
            throw new BrowserException("INVALID_ARGUMENT", "method must be \"set\" or \"type\".");
        }
        int limit = method.equals("type") ? MAX_TYPE_CHARS : MAX_FILL_CHARS;
        if (text.length() > limit) {
            throw new BrowserException("INVALID_ARGUMENT", "text is longer than " + limit + " characters"
                    + (method.equals("type") ? " for method \"type\"; use method \"set\" for long text." : "."));
        }
        ObjectNode p = json.createObjectNode();
        p.put("ref", requireInt(a, "ref"));
        p.put("text", text);
        p.put("append", optBool(a, "append", false));
        p.put("method", method);
        return render(send("fill", a, p, defaultTimeout));
    }

    private ToolResult pressKey(JsonNode a) {
        String key = requireString(a, "key").trim();
        if (key.isEmpty() || key.length() > 20) {
            throw new BrowserException("INVALID_ARGUMENT", "key must be a key name such as Enter, Escape or Tab.");
        }
        String intent = intent(a);
        ObjectNode p = json.createObjectNode();
        p.put("key", key);
        p.put("intent", intent);
        p.put("repeat", a.path("repeat").asBoolean(false));
        if (a.hasNonNull("ref")) {
            p.put("ref", requireInt(a, "ref"));
        }
        return render(send("press_key", a, p, intent.equals("submit") ? SUBMIT_TIMEOUT : defaultTimeout));
    }

    private ToolResult scroll(JsonNode a) {
        String direction = optString(a, "direction", "down");
        if (!Set.of("up", "down", "left", "right", "top", "bottom").contains(direction)) {
            throw new BrowserException("INVALID_ARGUMENT",
                    "direction must be one of up, down, left, right, top, bottom.");
        }
        ObjectNode p = json.createObjectNode();
        p.put("direction", direction);
        if (a.hasNonNull("amount")) {
            p.put("amount", range(requireInt(a, "amount"), "amount", 1, 100_000));
        }
        if (a.hasNonNull("ref")) {
            p.put("ref", requireInt(a, "ref"));
        }
        return render(send("scroll", a, p, defaultTimeout));
    }

    static final int MAX_REASON_CHARS = 200;

    /**
     * Puts a request for access to the user: a higher level on a session of this agent's, or a tab
     * on a site it has none on. Nothing is granted by the call, and it returns at once.
     */
    private ToolResult requestAccess(JsonNode a) {
        String level = requireString(a, "level").trim().toLowerCase(Locale.ROOT);
        if (BlockedSites.Access.of(level) == null) {
            throw new BrowserException("INVALID_ARGUMENT", "level must be one of read, explore, write.");
        }
        ObjectNode p = json.createObjectNode();
        p.put("level", level);
        String site = null;
        if (a.hasNonNull("site")) {
            site = requireString(a, "site").trim();
            if (site.isEmpty() || site.length() > MAX_URL_CHARS || !site.matches("(?i)^https?://[^/\\s].*")) {
                throw new BrowserException("INVALID_ARGUMENT", "site must be the address of a website, such as https://example.org.");
            }
            if (a.hasNonNull("session")) {
                throw new BrowserException("INVALID_ARGUMENT", "Give site for a tab on another site, or session for a higher level on one you have: not both.");
            }
            p.put("site", site);
        }
        if (a.hasNonNull("reason")) {
            String reason = requireString(a, "reason").trim();
            if (reason.length() > MAX_REASON_CHARS) {
                throw new BrowserException("INVALID_ARGUMENT", "reason must be at most " + MAX_REASON_CHARS + " characters.");
            }
            p.put("reason", reason);
        }
        // What the user's settings rule out is refused here, before the user is troubled with it.
        BlockedSites.Rule rule = bridge.blocked();
        if (rule.everything()) {
            throw new BrowserException("SETTINGS_UNREADABLE", SETTINGS_UNREADABLE);
        }
        if (!rule.limits().allows(BlockedSites.Access.of(level))) {
            throw new BrowserException("ACCESS_RESTRICTED", "The user's security policy allows no session more than "
                    + rule.limits().maxAccess().label() + " access. Nothing was asked. Only the user can change the policy, in "
                    + "the settings of the TabGoblin server.");
        }
        if (site != null) {
            String blocked = rule.among(List.of(site));
            if (blocked != null) {
                throw new BrowserException("SITE_BLOCKED", blockedMessage(blocked));
            }
            String outside = rule.outside(List.of(site));
            if (outside != null) {
                throw new BrowserException("SITE_NOT_ALLOWED", notAllowedMessage(outside));
            }
        }
        return render(bridge.send("request_access", site == null ? session(a) : null, p, defaultTimeout));
    }

    private ToolResult hover(JsonNode a) {
        ObjectNode p = json.createObjectNode();
        p.put("ref", requireInt(a, "ref"));
        return render(send("hover", a, p, defaultTimeout));
    }

    static final int MAX_COLLECT_STEPS = 20;
    static final int MAX_COLLECT_MS = 30_000;

    /**
     * Reads what a tab shows over several steps in one call: scrolled down, or page after page by
     * a link the agent names. Bounded by steps, time and size; the extension stops at the first.
     */
    private ToolResult collect(JsonNode a) {
        ObjectNode p = json.createObjectNode();
        p.put("maxSteps", range(optInt(a, "max_steps", 5), "max_steps", 1, MAX_COLLECT_STEPS));
        int maxMs = range(optInt(a, "max_ms", 15_000), "max_ms", 500, MAX_COLLECT_MS);
        p.put("maxMs", maxMs);
        p.put("maxChars", range(optInt(a, "max_chars", 12_000), "max_chars", 100, 100_000));
        boolean paged = a.hasNonNull("next");
        if (paged) {
            String next = requireString(a, "next").trim();
            if (next.isEmpty() || next.length() > 80) {
                throw new BrowserException("INVALID_ARGUMENT", "next must be the name of the link to the next page, 1-80 characters.");
            }
            p.put("next", next);
        }
        if (a.hasNonNull("ref")) {
            if (paged) {
                throw new BrowserException("INVALID_ARGUMENT", "ref goes with scrolling, not with next: a ref does not outlast its page.");
            }
            p.put("ref", requireInt(a, "ref"));
        }
        if (a.hasNonNull("find")) {
            String find = requireString(a, "find");
            if (find.isEmpty() || find.length() > 200) {
                throw new BrowserException("INVALID_ARGUMENT", "find must be 1-200 characters.");
            }
            p.put("find", find);
            p.put("regex", optBool(a, "regex", false));
            p.put("contextLines", range(optInt(a, "context_lines", 2), "context_lines", 0, 20));
        } else if (optBool(a, "regex", false) || a.hasNonNull("context_lines")) {
            throw new BrowserException("INVALID_ARGUMENT", "regex and context_lines go with find.");
        }
        // Following a link takes Explore: refused here already where the user's policy allows no session
        // that much. Each step has its own time in the extension; the whole has the caller's on top.
        return render(send("collect", paged ? "click" : "collect", a, p, defaultTimeout.plusMillis(maxMs)));
    }

    private ToolResult navigate(JsonNode a) {
        boolean hasUrl = a.hasNonNull("url");
        boolean hasHistory = a.hasNonNull("history");
        if (hasUrl == hasHistory) {
            throw new BrowserException("INVALID_ARGUMENT", "Provide exactly one of url or history.");
        }
        ObjectNode p = json.createObjectNode();
        if (hasUrl) {
            String url = requireString(a, "url").trim();
            if (url.isEmpty() || url.length() > MAX_URL_CHARS) {
                throw new BrowserException("INVALID_ARGUMENT", "url must be 1-" + MAX_URL_CHARS + " characters.");
            }
            p.put("url", url);
            if (absolute(url)) {
                refuseIfBlocked("navigate", session(a), url);
            }
        } else {
            String history = requireString(a, "history");
            if (!Set.of("back", "forward", "reload").contains(history)) {
                throw new BrowserException("INVALID_ARGUMENT", "history must be one of back, forward, reload.");
            }
            p.put("history", history);
        }
        return render(send("navigate", a, p, defaultTimeout.plusSeconds(15)));
    }

    private ToolResult screenshot(JsonNode a) {
        JsonNode r = send("screenshot", a, json.createObjectNode(), defaultTimeout);
        String data = r.path("data").asString("");
        if (data.isEmpty()) {
            throw new BrowserException("SCREENSHOT_FAILED", "The extension returned no image data.");
        }
        // The note says how much of the page the image covers, so the agent knows to scroll for more.
        String note = r.path("note").asString("");
        return new ToolResult(note.isEmpty() ? null : note, data, r.path("mimeType").asString("image/jpeg"), false, null);
    }

    private ToolResult waitFor(JsonNode a) {
        boolean hasText = a.hasNonNull("text") && !a.path("text").asString("").isBlank();
        boolean hasRef = a.hasNonNull("ref");
        if (hasText == hasRef) {
            throw new BrowserException("INVALID_ARGUMENT", "Provide exactly one of text or ref.");
        }
        String condition = optString(a, "condition", optBool(a, "gone", false) ? "gone" : "visible");
        if (!Set.of("visible", "gone", "enabled", "disabled", "changed").contains(condition)) {
            throw new BrowserException("INVALID_ARGUMENT", "condition must be one of visible, gone, enabled, disabled, changed.");
        }
        if (hasText && !condition.equals("visible") && !condition.equals("gone")) {
            throw new BrowserException("INVALID_ARGUMENT", "For text, condition must be visible or gone.");
        }
        int timeoutMs = range(optInt(a, "timeout_ms", 5000), "timeout_ms", 100, MAX_WAIT_MS);
        ObjectNode p = json.createObjectNode();
        if (hasText) {
            p.put("text", requireString(a, "text"));
        } else {
            p.put("ref", requireInt(a, "ref"));
        }
        p.put("condition", condition);
        p.put("timeoutMs", timeoutMs);
        return render(send("wait_for", a, p, defaultTimeout.plusMillis(timeoutMs)));
    }

    /**
     * One verified submission: optionally fill fields, click the control, then observe the page.
     * A submission id is processed at most once; unknown outcomes are recorded as UNCERTAIN and
     * never repeated automatically.
     */
    private ToolResult submit(JsonNode a) {
        ObjectNode p = json.createObjectNode();
        p.put("ref", requireInt(a, "ref"));
        ArrayNode fields = p.putArray("fields");
        JsonNode given = a.path("fields");
        if (!given.isMissingNode() && !given.isNull()) {
            if (!given.isArray() || given.size() > MAX_SUBMIT_FIELDS) {
                throw new BrowserException("INVALID_ARGUMENT",
                        "fields must be an array of at most " + MAX_SUBMIT_FIELDS + " {ref, text} objects.");
            }
            for (JsonNode field : given) {
                String text = requireString(field, "text");
                if (text.length() > MAX_FILL_CHARS) {
                    throw new BrowserException("INVALID_ARGUMENT", "A field text is longer than " + MAX_FILL_CHARS + " characters.");
                }
                fields.addObject().put("ref", requireInt(field, "ref")).put("text", text);
            }
        }
        if (a.hasNonNull("expect_text")) {
            String expect = requireString(a, "expect_text").trim();
            if (expect.isEmpty() || expect.length() > 500) {
                throw new BrowserException("INVALID_ARGUMENT", "expect_text must be 1-500 characters.");
            }
            p.put("expectText", expect);
        }
        p.put("repeat", optBool(a, "repeat", false));
        String id = optString(a, "submission_id", "sub-" + Pairing.randomHex(6)).trim();
        if (!id.matches("[A-Za-z0-9_.-]{1,64}")) {
            throw new BrowserException("INVALID_ARGUMENT", "submission_id must be 1-64 letters, digits, dot, dash or underscore.");
        }
        p.put("submissionId", id);

        synchronized (submissions) {
            String known = submissions.get(id);
            if (known != null) {
                return ToolResult.ok("Submission " + id + " was already handled and was NOT sent again.\n"
                        + "Recorded outcome: " + known + "\nUse a new submission_id for a different submission.");
            }
            submissions.put(id, "SUBMITTING (still in progress)");
        }
        try {
            JsonNode result = send("submit", a, p, SUBMIT_TIMEOUT);
            String state = result.path("state").asString("UNCERTAIN");
            remember(id, state);
            return render(result);
        } catch (BrowserException e) {
            if (UNCERTAIN_CODES.contains(e.code())) {
                // The click may or may not have reached the site. Never resend this id.
                remember(id, "UNCERTAIN (" + e.code() + ": no answer from the browser)");
                throw new BrowserException(e.code(), e.getMessage() + " Submission " + id
                        + " is recorded as UNCERTAIN and will not be sent again; check the page to see whether it went through.");
            }
            // Refused before anything was dispatched: the same id may be used again.
            synchronized (submissions) {
                submissions.remove(id);
            }
            throw e;
        }
    }

    private void remember(String id, String outcome) {
        synchronized (submissions) {
            submissions.put(id, outcome);
        }
    }

    /** Results carrying a "text" field are shown verbatim; anything else as compact JSON. */
    private ToolResult render(JsonNode result) {
        if (result.path("text").isString()) {
            return ToolResult.ok(result.path("text").asString());
        }
        // The text is what agents have always read, and stays as it is. The object goes along with it.
        return new ToolResult(json.writerWithDefaultPrettyPrinter().writeValueAsString(result), null, null, false,
                result.isObject() ? result : null);
    }

    /** Sessions this agent currently has, as reported by the extension. */
    List<Protocol.Session> sessions() {
        return bridge.sessions();
    }

    private static int requireInt(JsonNode a, String name) {
        JsonNode v = a.path(name);
        if (v.isIntegralNumber() && v.canConvertToInt()) {
            return v.intValue();
        }
        if (v.isString()) {
            try {
                return Integer.parseInt(v.asString().trim());
            } catch (NumberFormatException e) {
                // fall through
            }
        }
        throw new BrowserException("INVALID_ARGUMENT", name + " is required and must be an integer.");
    }

    private static int optInt(JsonNode a, String name, int fallback) {
        return a.hasNonNull(name) ? requireInt(a, name) : fallback;
    }

    private static int range(int value, String name, int min, int max) {
        if (value < min || value > max) {
            throw new BrowserException("INVALID_ARGUMENT", name + " must be between " + min + " and " + max + ".");
        }
        return value;
    }

    private static String requireString(JsonNode a, String name) {
        JsonNode v = a.path(name);
        if (!v.isString()) {
            throw new BrowserException("INVALID_ARGUMENT", name + " is required and must be a string.");
        }
        return v.asString();
    }

    private static String optString(JsonNode a, String name, String fallback) {
        return a.hasNonNull(name) ? requireString(a, name) : fallback;
    }

    private static boolean optBool(JsonNode a, String name, boolean fallback) {
        JsonNode v = a.path(name);
        if (v.isBoolean()) {
            return v.booleanValue();
        }
        if (v.isString()) {
            return v.asString().equalsIgnoreCase("true");
        }
        return fallback;
    }
}
