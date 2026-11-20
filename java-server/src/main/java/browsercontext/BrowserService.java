package browsercontext;

import java.time.Duration;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * The generic browser tools. Validates tool arguments, forwards one command to the extension and
 * renders the answer. It has no knowledge of any particular website and no dependency on MCP types.
 */
public final class BrowserService {

    /** Tool outcome: text, or an image for screenshots. */
    public record ToolResult(String text, String imageBase64, String imageMimeType, boolean isError) {
        static ToolResult ok(String text) {
            return new ToolResult(text, null, null, false);
        }

        static ToolResult error(String text) {
            return new ToolResult(text, null, null, true);
        }
    }

    static final int MAX_FILL_CHARS = 100_000;
    static final int MAX_URL_CHARS = 2048;
    static final int MAX_WAIT_MS = 30_000;
    /** The extension waits up to 60s for the user to confirm a submission. */
    static final Duration SUBMIT_TIMEOUT = Duration.ofSeconds(80);

    private final WebSocketBridge bridge;
    private final ObjectMapper json;
    private final Duration defaultTimeout;
    private final String startupProblem;

    public BrowserService(WebSocketBridge bridge, String startupProblem) {
        this(bridge, startupProblem, Duration.ofSeconds(30));
    }

    BrowserService(WebSocketBridge bridge, String startupProblem, Duration defaultTimeout) {
        this.bridge = bridge;
        this.json = bridge.json();
        this.startupProblem = startupProblem;
        this.defaultTimeout = defaultTimeout;
    }

    ObjectMapper json() {
        return json;
    }

    /** Runs one tool. Never throws: failures come back as an error result with a stable code. */
    public ToolResult call(String tool, JsonNode args) {
        JsonNode a = args == null || !args.isObject() ? json.createObjectNode() : args;
        try {
            return switch (tool) {
                case "browser_status" -> status();
                case "browser_snapshot" -> snapshot(a);
                case "browser_extract" -> extract(a);
                case "browser_click" -> click(a);
                case "browser_fill" -> fill(a);
                case "browser_scroll" -> scroll(a);
                case "browser_navigate" -> navigate(a);
                case "browser_screenshot" -> screenshot();
                case "browser_wait_for" -> waitFor(a);
                default -> throw new BrowserException("UNKNOWN_TOOL", "Unknown tool: " + tool);
            };
        } catch (BrowserException e) {
            // If this server never got its port, say so: that is why no extension can be connected.
            String hint = startupProblem != null && e.code().equals("NOT_CONNECTED") ? " " + startupProblem : "";
            return ToolResult.error("Error [" + e.code() + "]: " + e.getMessage() + hint);
        }
    }

    private ToolResult status() {
        StringBuilder sb = new StringBuilder();
        if (startupProblem != null) {
            sb.append("Server problem: ").append(startupProblem).append('\n');
        }
        if (!bridge.isExtensionConnected()) {
            sb.append("Extension: not connected\n");
            sb.append("Listening on: ws://127.0.0.1:").append(bridge.getPort()).append('\n');
            sb.append("Ask the user to load the Browser Context MCP extension in Chrome, open its popup, ")
                    .append("and pair it with this server's pairing token.");
            return ToolResult.ok(sb.toString());
        }
        JsonNode s = bridge.send("status", null, defaultTimeout);
        sb.append("Extension: connected\n");
        if (s.path("authorized").asBoolean(false)) {
            sb.append("Authorized origin: ").append(s.path("origin").asString("?")).append('\n');
            sb.append("Access: ").append("write".equals(s.path("access").asString("")) ? "read/write" : "read only")
                    .append('\n');
            sb.append("Paused: ").append(s.path("paused").asBoolean(false) ? "yes" : "no").append('\n');
            sb.append("Submissions need user confirmation: ")
                    .append(s.path("confirmSubmissions").asBoolean(true) ? "yes" : "no").append('\n');
            JsonNode tab = s.path("tab");
            if (tab.isObject()) {
                sb.append("Tab: ").append(tab.path("title").asString("")).append('\n');
                sb.append("URL: ").append(tab.path("url").asString(""));
            }
        } else {
            sb.append("Authorized origin: none\n");
            sb.append("Ask the user to open the site in Chrome, click the Browser Context MCP icon, ")
                    .append("and authorize that origin.");
        }
        return ToolResult.ok(sb.toString().stripTrailing());
    }

