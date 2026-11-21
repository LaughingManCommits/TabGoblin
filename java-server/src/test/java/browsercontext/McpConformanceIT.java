package browsercontext;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Drives the built jar the way an MCP client does, over its standard input and output, and checks
 * what the specification asks of a server on the stdio transport that offers tools.
 *
 * <p>No browser is involved: the extension is not connected, so tools that need a page answer
 * with an error result. That is enough to see the protocol. What the tools do in a browser, and
 * the cancellation of a call that is running there, is covered by the end-to-end suite.
 */
class McpConformanceIT {

    private static final Path JAR = Path.of(System.getProperty("server.jar", "target/browser-context-mcp.jar"));
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String NEWEST_WITH_HANDSHAKE = "2025-11-25";

    /** One running server, and the client's end of its pipes. */
    private static final class Server implements AutoCloseable {
        final Process process;
        final BufferedWriter input;
        /** Every line the server wrote to its standard output, in order. */
        final List<String> written = new CopyOnWriteArrayList<>();
        private final BlockingQueue<String> unread = new LinkedBlockingQueue<>();
        private final int port = freePort();
        private final Path tokenFile;

        Server(String... arguments) throws IOException {
            tokenFile = Files.createTempDirectory("bcmcp-conformance").resolve("token");
            List<String> command = new ArrayList<>(List.of(
                    Path.of(System.getProperty("java.home"), "bin", "java").toString(), "-jar", JAR.toString()));
            if (arguments.length == 0) {
                command.addAll(List.of("--port", String.valueOf(port), "--token-file", tokenFile.toString(),
                        "--extension-origin", FakeExtension.ORIGIN));
            } else {
                command.addAll(List.of(arguments));
            }
            process = new ProcessBuilder(command).redirectError(ProcessBuilder.Redirect.DISCARD).start();
            input = new BufferedWriter(new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8));
            Thread reader = new Thread(() -> {
                try (BufferedReader out = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
                    for (String line = out.readLine(); line != null; line = out.readLine()) {
                        written.add(line);
                        unread.add(line);
                    }
                } catch (IOException e) {
                    // the process went away
                }
            }, "conformance-reader");
            reader.setDaemon(true);
            reader.start();
        }

        void send(String message) throws IOException {
            input.write(message);
            input.write('\n');
            input.flush();
        }

        /** Sends a request and returns the response that carries its id. */
        JsonNode request(int id, String method, String params) throws Exception {
            send("{\"jsonrpc\":\"2.0\",\"id\":" + id + ",\"method\":\"" + method + "\"" + (params == null ? "" : ",\"params\":" + params) + "}");
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(40);
            while (System.nanoTime() < deadline) {
                String line = unread.poll(200, TimeUnit.MILLISECONDS);
                if (line == null) {
                    continue;
                }
                JsonNode message = JSON.readTree(line);
                if (message.path("id").asInt(-1) == id && (message.has("result") || message.has("error"))) {
                    return message;
                }
            }
            return fail("no response to " + method + " (id " + id + ") within 40 seconds");
        }

        JsonNode handshake(String version) throws Exception {
            JsonNode response = request(1, "initialize", "{\"protocolVersion\":\"" + version
                    + "\",\"capabilities\":{},\"clientInfo\":{\"name\":\"conformance\",\"version\":\"1\"}}");
            send("{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}");
            return response;
        }

        /** Connects the way the extension does, with the token the server made for itself. */
        FakeExtension browser() throws Exception {
            for (int i = 0; i < 100 && !Files.exists(tokenFile); i++) {
                Thread.sleep(100);
            }
            return FakeExtension.paired(port, Files.readString(tokenFile).trim());
        }

        /** Closes the server's input, as a client does to end it, and returns its exit code. */
        int endOfInput() throws Exception {
            input.close();
            assertTrue(process.waitFor(10, TimeUnit.SECONDS), "the server must exit when its input is closed");
            return process.exitValue();
        }

        @Override
        public void close() {
            process.destroyForcibly();
        }

