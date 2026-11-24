package browsercontext;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Typed messages of the Java-to-extension WebSocket protocol. Independent of MCP.
 *
 * <pre>
 * server: {"type":"challenge","nonce":"..","versions":[3],"clientId":"a-1a2b3c4d5e6f"}
 * ext:    {"type":"auth","nonce":"..","proof":"..","version":3}
 * server: {"type":"auth_ok","proof":"..","version":3,"clientId":"a-1a2b3c4d5e6f","clientName":".."}
 * server: {"id":"17","action":"click","session":"s2","params":{..},"deadline":1700000000000}
 * ext:    {"id":"17","success":true,"result":{..},"session":"s2"}  |  {"id":"17","success":false,"error":{"code":"..","message":".."}}
 * server: {"type":"cancel","id":"17"}
 * ext:    {"type":"event","event":"sessions","data":{"sessions":[..]}}
 * </pre>
 */
final class Protocol {

    /**
     * Version this server speaks. Negotiated in the handshake; a peer without it is refused.
     * Version 3: an agent is known by the id of its key, and the server tells its security policy.
     * An extension of version 2 would hand an agent's tabs on by its name, so it is not let in.
     */
    static final int VERSION = 3;

    static final int CLOSE_UNAUTHORIZED = 4401;
    static final int CLOSE_USER_DISCONNECTED = 4403;
    static final int CLOSE_VERSION = 4406;
    static final int CLOSE_REPLACED = 4409;
    static final int CLOSE_RATE_LIMITED = 4429;

    private Protocol() {
    }

    /** One command for the extension. {@code session} is null for commands that are not tab-bound. */
    record Command(String id, String action, String session, JsonNode params, long deadline) {
        String toJson(ObjectMapper json) {
            ObjectNode node = json.createObjectNode();
            node.put("id", id);
            node.put("action", action);
            if (session != null) {
                node.put("session", session);
            }
            node.set("params", params == null ? json.createObjectNode() : params);
            node.put("deadline", deadline);
            return json.writeValueAsString(node);
        }
    }

    /** The extension's answer to a command. */
    record Response(String id, boolean success, JsonNode result, String errorCode, String errorMessage,
            Timing timing, String session) {
        /** Parses and validates a response; returns null when the message is not a well-formed response. */
        static Response parse(JsonNode msg) {
            if (!msg.path("id").isString() || !msg.path("success").isBoolean()) {
                return null;
            }
            boolean ok = msg.path("success").booleanValue();
            JsonNode error = msg.path("error");
            if (!ok && !error.path("code").isString()) {
                return null;
            }
            return new Response(msg.path("id").asString(), ok, msg.path("result"),
                    error.path("code").asString("ERROR"),
                    error.path("message").asString("The extension reported an error."),
                    Timing.parse(msg.path("timing")), sessionId(msg.path("session")));
        }
    }

    /**
     * What the extension says about its part of a round trip, in milliseconds: how long the command
     * ran, how long it waited before that for its turn in the tab's queue, and how much of the
     * running was waiting for the user's answer. An older extension says nothing.
     */
    record Timing(long ran, long queued, long asked) {
        /** Returns null unless all three are whole numbers of a plausible size. */
        static Timing parse(JsonNode n) {
            if (!n.isObject() || !plausible(n.path("ran")) || !plausible(n.path("queued")) || !plausible(n.path("asked"))) {
                return null;
            }
            return new Timing(n.path("ran").asLong(), n.path("queued").asLong(), n.path("asked").asLong());
        }

        private static boolean plausible(JsonNode v) {
            return v.isIntegralNumber() && v.asLong() >= 0 && v.asLong() <= 86_400_000L;
        }
    }

    /** Every site a session spans: the one it was authorized for, and those the user added to it. */
    private static java.util.List<String> originsOf(JsonNode session) {
        java.util.List<String> all = new java.util.ArrayList<>();
        all.add(session.path("origin").asString(""));
        for (JsonNode origin : session.path("origins")) {
            if (origin.isString() && !all.contains(origin.asString())) {
                all.add(origin.asString());
            }
        }
        return java.util.List.copyOf(all);
    }

