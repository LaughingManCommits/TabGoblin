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

    private static final long ME = ProcessHandle.current().pid();
    private static final RunningServers.Fit FIT = new RunningServers.Fit(Path.of("settings.properties").toAbsolutePath().toString(),
            FakeExtension.ORIGIN);
    private static final RunningServers.Fit OTHER = new RunningServers.Fit(Path.of("other.properties").toAbsolutePath().toString(),
            FakeExtension.ORIGIN);

    @Test
    void aServerIsWrittenDownWhenItOpensWithItsBrowserAndTakenOutWhenItEnds(@TempDir Path folder) throws IOException {
        Path token = folder.resolve("pairing-token");
        assertEquals(List.of(), RunningServers.read(token), "no folder says none");

        RunningServers.add(token, 39821, FIT);
        assertEquals(List.of(new RunningServers.Entry(39821, ME, false, FIT)), RunningServers.read(token),
                "its first port and its process, and no browser yet");
        assertEquals(folder.resolve("servers"), RunningServers.folder(token), "beside the pairing token");
        assertTrue(Files.isRegularFile(folder.resolve("servers").resolve("39821.json")), "a file of its own");

        RunningServers.write(token, 39821, true, FIT);
        assertEquals(List.of(new RunningServers.Entry(39821, ME, true, FIT)), RunningServers.read(token), "the browser came");
        RunningServers.add(token, 41000, FIT);
        assertEquals(2, RunningServers.read(token).size(), "a second server writes its own file and leaves the first alone");

        RunningServers.remove(token, 39821);
        assertEquals(List.of(new RunningServers.Entry(41000, ME, false, FIT)), RunningServers.read(token));
        RunningServers.remove(token, 41000);
        assertEquals(List.of(), RunningServers.read(token));
    }

    @Test
    void theOneFileOfAnEarlierBuildMakesWayForTheFolder(@TempDir Path folder) throws IOException {
        Path token = folder.resolve("pairing-token");
        Files.writeString(RunningServers.folder(token), "39821\n");
        assertEquals(List.of(), RunningServers.read(token), "a file there is not read");
        RunningServers.add(token, 41000, FIT);
        assertEquals(List.of(new RunningServers.Entry(41000, ME, false, FIT)), RunningServers.read(token));
    }

    @Test
    void whatIsNotAServersFileIsNotRead(@TempDir Path folder) throws IOException {
        Path token = folder.resolve("pairing-token");
        Path servers = Files.createDirectories(RunningServers.folder(token));
        Files.writeString(servers.resolve("39821.json"), "{\"first\":39821,\"pid\":1,\"browser\":true}");
        Files.writeString(servers.resolve("40000.json"), "{\"first\":39821,\"pid\":1,\"browser\":true}");
        Files.writeString(servers.resolve("80.json"), "{\"first\":80,\"pid\":1,\"browser\":true}");
        Files.writeString(servers.resolve("41000.json"), "{\"first\":41000,\"pid\":1,\"browser\":\"yes\"}");
        Files.writeString(servers.resolve("42000.json"), "not json");
        Files.writeString(servers.resolve("43000.txt"), "{\"first\":43000,\"pid\":1,\"browser\":true}");
        assertEquals(List.of(new RunningServers.Entry(39821, 1, true, new RunningServers.Fit("", ""))), RunningServers.read(token),
                "a name and a first port that agree, a port nine ports can begin at, and a browser that is yes or no");

        for (int first = 30001; first <= 30010; first++) {
            Files.writeString(servers.resolve(first + ".json"), "{\"first\":" + first + ",\"pid\":1,\"browser\":false}");
        }
        assertEquals(8, RunningServers.read(token).size(), "and no more than a few");
    }

    @Test
    void aServerThatOpensTakesOutTheFilesOfServersWhoseProcessIsGone(@TempDir Path folder) throws IOException {
        Path token = folder.resolve("pairing-token");
        Path servers = Files.createDirectories(RunningServers.folder(token));
        long gone = Long.MAX_VALUE / 2;
        Files.writeString(servers.resolve("39821.json"), "{\"first\":39821,\"pid\":" + gone + ",\"browser\":true}");
        assertFalse(RunningServers.alive(gone));
        RunningServers.add(token, 41000, FIT);
        assertEquals(List.of(new RunningServers.Entry(41000, ME, false, FIT)), RunningServers.read(token));
    }

    @Test
    void aProcessWithoutAPortGoesToTheServerWithTheBrowserFirstAndOneWithAPortOnlyToItsOwn() {
        List<RunningServers.Entry> written = List.of(
                new RunningServers.Entry(39821, 1, false, FIT),
                new RunningServers.Entry(41000, 2, true, FIT),
                new RunningServers.Entry(Ports.FIRST.get(0), 3, true, FIT),
                new RunningServers.Entry(42000, 4, false, FIT));
        java.util.function.LongPredicate alive = pid -> pid != 2;
        List<Integer> expected = new ArrayList<>(List.of(Ports.FIRST.get(0), 39821));
        expected.addAll(Ports.FIRST.subList(1, Ports.FIRST.size()));
        assertEquals(expected, RunningServers.firsts(McpMain.DEFAULT_PORT, false, written, port -> port != 42000, alive, FIT),
                "the one with the browser first, even one of the list; then the others that run; a process that is gone "
                        + "and a port where nothing answers are passed over; then the list, nothing twice");
        assertEquals(Ports.FIRST, RunningServers.firsts(McpMain.DEFAULT_PORT, false, written, port -> false, alive, FIT),
                "nothing answers: the list, as before");
        assertEquals(List.of(45000), RunningServers.firsts(45000, true, written, port -> true, alive, OTHER),
                "a setup that names a port and other settings than every server with the browser: that port");
    }

    @Test
    void aProcessWithAPortGoesToTheServerWithTheBrowserOnlyWhereThatRunsAsItsSetupAsks() {
        List<RunningServers.Entry> written = List.of(
                new RunningServers.Entry(39821, 1, false, FIT),
                new RunningServers.Entry(41000, 2, true, FIT),
                new RunningServers.Entry(42000, 3, true, OTHER));
        assertEquals(List.of(41000, 45000), RunningServers.firsts(45000, true, written, port -> true, pid -> true, FIT),
                "the server with the browser and the same settings first, then its own port, on which it starts one");
        assertEquals(List.of(42000, 45000), RunningServers.firsts(45000, true, written, port -> true, pid -> true, OTHER),
                "the same for the other settings");
        assertEquals(List.of(45000), RunningServers.firsts(45000, true, written, port -> port != 41000, pid -> true, FIT),
                "one that does not answer is passed over");
        assertEquals(List.of(45000), RunningServers.firsts(45000, true, written, port -> true, pid -> pid != 2, FIT),
                "and one whose process is gone");
        assertEquals(List.of(45000), RunningServers.firsts(45000, true, written, port -> true, pid -> true,
                new RunningServers.Fit(FIT.settings(), "chrome-extension://another")), "another extension is other settings");
        List<RunningServers.Entry> ownHasIt = List.of(new RunningServers.Entry(45000, 5, true, FIT), written.get(1));
        assertEquals(List.of(45000), RunningServers.firsts(45000, true, ownHasIt, port -> true, pid -> true, FIT),
                "the browser is at its own port's server: that one alone");
        assertEquals(List.of(41000, 45000), RunningServers.firsts(45000, true, ownHasIt, port -> true, pid -> pid != 5, FIT),
                "the file of its own port is of a server that is gone: it is not what keeps the process from the other");
        List<RunningServers.Entry> noFit = List.of(new RunningServers.Entry(41000, 2, true, new RunningServers.Fit("", "")));
        assertEquals(List.of(45000), RunningServers.firsts(45000, true, noFit, port -> true, pid -> true, FIT),
                "a file that does not say what its server runs under is not taken to be the same");
    }

    @Test
    void theSameSettingsAreTheSameFileAndTheSameExtension() {
        String file = Path.of("a", "..", "settings.properties").toAbsolutePath().toString();
        assertTrue(RunningServers.Fit.of(Path.of(file), FakeExtension.ORIGIN).sameAs(FIT), "a path is compared as the system reads it");
        assertFalse(FIT.sameAs(OTHER));
        assertFalse(FIT.sameAs(null));
        assertFalse(new RunningServers.Fit("", FakeExtension.ORIGIN).sameAs(new RunningServers.Fit("", FakeExtension.ORIGIN)),
                "nothing said is not the same");
    }

    @Test
    void aServerThatHasNoBrowserNamesAnotherThatHasItAndAnswersAndNeverItself() {
        List<RunningServers.Entry> written = List.of(
                new RunningServers.Entry(McpMain.DEFAULT_PORT, 1, true, FIT),
                new RunningServers.Entry(41000, 2, true, FIT),
                new RunningServers.Entry(42000, 3, false, FIT),
                new RunningServers.Entry(39821, 4, true, OTHER));
        assertEquals(new BrowserService.Elsewhere(39821, false),
                RunningServers.other(written, McpMain.DEFAULT_PORT, port -> port != 41000, pid -> true, FIT),
                "itself, one that does not answer and one without the browser are passed over; its settings are other");
        assertEquals(new BrowserService.Elsewhere(41000, true),
                RunningServers.other(written, McpMain.DEFAULT_PORT, port -> true, pid -> true, FIT), "the same settings");
        assertEquals(null, RunningServers.other(written, McpMain.DEFAULT_PORT, port -> true, pid -> pid == 1 || pid == 3, FIT),
                "the processes of the others are gone");
        assertEquals(null, RunningServers.other(written, McpMain.DEFAULT_PORT, port -> false, pid -> true, FIT), "nothing answers");
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
        RunningServers.add(token, first, FIT);

        List<Integer> ports = RunningServers.firsts(McpMain.DEFAULT_PORT, false, token, FIT).stream().map(Link::port).toList();
        assertEquals(hub.port(), ports.get(0), "the running server's port for links comes first");
        List<String> started = new ArrayList<>();
        Link link = new Link(InputStream.nullInputStream(), OutputStream.nullOutputStream(), new PrintStream(OutputStream.nullOutputStream()),
                () -> TOKEN, ports.subList(0, 1), false, true, () -> started.add("a second server"), null, null);
        assertTrue(link.show(), "the two proofs pass on that connection as on any other");
        assertEquals(List.of(), started, "and no second server is started");

        // The server is gone, and its file is still there: nothing answers, and the list is what is left.
        hub.drop();
        assertEquals(Ports.FIRST, RunningServers.firsts(McpMain.DEFAULT_PORT, false, token, FIT));
    }
}
