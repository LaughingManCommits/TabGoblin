package browsercontext;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayInputStream;
import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Client-side cancellation and end-of-input detection on the MCP input stream. */
class StdinTapTest {

    static final ObjectMapper JSON = new ObjectMapper();

    private static StdinTap tap(String input, Runnable onEnd) throws Exception {
        StdinTap tap = new StdinTap(new ByteArrayInputStream(input.getBytes(StandardCharsets.UTF_8)), onEnd);
        byte[] original = input.getBytes(StandardCharsets.UTF_8);
        assertEquals(input, new String(tap.readAllBytes(), StandardCharsets.UTF_8), "bytes must pass through untouched");
        assertEquals(original.length, input.getBytes(StandardCharsets.UTF_8).length);
        return tap;
    }

    private static String call(Object id, String tool, String arguments) {
        return "{\"jsonrpc\":\"2.0\",\"id\":" + id + ",\"method\":\"tools/call\",\"params\":{\"name\":\"" + tool
                + "\",\"arguments\":" + arguments + "}}\n";
    }

    private static String cancel(Object id) {
        return "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/cancelled\",\"params\":{\"requestId\":" + id + "}}\n";
    }

    private static ObjectNode args(String key, int value) {
        return JSON.createObjectNode().put(key, value);
    }

    @Test
    void passesInputThroughAndReportsItsEnd() throws Exception {
        AtomicBoolean ended = new AtomicBoolean();
        tap("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\"}\n" + call(2, "browser_click", "{\"ref\":4}"),
                () -> ended.set(true));
        assertTrue(ended.get());
    }

    @Test
    void anInputThatBreaksIsAnInputThatEnded() {
        // A pipe or a socket whose other side was ended at once gives an error, not the end. The
        // one who waits for the end is told all the same, and the error goes on to the reader.
        AtomicBoolean ended = new AtomicBoolean();
        var broken = new java.io.InputStream() {
            @Override
            public int read() throws java.io.IOException {
                throw new java.io.IOException("Connection reset");
            }
        };
        StdinTap tap = new StdinTap(broken, () -> ended.set(true));
        org.junit.jupiter.api.Assertions.assertThrows(java.io.IOException.class, () -> tap.read(new byte[16], 0, 16));
        assertTrue(ended.get());
        ended.set(false);
        org.junit.jupiter.api.Assertions.assertThrows(java.io.IOException.class, tap::read);
        assertTrue(ended.get());
    }

    @Test
    void theClientsNameIsTakenFromItsOpeningMessage() throws Exception {
        var names = new java.util.ArrayList<String>();
        String opening = "{\"jsonrpc\":\"2.0\",\"id\":0,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-11-25\","
                + "\"capabilities\":{},\"clientInfo\":{\"name\":\"claude-code\",\"version\":\"1.0\"}}}\n";
        // What follows it is no opening message, though the word is in it.
        String input = opening
                + "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}\n"
                + "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{\"note\":\"initialize\",\"clientInfo\":{\"name\":\"not this\"}}}\n"
                + call(2, "browser_status", "{}");
        StdinTap tap = new StdinTap(new ByteArrayInputStream(input.getBytes(StandardCharsets.UTF_8)), () -> { }, names::add);
        assertEquals(input, new String(tap.readAllBytes(), StandardCharsets.UTF_8), "bytes must pass through untouched");
        // Known before any tool is called: a server that was started again gets its tabs back by this name.
        assertEquals(java.util.List.of("claude-code"), names);

        // A client that gives no name, or something that is not a message, names nobody.
        names.clear();
        String nameless = "{\"jsonrpc\":\"2.0\",\"id\":0,\"method\":\"initialize\",\"params\":{\"clientInfo\":{\"name\":\"  \"}}}\n"
                + "{\"jsonrpc\":\"2.0\",\"id\":0,\"method\":\"initialize\",\"params\":{}}\n"
                + "this is not json but says \"initialize\"\n";
        new StdinTap(new ByteArrayInputStream(nameless.getBytes(StandardCharsets.UTF_8)), () -> { }, names::add).readAllBytes();
        assertEquals(java.util.List.of(), names);
    }

    @Test
    void matchesHandlersToCallsByToolAndArgumentsOldestFirst() throws Exception {
        StdinTap tap = tap(call(7, "browser_click", "{\"ref\":4}") + call(8, "browser_fill", "{\"ref\":4}")
                + call("\"abc\"", "browser_click", "{\"ref\":9}") + call(10, "browser_click", "{\"ref\":4}"), () -> { });
        assertEquals("abc", tap.begin("browser_click", args("ref", 9)));
        assertEquals("7", tap.begin("browser_click", args("ref", 4)));
        assertEquals("10", tap.begin("browser_click", args("ref", 4)));
        assertEquals("8", tap.begin("browser_fill", args("ref", 4)));
        assertNull(tap.begin("browser_click", args("ref", 4)), "each call is claimed once");
        assertNull(tap.begin("browser_scroll", JSON.createObjectNode()));
    }

    @Test
    void aCallWithoutArgumentsMatchesAnEmptyObject() throws Exception {
        StdinTap tap = tap("{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"browser_status\"}}\n", () -> { });
        assertEquals("3", tap.begin("browser_status", JSON.createObjectNode()));
    }

    @Test
    void aCancelNotificationInterruptsTheRunningCall() throws Exception {
        PipedOutputStream client = new PipedOutputStream();
        StdinTap tap = new StdinTap(new PipedInputStream(client, 65536), () -> { });
        Thread reader = new Thread(() -> {
            try {
                tap.readAllBytes();
            } catch (Exception e) {
                // stream closed at the end of the test
            }
        });
        reader.setDaemon(true);
        reader.start();

        client.write(call(21, "browser_wait_for", "{\"ref\":1}").getBytes(StandardCharsets.UTF_8));
        client.flush();
        CompletableFuture<String> outcome = CompletableFuture.supplyAsync(() -> {
            String id = null;
            for (int i = 0; i < 100 && id == null; i++) {
                id = tap.begin("browser_wait_for", args("ref", 1));
                if (id == null) {
                    sleep(20);
                }
            }
            try {
                Thread.sleep(Duration.ofSeconds(20).toMillis());
                return "ran to completion";
            } catch (InterruptedException e) {
                return "interrupted " + id;
            } finally {
                tap.end(id);
            }
        });
        Thread.sleep(300);
        client.write(cancel(99).getBytes(StandardCharsets.UTF_8)); // some other request: no effect
        client.write(cancel(21).getBytes(StandardCharsets.UTF_8));
        client.flush();
        assertEquals("interrupted 21", outcome.get(5, TimeUnit.SECONDS));
        client.close();
    }

    @Test
    void aCallCancelledBeforeItsHandlerStartsIsInterruptedAtOnceAndTheFlagIsCleared() throws Exception {
        StdinTap tap = tap(call(5, "browser_click", "{\"ref\":4}") + cancel(5), () -> { });
        String id = tap.begin("browser_click", args("ref", 4));
        assertEquals("5", id);
        assertTrue(Thread.currentThread().isInterrupted(), "the handler should find itself cancelled");
        tap.end(id);
        assertFalse(Thread.currentThread().isInterrupted(), "the pooled thread must be clean for the next call");
    }

    @Test
    void garbageAndUnrelatedMessagesAreIgnored() throws Exception {
        StdinTap tap = tap("not json \"tools/call\"\n{\"method\":\"notifications/cancelled\"}\n"
                + "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}\n", () -> { });
        assertNull(tap.begin("browser_click", args("ref", 4)));
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