    /**
     * The session a command ran in, as the extension says with its answer, or null when it does
     * not say: an older extension, or a command that was refused before a session was found.
     */
    private static String sessionId(JsonNode n) {
        return n.isString() && n.asString().matches("s[0-9]{1,9}") ? n.asString() : null;
    }

    /**
     * A browser session as the extension reports it: one authorized tab bound to one agent.
     * {@code unclaimed} is a tab the user authorized for any agent, which none has used yet: the
     * extension reports it to every server, and it is the agent's own from its first command on.
     */
    record Session(String sessionId, String clientId, String authorizationId, String origin, int tabId, int frameId,
            String documentId, String mode, int generation, String state, String title, String url, boolean unclaimed,
            java.util.List<String> origins) {

        /** A session with the one site it was authorized for. */
        Session(String sessionId, String clientId, String authorizationId, String origin, int tabId, int frameId,
                String documentId, String mode, int generation, String state, String title, String url, boolean unclaimed) {
            this(sessionId, clientId, authorizationId, origin, tabId, frameId, documentId, mode, generation, state, title,
                    url, unclaimed, java.util.List.of(origin));
        }

        /** A session that is this agent's own. */
        Session(String sessionId, String clientId, String authorizationId, String origin, int tabId, int frameId,
                String documentId, String mode, int generation, String state, String title, String url) {
            this(sessionId, clientId, authorizationId, origin, tabId, frameId, documentId, mode, generation, state, title,
                    url, false);
        }

        static Session parse(JsonNode n) {
            return new Session(n.path("session").asString(""), n.path("clientId").asString(""),
                    n.path("authorizationId").asString(""), n.path("origin").asString(""), n.path("tabId").asInt(-1),
                    n.path("frameId").asInt(0), n.path("documentId").asString(""), n.path("mode").asString("read"),
                    n.path("generation").asInt(0), n.path("state").asString("active"),
                    n.path("tab").path("title").asString(""), n.path("tab").path("url").asString(""),
                    n.path("owner").asString("").equals("unclaimed"), originsOf(n));
        }
    }

    /** Coarse error class for logs and diagnostics. */
    static String category(String code) {
        return switch (code) {
            case "NOT_AUTHORIZED", "PAUSED", "WRITE_NOT_AUTHORIZED", "EXPLORE_NOT_AUTHORIZED", "SESSION_NOT_OWNED",
                    "SESSION_REQUIRED", "UNKNOWN_SESSION", "AUTHORIZATION_EXPIRED", "SESSION_SUSPENDED", "SUBMIT_INTENT_REQUIRED",
                    "SUBMIT_DENIED", "SUBMIT_NOT_CONFIRMED", "SETTINGS_UNREADABLE", "AGENT_REVOKED", "ACCESS_RESTRICTED", "SCREENSHOTS_DISABLED", "ACCESS_REQUEST_DENIED" -> "AUTHORIZATION";
            case "ORIGIN_MISMATCH", "NAVIGATION_BLOCKED", "SITE_BLOCKED", "SITE_NOT_ALLOWED" -> "SCOPE";
            case "STALE_REF", "STALE_COMMAND", "DUPLICATE_COMMAND", "DUPLICATE_SUBMISSION" -> "STALE";
            case "INVALID_ARGUMENT", "INVALID_URL", "UNKNOWN_TOOL", "UNSUPPORTED_ACTION", "UNSUPPORTED_ELEMENT",
                    "OPTION_NOT_FOUND", "SENSITIVE_FIELD", "ELEMENT_DISABLED" -> "INPUT";
            case "TIMEOUT", "WAIT_TIMEOUT", "PAGE_TIMEOUT" -> "TIMEOUT";
            case "CANCELLED", "INTERRUPTED" -> "CANCELLED";
            case "NOT_CONNECTED", "CONNECTION_LOST", "RATE_LIMITED" -> "CONNECTION";
            default -> "PAGE";
        };
    }
}
