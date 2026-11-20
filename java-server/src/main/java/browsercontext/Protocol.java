package browsercontext;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Typed messages of the Java-to-extension WebSocket protocol. Independent of MCP.
 *
 * <pre>
 * server: {"type":"challenge","nonce":"..","versions":[2]}
 * ext:    {"type":"auth","nonce":"..","proof":"..","version":2}
 * server: {"type":"auth_ok","proof":"..","version":2,"clientId":"c-1a2b3c4d","clientName":".."}
 * server: {"id":"17","action":"click","session":"s2","params":{..},"deadline":1700000000000}
 * ext:    {"id":"17","success":true,"result":{..}}  |  {"id":"17","success":false,"error":{"code":"..","message":".."}}
 * server: {"type":"cancel","id":"17"}
 * ext:    {"type":"event","event":"sessions","data":{"sessions":[..]}}
 * </pre>
 */
final class Protocol {

    /** Version this server speaks. Negotiated in the handshake; a peer without it is refused. */
    static final int VERSION = 2;

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
    record Response(String id, boolean success, JsonNode result, String errorCode, String errorMessage) {
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
                    error.path("message").asString("The extension reported an error."));
        }
    }

    /** A browser session as the extension reports it: one authorized tab bound to one agent. */
    record Session(String sessionId, String clientId, String authorizationId, String origin, int tabId, int frameId,
            String documentId, String mode, int generation, String state, String title, String url) {
        static Session parse(JsonNode n) {
            return new Session(n.path("session").asString(""), n.path("clientId").asString(""),
                    n.path("authorizationId").asString(""), n.path("origin").asString(""), n.path("tabId").asInt(-1),
                    n.path("frameId").asInt(0), n.path("documentId").asString(""), n.path("mode").asString("read"),
                    n.path("generation").asInt(0), n.path("state").asString("active"),
                    n.path("tab").path("title").asString(""), n.path("tab").path("url").asString(""));
        }
    }

    /** Coarse error class for logs and diagnostics. */
    static String category(String code) {
        return switch (code) {
            case "NOT_AUTHORIZED", "PAUSED", "WRITE_NOT_AUTHORIZED", "EXPLORE_NOT_AUTHORIZED", "SESSION_NOT_OWNED",
                    "SESSION_REQUIRED", "UNKNOWN_SESSION", "AUTHORIZATION_EXPIRED", "SUBMIT_INTENT_REQUIRED",
                    "SUBMIT_DENIED", "SUBMIT_NOT_CONFIRMED" -> "AUTHORIZATION";
            case "ORIGIN_MISMATCH", "NAVIGATION_BLOCKED" -> "SCOPE";
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