        private static int freePort() throws IOException {
            try (ServerSocket socket = new ServerSocket(0)) {
                return socket.getLocalPort();
            }
        }
    }

    @Test
    void handshakeListCallAndExit() throws Exception {
        try (Server server = new Server()) {
            JsonNode hello = server.handshake(NEWEST_WITH_HANDSHAKE).path("result");
            assertEquals(NEWEST_WITH_HANDSHAKE, hello.path("protocolVersion").asString());
            assertEquals("browser-context-mcp", hello.path("serverInfo").path("name").asString(), "the name clients have configured");
            assertEquals("TabGoblin", hello.path("serverInfo").path("title").asString(), "the product's name, for display");
            assertEquals(System.getProperty("server.version"), hello.path("serverInfo").path("version").asString(),
                    "the version of the build, not one typed into the code");
            assertTrue(hello.path("capabilities").has("tools"), "it offers tools");
            assertFalse(hello.path("capabilities").path("tools").path("listChanged").asBoolean(true),
                    "and says that the list of tools does not change");
            assertFalse(hello.path("instructions").asString("").isEmpty());

            assertTrue(server.request(2, "ping", null).path("result").isObject(), "ping is answered with an empty result");

            JsonNode tools = server.request(3, "tools/list", null).path("result").path("tools");
            assertEquals(11, tools.size());
            for (JsonNode tool : tools) {
                String name = tool.path("name").asString();
                assertTrue(name.matches("browser_[a-z_]+"), name);
                assertFalse(tool.path("title").asString("").isEmpty(), name + " has a title for display");
                assertFalse(tool.path("description").asString("").isEmpty(), name + " is described");
                assertEquals("object", tool.path("inputSchema").path("type").asString(), name + " has an input schema");
                assertTrue(tool.path("annotations").has("readOnlyHint"), name + " says whether it only reads");
            }

            // A tool that fails answers with a result that says so, not with a protocol error.
            JsonNode failed = server.request(4, "tools/call", "{\"name\":\"browser_snapshot\",\"arguments\":{}}");
            assertTrue(failed.has("result"), failed.toString());
            assertTrue(failed.path("result").path("isError").asBoolean(), "no browser is connected: an error result");
            assertEquals("text", failed.path("result").path("content").path(0).path("type").asString());

            // A tool that does not exist is the caller's mistake: a protocol error.
            JsonNode unknown = server.request(5, "tools/call", "{\"name\":\"no_such_tool\",\"arguments\":{}}");
            assertEquals(-32602, unknown.path("error").path("code").asInt(), unknown.toString());

            JsonNode noMethod = server.request(6, "no/such/method", null);
            assertEquals(-32601, noMethod.path("error").path("code").asInt(), noMethod.toString());

            assertEquals(0, server.endOfInput(), "a server whose input was closed exits cleanly");

            // Standard output carries protocol messages and nothing else, one to a line.
            assertFalse(server.written.isEmpty());
            for (String line : server.written) {
                JsonNode message = JSON.readTree(line);
                assertEquals("2.0", message.path("jsonrpc").asString(), "not a protocol message: " + line);
            }
        }
    }

    @Test
    void theRevisionIsNegotiated() throws Exception {
        try (Server older = new Server()) {
            assertEquals("2024-11-05", older.handshake("2024-11-05").path("result").path("protocolVersion").asString(),
                    "a revision the server knows is taken as asked");
        }
        try (Server unknown = new Server()) {
            assertEquals(NEWEST_WITH_HANDSHAKE, unknown.handshake("2099-01-01").path("result").path("protocolVersion").asString(),
                    "for one it does not know it answers with the newest it does");
        }
    }

    /** A call the client gives up on is stopped where it runs: in the browser. */
    @Test
    void aCancelledCallIsStoppedInTheBrowser() throws Exception {
        try (Server server = new Server()) {
            server.handshake(NEWEST_WITH_HANDSHAKE);
            FakeExtension browser = server.browser();
            browser.responder = command -> null; // a page that takes its time
            server.send("{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"tools/call\",\"params\":{\"name\":\"browser_snapshot\",\"arguments\":{}}}");
            await(() -> !browser.commands.isEmpty(), "the call to reach the browser");
            String running = browser.commands.get(0).path("id").asString();

            server.send("{\"jsonrpc\":\"2.0\",\"method\":\"notifications/cancelled\",\"params\":{\"requestId\":7,\"reason\":\"stopped by the user\"}}");
            await(() -> browser.cancels.contains(running), "the browser to be told to stop");

            // The client gave the call up, so no answer is sent for it; the next request is served as usual.
            assertTrue(server.request(8, "ping", null).path("result").isObject());
            Thread.sleep(1500);
            for (String line : server.written) {
                assertNotEquals(7, JSON.readTree(line).path("id").asInt(-1), "an answer to the cancelled call: " + line);
            }
            browser.close();
        }
    }

    /** A client that sends a progress token is told that a long call is still running; another is not. */
    @Test
    void aLongCallReportsProgressOnlyWhenTheClientAsks() throws Exception {
        try (Server server = new Server()) {
            server.handshake(NEWEST_WITH_HANDSHAKE);
            FakeExtension browser = server.browser();
            browser.responder = command -> null; // a submission waiting for the user, say
            server.send("{\"jsonrpc\":\"2.0\",\"id\":9,\"method\":\"tools/call\",\"params\":{\"name\":\"browser_snapshot\",\"arguments\":{},"
                    + "\"_meta\":{\"progressToken\":\"p-1\"}}}");
            await(() -> progress(server).size() >= 2, "two progress notifications");
            List<JsonNode> told = progress(server);
            for (JsonNode notification : told) {
                assertEquals("p-1", notification.path("params").path("progressToken").asString(), "the client's own token");
                assertFalse(notification.path("params").path("message").asString("").isEmpty(), "with words a person can read");
            }
            assertTrue(told.get(1).path("params").path("progress").asDouble() > told.get(0).path("params").path("progress").asDouble(),
                    "the value increases");

            // The call ends, here because the client gives it up: nothing more is reported for it.
            server.send("{\"jsonrpc\":\"2.0\",\"method\":\"notifications/cancelled\",\"params\":{\"requestId\":9}}");
            await(() -> !browser.cancels.isEmpty(), "the browser to be told to stop");
            assertTrue(server.request(10, "ping", null).path("result").isObject());
            int reported = progress(server).size();

            // A call without a token runs as long, and is not reported on.
            server.send("{\"jsonrpc\":\"2.0\",\"id\":11,\"method\":\"tools/call\",\"params\":{\"name\":\"browser_snapshot\",\"arguments\":{}}}");
            Thread.sleep(Progress.EVERY_MS + 1500);
            assertEquals(reported, progress(server).size(), "no progress after the call ended, and none unasked");
            browser.close();
        }
    }

    private static List<JsonNode> progress(Server server) {
        List<JsonNode> found = new ArrayList<>();
        for (String line : server.written) {
            JsonNode message = JSON.readTree(line);
            if (message.path("method").asString("").equals("notifications/progress")) {
                found.add(message);
            }
        }
        return found;
    }

    /** The server ends in order: the browser is told, instead of finding the connection gone. */
    @Test
    void endOfInputClosesTheConnectionToTheBrowserInOrder() throws Exception {
        try (Server server = new Server()) {
            server.handshake(NEWEST_WITH_HANDSHAKE);
            FakeExtension browser = server.browser();
            assertEquals(0, server.endOfInput());
            assertEquals(1001, browser.closed.get(10, TimeUnit.SECONDS), "the close code for \"going away\"");
        }
    }

    private static void await(java.util.function.BooleanSupplier condition, String what) throws InterruptedException {
        for (int i = 0; i < 100; i++) {
            if (condition.getAsBoolean()) {
                return;
            }
            Thread.sleep(100);
        }
        fail("timed out waiting for " + what);
    }

    @Test
    void aMistypedCommandDoesNotStartAServer() throws Exception {
        try (Server server = new Server("--show-tokn")) {
            assertTrue(server.process.waitFor(10, TimeUnit.SECONDS), "it must not sit there waiting for a client");
            assertEquals(2, server.process.exitValue());
            assertTrue(server.written.isEmpty(), "and writes nothing where a client would read: " + server.written);
        }
    }

    /**
     * A client of the 2026-07-28 revision starts with {@code server/discover} instead of a
     * handshake. That revision tells it to take any error but "unsupported protocol version"
     * as the sign of a server of the earlier revisions, and to fall back to the handshake.
     */
    @Test
    void aClientOfTheNewerRevisionIsToldToFallBack() throws Exception {
        try (Server server = new Server()) {
            JsonNode probe = server.request(1, "server/discover", "{\"_meta\":{"
                    + "\"io.modelcontextprotocol/protocolVersion\":\"2026-07-28\","
                    + "\"io.modelcontextprotocol/clientCapabilities\":{}}}");
            assertTrue(probe.has("error"), probe.toString());
            assertNotEquals(-32022, probe.path("error").path("code").asInt(),
                    "\"unsupported protocol version\" would tell the client not to fall back");
            // And the handshake still works on the same connection afterwards.
            assertEquals(NEWEST_WITH_HANDSHAKE, server.handshake(NEWEST_WITH_HANDSHAKE).path("result").path("protocolVersion").asString());
        }
    }
}