    private ToolResult snapshot(JsonNode a) {
        ObjectNode p = json.createObjectNode();
        p.put("interactiveOnly", optBool(a, "interactive_only", false));
        p.put("viewportOnly", optBool(a, "viewport_only", false));
        return render(bridge.send("snapshot", p, defaultTimeout));
    }

    private ToolResult extract(JsonNode a) {
        ObjectNode p = json.createObjectNode();
        p.put("maxChars", range(optInt(a, "max_chars", 20_000), "max_chars", 100, 100_000));
        p.put("offset", range(optInt(a, "offset", 0), "offset", 0, Integer.MAX_VALUE));
        return render(bridge.send("extract", p, defaultTimeout));
    }

    private ToolResult click(JsonNode a) {
        String intent = optString(a, "intent", "interact");
        if (!intent.equals("interact") && !intent.equals("submit")) {
            throw new BrowserException("INVALID_ARGUMENT", "intent must be \"interact\" or \"submit\".");
        }
        ObjectNode p = json.createObjectNode();
        p.put("ref", requireInt(a, "ref"));
        p.put("intent", intent);
        return render(bridge.send("click", p, intent.equals("submit") ? SUBMIT_TIMEOUT : defaultTimeout));
    }

    private ToolResult fill(JsonNode a) {
        String text = requireString(a, "text");
        if (text.length() > MAX_FILL_CHARS) {
            throw new BrowserException("INVALID_ARGUMENT", "text is longer than " + MAX_FILL_CHARS + " characters.");
        }
        ObjectNode p = json.createObjectNode();
        p.put("ref", requireInt(a, "ref"));
        p.put("text", text);
        p.put("append", optBool(a, "append", false));
        return render(bridge.send("fill", p, defaultTimeout));
    }

    private ToolResult scroll(JsonNode a) {
        String direction = optString(a, "direction", "down");
        if (!java.util.Set.of("up", "down", "left", "right", "top", "bottom").contains(direction)) {
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
        return render(bridge.send("scroll", p, defaultTimeout));
    }

    private ToolResult navigate(JsonNode a) {
        String url = requireString(a, "url").trim();
        if (url.isEmpty() || url.length() > MAX_URL_CHARS) {
            throw new BrowserException("INVALID_ARGUMENT", "url must be 1-" + MAX_URL_CHARS + " characters.");
        }
        ObjectNode p = json.createObjectNode();
        p.put("url", url);
        return render(bridge.send("navigate", p, defaultTimeout.plusSeconds(15)));
    }

    private ToolResult screenshot() {
        JsonNode r = bridge.send("screenshot", null, defaultTimeout);
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
        int timeoutMs = range(optInt(a, "timeout_ms", 5000), "timeout_ms", 100, MAX_WAIT_MS);
        ObjectNode p = json.createObjectNode();
        if (hasText) {
            p.put("text", requireString(a, "text"));
        } else {
            p.put("ref", requireInt(a, "ref"));
        }
        p.put("gone", optBool(a, "gone", false));
        p.put("timeoutMs", timeoutMs);
        return render(bridge.send("wait_for", p, defaultTimeout.plusMillis(timeoutMs)));
    }

    /** Results carrying a "text" field are shown verbatim; anything else as compact JSON. */
    private ToolResult render(JsonNode result) {
        if (result.path("text").isString()) {
            return ToolResult.ok(result.path("text").asString());
        }
        return ToolResult.ok(json.writerWithDefaultPrettyPrinter().writeValueAsString(result));
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
