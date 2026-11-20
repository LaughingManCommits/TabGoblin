package browsercontext;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
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
    public record ToolResult(String text, String imageBase64, String imageMimeType, boolean isError) {
        static ToolResult ok(String text) {
            return new ToolResult(text, null, null, false);
        }

        static ToolResult error(String text) {
            return new ToolResult(text, null, null, true);
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

    public BrowserService(WebSocketBridge bridge, String startupProblem) {
        this(bridge, startupProblem, Duration.ofSeconds(30), Duration.ofSeconds(10));
    }

    BrowserService(WebSocketBridge bridge, String startupProblem, Duration defaultTimeout) {
        this(bridge, startupProblem, defaultTimeout, Duration.ZERO);
    }

    BrowserService(WebSocketBridge bridge, String startupProblem, Duration defaultTimeout, Duration connectGrace) {
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

    ObjectMapper json() {
        return json;
    }

    /** Records who the MCP client is, for the extension's activity panel. */
    public void noteClient(String name) {
        bridge.setClientName(name);
    }

    /** Runs one tool. Never throws: failures come back as an error result with a stable code. */
    public ToolResult call(String tool, JsonNode args) {
        JsonNode a = args == null || !args.isObject() ? json.createObjectNode() : args;
        awaitExtension();
        try {
            return switch (tool) {
                case "browser_status" -> status(a);
                case "browser_snapshot" -> snapshot(a);
                case "browser_extract" -> extract(a);
                case "browser_click" -> click(a);
                case "browser_fill" -> fill(a);
                case "browser_press_key" -> pressKey(a);
                case "browser_scroll" -> scroll(a);
                case "browser_navigate" -> navigate(a);
                case "browser_screenshot" -> screenshot(a);
                case "browser_wait_for" -> waitFor(a);
                case "browser_submit" -> submit(a);
                default -> throw new BrowserException("UNKNOWN_TOOL", "Unknown tool: " + tool);
            };
        } catch (BrowserException e) {
            // If this server never got its port, say so: that is why no extension can be connected.
            String hint = startupProblem != null && e.code().equals("NOT_CONNECTED") ? " " + startupProblem : "";
            return ToolResult.error("Error [" + e.code() + "]: " + e.getMessage() + hint);
        }
    }

    private JsonNode send(String action, JsonNode a, ObjectNode params, Duration timeout) {
        return bridge.send(action, session(a), params, timeout);
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
        if (!bridge.isExtensionConnected()) {
            sb.append("Extension: not connected\n");
            sb.append("Listening on: ws://127.0.0.1:").append(bridge.getPort()).append('\n');
            sb.append("Ask the user to load the TabGoblin extension in Chrome, open its popup, ")
                    .append("and pair it with this server's pairing token. A paired extension finds a new server ")
                    .append("within about 30 seconds, or at once when its popup is opened.");
            return ToolResult.ok(sb.toString());
        }
        ObjectNode p = json.createObjectNode();
        p.put("diagnostics", optBool(a, "diagnostics", false));
        JsonNode s = bridge.send("status", null, p, defaultTimeout);
        sb.append("Extension: connected (protocol ").append(Protocol.VERSION).append(")\n");
        sb.append("This agent: ").append(bridge.clientId()).append(" on port ").append(bridge.getPort()).append('\n');
        sb.append("Submissions need user confirmation: ")
                .append(s.path("confirmSubmissions").asBoolean(true) ? "yes" : "no").append('\n');
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
            JsonNode tab = session.path("tab");
            if (tab.isObject()) {
                sb.append("  Tab: ").append(tab.path("title").asString("")).append('\n');
                sb.append("  URL: ").append(tab.path("url").asString("")).append('\n');
            }
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
        return render(send("extract", a, p, defaultTimeout));
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
        return new ToolResult(note.isEmpty() ? null : note, data, r.path("mimeType").asString("image/jpeg"), false);
    }

    private ToolResult waitFor(JsonNode a) {
        boolean hasText = a.hasNonNull("text") && !a.path("text").asString("").isBlank();
        boolean hasRef = a.hasNonNull("ref");
        if (hasText == hasRef) {
            throw new BrowserException("INVALID_ARGUMENT", "Provide exactly one of text or ref.");
        }
        String condition = optString(a, "condition", optBool(a, "gone", false) ? "gone" : "visible");
        if (!Set.of("visible", "gone", "enabled", "disabled").contains(condition)) {
            throw new BrowserException("INVALID_ARGUMENT", "condition must be one of visible, gone, enabled, disabled.");
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
        return ToolResult.ok(json.writerWithDefaultPrettyPrinter().writeValueAsString(result));
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
