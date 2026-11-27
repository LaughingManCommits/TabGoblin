package tabgoblin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PrintStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * A process whose setup names no port finds the server that runs on a port of another agent's
 * setup, and starts no second one beside it. The file that says where is trusted for nothing:
 * a line is used only where a server answers, and a process that names a port looks nowhere else.
 */
class RunningServersTest {

    private static final String TOKEN = WebSocketBridgeTest.TOKEN;
    private final List<AutoCloseable> open = new ArrayList<>();

    @AfterEach
    void close() throws Exception {
        for (AutoCloseable one : open) {
            one.close();
        }
    }

    private static InetAddress loopback() throws IOException {
        return InetAddress.getByAddress(new byte[] {127, 0, 0, 1});
    }

    /** A first port from which nine ports in a row are free, outside the list every part knows. */
    private static int freeRange() throws IOException {
        for (int attempt = 0; attempt < 50; attempt++) {
            int first = 20_000 + (int) (Math.random() * 5_000);
            boolean free = true;
            for (int i = 0; i <= McpMain.PORT_RANGE && free; i++) {
                try (ServerSocket probe = new ServerSocket(first + i, 1, loopback())) {
                    probe.setReuseAddress(true);
                } catch (IOException e) {
                    free = false;
                }
            }
            if (free) {
                return first;
            }
        }
        throw new IOException("no nine free ports in a row");
    }

    private Hub server(int first) throws IOException {
        Hub hub = Hub.open(new Agent.Settings(first, () -> TOKEN, FakeExtension.ORIGIN, () -> BlockedSites.Rule.NONE, null), true);
        open.add(hub::drop);
        Thread serving = new Thread(hub::serve, "test-hub");
        serving.setDaemon(true);
        serving.start();
        return hub;
    }

    @Test
    void aServerIsWrittenDownWhenItOpensAndTakenOutWhenItEnds(@TempDir Path folder) {
        Path token = folder.resolve("pairing-token");
        assertEquals(List.of(), RunningServers.read(token), "no file says none");

        RunningServers.add(token, 39821);
        RunningServers.add(token, 41000);
        RunningServers.add(token, 39821);
        assertEquals(List.of(39821, 41000), RunningServers.read(token), "the last to open first, and none twice");
        assertEquals(folder.resolve("servers"), RunningServers.file(token), "beside the pairing token");

        RunningServers.remove(token, 39821);
        assertEquals(List.of(41000), RunningServers.read(token));
        RunningServers.remove(token, 41000);
        assertFalse(Files.exists(RunningServers.file(token)), "nothing is left of a file that says nothing");
    }

    @Test
    void whatIsNotAPortIsNotRead(@TempDir Path folder) throws IOException {
        Path token = folder.resolve("pairing-token");
        Files.writeString(RunningServers.file(token), "39821\nhttp://example.com:80\n80\n70000\n65535\n -1\n39821\n\n40000 \n");
        assertEquals(List.of(39821, 40000), RunningServers.read(token),
                "only numbers that nine ports can begin at, each once");

        Files.writeString(RunningServers.file(token), "1\n".repeat(3) + "30001\n30002\n30003\n30004\n30005\n30006\n30007\n30008\n30009\n30010\n");
        assertEquals(8, RunningServers.read(token).size(), "and no more than a few");
    }

    @Test
    void aProcessWithoutAPortLooksAtARunningServerFirstAndOneWithAPortOnlyAtItsOwn() {
        List<Integer> written = List.of(39821, 41000, Ports.FIRST.get(1));
        List<Integer> expected = new ArrayList<>(List.of(39821));
        expected.addAll(Ports.FIRST);
        assertEquals(expected, RunningServers.firsts(McpMain.DEFAULT_PORT, false, written, port -> port == 39821),
                "the one that answers, before the list; one that does not answer is passed over, and one of the list is not named twice");
        assertEquals(Ports.FIRST, RunningServers.firsts(McpMain.DEFAULT_PORT, false, written, port -> false),
                "nothing answers: the list, as before");
        assertEquals(List.of(45000), RunningServers.firsts(45000, true, written, port -> true),
                "a setup that names a port means that port");
    }

    @Test
    void aServerThatHasNoBrowserNamesAnotherThatAnswersAndNeverItself() {
        List<Integer> written = List.of(McpMain.DEFAULT_PORT, 41000, 39821);
        assertEquals(39821, RunningServers.other(written, McpMain.DEFAULT_PORT, port -> port != 41000),
                "itself and one that does not answer are passed over");
        assertEquals(0, RunningServers.other(List.of(McpMain.DEFAULT_PORT), McpMain.DEFAULT_PORT, port -> true), "only itself");
        assertEquals(0, RunningServers.other(written, McpMain.DEFAULT_PORT, port -> false), "nothing answers");
    }

    @Test
    void onlyWhatAnswersAsTheServerDoesCounts() throws Exception {
        int first = freeRange();
        assertFalse(RunningServers.answers(first), "nobody listens there");

        // A program that holds the port and says nothing, as after a server that was ended by force.
        ServerSocket silent = new ServerSocket(Link.port(first), 1, loopback());
        open.add(silent);
        assertFalse(RunningServers.answers(first), "a program that is not the server");
        silent.close();

        server(first);
        assertTrue(RunningServers.answers(first), "the server opens with its hello");
    }

    @Test
    void aLinkWithoutAPortReachesTheServerOnAnotherAgentsPort(@TempDir Path folder) throws Exception {
        Path token = folder.resolve("pairing-token");
        int first = freeRange();
        Hub hub = server(first);
        RunningServers.add(token, first);

        List<Integer> ports = RunningServers.firsts(McpMain.DEFAULT_PORT, false, token).stream().map(Link::port).toList();
        assertEquals(hub.port(), ports.get(0), "the running server's port for links comes first");
        List<String> started = new ArrayList<>();
        Link link = new Link(InputStream.nullInputStream(), OutputStream.nullOutputStream(), new PrintStream(OutputStream.nullOutputStream()),
                () -> TOKEN, ports.subList(0, 1), false, true, () -> started.add("a second server"), null, null);
        assertTrue(link.show(), "the two proofs pass on that connection as on any other");
        assertEquals(List.of(), started, "and no second server is started");

        // The server is gone, and its line is still there: nothing answers, and the list is what is left.
        hub.drop();
        assertEquals(Ports.FIRST, RunningServers.firsts(McpMain.DEFAULT_PORT, false, token));
    }
}
