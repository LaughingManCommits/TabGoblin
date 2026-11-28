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

    private static final RunningServers.Fit FIT = new RunningServers.Fit(Path.of("settings.properties").toAbsolutePath().toString(),
            FakeExtension.ORIGIN);
    private static final RunningServers.Fit OTHER = new RunningServers.Fit(Path.of("other.properties").toAbsolutePath().toString(),
            FakeExtension.ORIGIN);

    @Test
    void aServerIsWrittenDownWhenItOpensWithItsBrowserAndTakenOutWhenItEnds(@TempDir Path folder) throws IOException {
        Path token = folder.resolve("pairing-token");
        assertEquals(List.of(), RunningServers.read(token), "no folder says none");

        RunningServers.add(token, 39821, FIT);
        assertEquals(List.of(new RunningServers.Entry(39821, false, FIT)), RunningServers.read(token),
                "its first port and what it runs under, and no browser yet");
        assertEquals(folder.resolve("servers"), RunningServers.folder(token), "beside the pairing token");
        assertTrue(Files.isRegularFile(folder.resolve("servers").resolve("39821.json")), "a file of its own");

        assertTrue(RunningServers.write(token, 39821, true, FIT));
        assertEquals(List.of(new RunningServers.Entry(39821, true, FIT)), RunningServers.read(token), "the browser came");
        assertEquals(List.of(), Files.list(folder.resolve("servers")).filter(file -> file.toString().endsWith(".tmp")).toList(),
                "nothing is left of the writing");
        assertTrue(RunningServers.write(token, 41000, true, FIT));
        assertEquals(2, RunningServers.read(token).size(), "a second server writes its own file and leaves the first alone");

        RunningServers.remove(token, 39821);
        assertEquals(List.of(new RunningServers.Entry(41000, true, FIT)), RunningServers.read(token));
        RunningServers.remove(token, 41000);
        assertEquals(List.of(), RunningServers.read(token));
    }

    @Test
    void aFileThatCannotBeWrittenSaysSoAndLeavesWhatWasThere(@TempDir Path folder) throws IOException {
        Path token = folder.resolve("pairing-token");
        RunningServers.add(token, 39821, FIT);
        // The file's place is taken by a folder: nothing can be moved onto it.
        Path file = folder.resolve("servers").resolve("39821.json");
        Files.delete(file);
        Files.createDirectories(file.resolve("held"));
        assertFalse(RunningServers.write(token, 39821, true, FIT), "the server is told, and tells it again at its next look");
        assertFalse(Files.exists(folder.resolve("servers").resolve("39821.json.tmp")), "and leaves nothing half written");
    }

    @Test
    void twoTokenFilesInOneFolderAreTwoTabGoblinsWhoseServersDoNotSeeEachOther(@TempDir Path folder) throws IOException {
        // As the end-to-end suite has it: a second server with a token of its own, beside the first's.
        Path token = folder.resolve("pairing-token");
        Path other = folder.resolve("window-token");
        RunningServers.add(token, 39821, FIT);
        assertTrue(RunningServers.write(token, 39821, true, FIT));
        assertEquals(List.of(), RunningServers.read(other), "the other token's process sees no server");
        assertEquals(List.of(45000), RunningServers.firsts(45000, true, other, FIT),
                "and starts its own, on its port, though the first's server has the browser and the same settings");
        assertEquals(null, RunningServers.other(other, 45000, FIT), "and is not told of the first's server");

        RunningServers.add(other, 45000, FIT);
        assertEquals(List.of(new RunningServers.Entry(39821, true, FIT)), RunningServers.read(token),
                "the first token's process sees its own server only, and the other's opening did not take it out");
        assertEquals(List.of(new RunningServers.Entry(45000, false, FIT)), RunningServers.read(other));
        assertEquals(2, Files.list(folder.resolve("servers")).count(), "both files are in the one folder");

        Files.writeString(folder.resolve("servers").resolve("41000.json"), "{\"first\":41000,\"browser\":true}");
        assertEquals(List.of(new RunningServers.Entry(39821, true, FIT)), RunningServers.read(token),
                "a file that names no token is nobody's");
    }

    @Test
    void theOneFileOfAnEarlierBuildMakesWayForTheFolder(@TempDir Path folder) throws IOException {
        Path token = folder.resolve("pairing-token");
        Files.writeString(RunningServers.folder(token), "39821\n");
        assertEquals(List.of(), RunningServers.read(token), "a file there is not read");
        RunningServers.add(token, 41000, FIT);
        assertEquals(List.of(new RunningServers.Entry(41000, false, FIT)), RunningServers.read(token));
    }

    @Test
    void whatIsNotAServersFileIsNotRead(@TempDir Path folder) throws IOException {
        Path token = folder.resolve("pairing-token");
        Path servers = Files.createDirectories(RunningServers.folder(token));
        String mine = ",\"token\":" + "\"" + token.toAbsolutePath().toString().replace("\\", "\\\\") + "\"";
        Files.writeString(servers.resolve("39821.json"), "{\"first\":39821,\"browser\":true" + mine + "}");
        Files.writeString(servers.resolve("40000.json"), "{\"first\":39821,\"browser\":true" + mine + "}");
        Files.writeString(servers.resolve("80.json"), "{\"first\":80,\"browser\":true" + mine + "}");
        Files.writeString(servers.resolve("41000.json"), "{\"first\":41000,\"browser\":\"yes\"" + mine + "}");
        Files.writeString(servers.resolve("42000.json"), "not json");
        Files.writeString(servers.resolve("43000.txt"), "{\"first\":43000,\"browser\":true" + mine + "}");
        Files.writeString(servers.resolve("44000.json.tmp"), "{\"first\":44000,\"browser\":true" + mine + "}");
        assertEquals(List.of(new RunningServers.Entry(39821, true, new RunningServers.Fit("", ""))), RunningServers.read(token),
                "a name and a first port that agree, a port nine ports can begin at, and a browser that is yes or no");

        for (int first = 30001; first <= 30010; first++) {
            Files.writeString(servers.resolve(first + ".json"), "{\"first\":" + first + ",\"browser\":false" + mine + "}");
        }
        assertEquals(8, RunningServers.read(token).size(), "and no more than a few");
    }

    @Test
    void aServerThatOpensTakesOutTheFilesOfServersThatNoLongerAnswer(@TempDir Path folder) throws Exception {
        Path token = folder.resolve("pairing-token");
        int gone = freeRange();
        int running = freeRange();
        server(running);
        assertTrue(RunningServers.write(token, gone, true, FIT));
        assertTrue(RunningServers.write(token, running, false, FIT));
        assertEquals(2, RunningServers.read(token).size());
        RunningServers.add(token, 41000, FIT);
        assertEquals(List.of(41000, running), RunningServers.read(token).stream().map(RunningServers.Entry::first).toList(),
                "the file of the server that answers stays, the other is taken out; a process id would say nothing here");
    }

    @Test
    void aProcessWithoutAPortGoesToTheServerWithTheBrowserFirstAndOneWithAPortOnlyToItsOwn() {
        List<RunningServers.Entry> written = List.of(
                new RunningServers.Entry(39821, false, FIT),
                new RunningServers.Entry(41000, true, FIT),
                new RunningServers.Entry(Ports.FIRST.get(0), true, FIT),
                new RunningServers.Entry(42000, false, FIT));
        List<Integer> expected = new ArrayList<>(List.of(41000, Ports.FIRST.get(0), 39821));
        expected.addAll(Ports.FIRST.subList(1, Ports.FIRST.size()));
        assertEquals(expected, RunningServers.firsts(McpMain.DEFAULT_PORT, false, written, port -> port != 42000, FIT),
                "those with the browser first, one of the list among them; then the others that answer; a port where nothing "
                        + "answers is passed over; then the list, nothing twice");
        assertEquals(Ports.FIRST, RunningServers.firsts(McpMain.DEFAULT_PORT, false, written, port -> false, FIT),
                "nothing answers: the list, as before");
        assertEquals(List.of(45000), RunningServers.firsts(45000, true, written, port -> true, OTHER),
                "a setup that names a port and other settings than every server with the browser: that port");
    }

    @Test
    void aProcessWithAPortGoesToTheServerWithTheBrowserOnlyWhereThatRunsAsItsSetupAsks() {
        List<RunningServers.Entry> written = List.of(
                new RunningServers.Entry(39821, false, FIT),
                new RunningServers.Entry(41000, true, FIT),
                new RunningServers.Entry(42000, true, OTHER));
        assertEquals(List.of(41000, 45000), RunningServers.firsts(45000, true, written, port -> true, FIT),
                "the server with the browser and the same settings first, then its own port, on which it starts one");
        assertEquals(List.of(42000, 45000), RunningServers.firsts(45000, true, written, port -> true, OTHER),
                "the same for the other settings");
        assertEquals(List.of(45000), RunningServers.firsts(45000, true, written, port -> port != 41000, FIT),
                "one that does not answer is passed over");
        assertEquals(List.of(45000), RunningServers.firsts(45000, true, written, port -> true,
                new RunningServers.Fit(FIT.settings(), "chrome-extension://another")), "another extension is other settings");
        List<RunningServers.Entry> ownHasIt = List.of(new RunningServers.Entry(45000, true, FIT), written.get(1));
        assertEquals(List.of(45000), RunningServers.firsts(45000, true, ownHasIt, port -> true, FIT),
                "the browser is at its own port's server: that one alone");
        assertEquals(List.of(41000, 45000), RunningServers.firsts(45000, true, ownHasIt, port -> port != 45000, FIT),
                "the file of its own port is of a server that is gone: it is not what keeps the process from the other");
        List<RunningServers.Entry> noFit = List.of(new RunningServers.Entry(41000, true, new RunningServers.Fit("", "")));
        assertEquals(List.of(45000), RunningServers.firsts(45000, true, noFit, port -> true, FIT),
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
    void aServerThatHasNoBrowserSaysWhetherAnotherHasItAndRunsAsTheAgentsSetupAsksAndNeverNamesItself() {
        List<RunningServers.Entry> written = List.of(
                new RunningServers.Entry(McpMain.DEFAULT_PORT, true, FIT),
                new RunningServers.Entry(41000, true, FIT),
                new RunningServers.Entry(42000, false, FIT),
                new RunningServers.Entry(39821, true, OTHER));
        assertEquals(new BrowserService.Elsewhere(false),
                RunningServers.other(written, McpMain.DEFAULT_PORT, port -> port != 41000, FIT),
                "itself, one that does not answer and one without the browser are passed over; the one found runs under other settings");
        assertEquals(new BrowserService.Elsewhere(true),
                RunningServers.other(written, McpMain.DEFAULT_PORT, port -> true, FIT), "the same settings as the agent's process");
        assertEquals(new BrowserService.Elsewhere(false),
                RunningServers.other(written, McpMain.DEFAULT_PORT, port -> true, null), "a process that said nothing of its own");
        assertEquals(null, RunningServers.other(written, McpMain.DEFAULT_PORT, port -> false, FIT), "nothing answers");
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
