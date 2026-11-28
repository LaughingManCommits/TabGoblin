package tabgoblin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

/**
 * Which port the server takes when the system keeps the usual one back. A port that is kept back
 * cannot be made here: that takes the system. What is held is what follows once a port is known
 * to be unusable, and that a port which a program holds is not taken for one.
 */
class PortsTest {

    private static final String TOKEN = WebSocketBridgeTest.TOKEN;
    private final List<AutoCloseable> open = new ArrayList<>();

    @AfterEach
    void close() throws Exception {
        for (AutoCloseable one : open) {
            one.close();
        }
    }

    private static int freePort() throws IOException {
        try (ServerSocket any = new ServerSocket(0, 1, loopback())) {
            return any.getLocalPort();
        }
    }

    private static InetAddress loopback() throws IOException {
        return InetAddress.getByAddress(new byte[] {127, 0, 0, 1});
    }

    private static Agent.Settings settings(int port) {
        return new Agent.Settings(port, () -> TOKEN, FakeExtension.ORIGIN);
    }

    private Hub serving(Hub hub) {
        assertNotNull(hub, "a server was opened");
        open.add(hub::close);
        Thread serving = new Thread(hub::serve, "test-hub");
        serving.setDaemon(true);
        serving.start();
        return hub;
    }

    private static Link asker(List<Integer> serverPorts) {
        return new Link(InputStream.nullInputStream(), OutputStream.nullOutputStream(), System.err, () -> TOKEN, serverPorts,
                false, true, () -> { }, null, null);
    }

    @Test
    void theUsersOwnPortIsTheOnlyOneAndWithoutOneItIsTheList() {
        assertEquals(List.of(5000), Ports.firsts(5000, true));
        assertEquals(List.of(McpMain.DEFAULT_PORT), Ports.firsts(McpMain.DEFAULT_PORT, true), "also when it is the usual one");
        assertEquals(Ports.FIRST, Ports.firsts(McpMain.DEFAULT_PORT, false));
        assertEquals(McpMain.DEFAULT_PORT, Ports.FIRST.get(0), "the port there always was comes first: nothing changes where it works");
    }

    @Test
    void theFirstPortThatCanBeUsedIsTakenAndTheUsualOneWhereNoneCan() {
        assertEquals(1, Ports.firstUsable(List.of(1, 2, 3), port -> true));
        assertEquals(2, Ports.firstUsable(List.of(1, 2, 3), port -> port != 1));
        assertEquals(3, Ports.firstUsable(List.of(1, 2, 3), port -> port == 3));
        // None: what is said then names the usual port, as it did before there was a list.
        assertEquals(1, Ports.firstUsable(List.of(1, 2, 3), port -> false));
    }

    @Test
    void aPortThatIsFreeOrThatAProgramHoldsIsNotTakenForOneTheSystemKeepsBack() throws Exception {
        int port = freePort();
        assertTrue(Ports.usable(port), "free");
        // Room for the connections that ask whether it answers: nobody takes them here, and Windows
        // refuses a further one once the queue is full.
        ServerSocket held = new ServerSocket(port, 10, loopback());
        open.add(held);
        // Taken by a program that answers: closing it helps, or it is the server to join; another port does not.
        assertTrue(Ports.usable(port), "held by a program");
        assertTrue(Ports.answers(port));
    }

    @Test
    void aServerTakesTheNextPortWhereTheFirstIsKeptBackAndAnAgentsProcessFindsItThere() throws Exception {
        int keptBack = freePort();
        int given = freePort();
        Hub hub = serving(McpMain.openWhereThePortsAre(settings(keptBack), List.of(keptBack, given), false, port -> port != keptBack));
        assertEquals(given, hub.port());

        // The agent's process looks at each port in turn: nobody answers on the first, the server does on the second.
        assertTrue(asker(List.of(keptBack, given)).show());
        // Where it looks at the first alone, as with a port of the user's own, it finds none.
        assertFalse(asker(List.of(keptBack)).show());
    }

    @Test
    void whereTheFirstPortIsGivenOutNothingChanges() throws Exception {
        int first = freePort();
        int other = freePort();
        Hub hub = serving(McpMain.openWhereThePortsAre(settings(first), List.of(first, other), false));
        assertEquals(first, hub.port());
    }

    @Test
    void aServerThatIsThereAlreadyIsNoReasonForAnotherOnTheNextPort() throws Exception {
        int first = freePort();
        int other = freePort();
        serving(McpMain.openWhereThePortsAre(settings(first), List.of(first, other), false));
        assertNull(McpMain.openWhereThePortsAre(settings(first), List.of(first, other), false), "one server is enough");
        assertFalse(Ports.answers(other), "and none was started on the other port");
    }

    @Test
    void noPortGivenOutIsNoServer() {
        assertNull(McpMain.openWhereThePortsAre(settings(1), List.of(1, 2), false, port -> false));
    }

    @Test
    void theStatusSaysWhichPortIsInUseOnlyWhenItIsNotTheUsualOne() {
        int usual = Ports.FIRST.get(0);
        int second = Ports.FIRST.get(1);
        assertEquals("", Ports.note(usual));
        String note = Ports.note(second);
        assertTrue(note.contains("port " + usual + " back"), note);
        assertTrue(note.contains("uses " + second), note);
        assertTrue(note.contains("the user has nothing to set"), note);
        // A port of the user's own is what they asked for: nothing to say.
        assertEquals("", Ports.note(5000));
    }

    @Test
    void aServerOnAPortOffTheListIsToldThatTheExtensionDoesNotLookThere() {
        assertEquals("47821, 37821 and 27821", Ports.listed());
        for (int port : Ports.FIRST) {
            assertEquals("", Ports.offList(port), "a port of the list is found by the extension");
        }
        String off = Ports.offList(5000);
        assertTrue(off.startsWith("This server listens on 5000, which the extension does not look at"), off);
        assertTrue(off.contains("47821, 37821 or 27821 only"), off);
        assertTrue(off.endsWith("start the server without --port."), off);
        // What a process says when it cannot listen: a held port is not stepped over; a kept-back one has the list as the way out.
        String taken = Agent.noPort(47821, true);
        assertTrue(taken.contains("Close that program") && taken.contains("does not step over"), taken);
        assertFalse(taken.contains("--port"), taken);
        String keptBack = Agent.noPort(47821, false);
        assertTrue(keptBack.contains("tries 47821, 37821 and 27821") && keptBack.contains("free one of them"), keptBack);
        String keptBackOwn = Agent.noPort(5000, false);
        assertTrue(keptBackOwn.contains("without --port"), keptBackOwn);
    }
}
