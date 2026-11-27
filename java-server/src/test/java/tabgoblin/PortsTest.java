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
 * Where the ports begin when the system keeps the usual ones back. A range that is kept back
 * cannot be made here: that takes the system. What is held is what follows once a range is known
 * to be unusable, and that a range which programs hold is not taken for one.
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

    /** A first port from which nine ports in a row are free. */
    private static int freeRange() throws IOException {
        for (int attempt = 0; attempt < 50; attempt++) {
            int first;
            try (ServerSocket any = new ServerSocket(0, 1, loopback())) {
                first = any.getLocalPort();
            }
            if (first + McpMain.PORT_RANGE > 65535) {
                continue;
            }
            List<ServerSocket> held = new ArrayList<>();
            try {
                for (int port = first; port <= first + McpMain.PORT_RANGE; port++) {
                    held.add(new ServerSocket(port, 1, loopback()));
                }
                return first;
            } catch (IOException taken) {
                // Somebody has one of them: another range.
            } finally {
                for (ServerSocket socket : held) {
                    socket.close();
                }
            }
        }
        throw new IOException("no nine free ports in a row");
    }

    private static InetAddress loopback() throws IOException {
        return InetAddress.getByAddress(new byte[] {127, 0, 0, 1});
    }

    private static Agent.Settings settings(int first) {
        return new Agent.Settings(first, () -> TOKEN, FakeExtension.ORIGIN);
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
    void theUsersOwnFirstPortIsTheOnlyOneAndWithoutOneItIsTheList() {
        assertEquals(List.of(5000), Ports.firsts(5000, true));
        assertEquals(List.of(McpMain.DEFAULT_PORT), Ports.firsts(McpMain.DEFAULT_PORT, true), "also when it is the usual one");
        assertEquals(Ports.FIRST, Ports.firsts(McpMain.DEFAULT_PORT, false));
        assertEquals(McpMain.DEFAULT_PORT, Ports.FIRST.get(0), "the port there always was comes first: nothing changes where it works");
    }

    @Test
    void theFirstRangeThatCanBeUsedIsTakenAndTheUsualOneWhereNoneCan() {
        assertEquals(1, Ports.firstUsable(List.of(1, 2, 3), first -> true));
        assertEquals(2, Ports.firstUsable(List.of(1, 2, 3), first -> first != 1));
        assertEquals(3, Ports.firstUsable(List.of(1, 2, 3), first -> first == 3));
        // None: what is said then names the usual ports, as it did before there was a list.
        assertEquals(1, Ports.firstUsable(List.of(1, 2, 3), first -> false));
    }

    @Test
    void aRangeThatIsFreeOrThatProgramsHoldIsNotTakenForOneTheSystemKeepsBack() throws Exception {
        int first = freeRange();
        assertTrue(Ports.usable(first), "free");
        for (int port = first; port < first + McpMain.PORT_RANGE; port++) {
            // Room for the connections that ask whether it answers: nobody takes them here, and
            // Windows refuses a further one once the queue is full.
            ServerSocket held = new ServerSocket(port, 10, loopback());
            open.add(held);
        }
        // All eight are taken, by programs that answer: closing one of them helps, another range does not.
        assertTrue(Ports.usable(first), "held by programs");
        assertTrue(Ports.answers(first));
    }

    @Test
    void aServerTakesTheNextRangeWhereTheFirstIsKeptBackAndAnAgentsProcessFindsItThere() throws Exception {
        int keptBack = freeRange();
        int given = freeRange();
        Hub hub = serving(McpMain.openWhereThePortsAre(settings(keptBack), List.of(keptBack, given), false, first -> first != keptBack));
        assertEquals(Link.port(given), hub.port());

        // The agent's process looks on each range in turn: nobody answers on the first, the server does on the second.
        assertTrue(asker(List.of(Link.port(keptBack), Link.port(given))).show());
        // Where it looks at the first range alone, as with a first port of the user's own, it finds none.
        assertFalse(asker(List.of(Link.port(keptBack))).show());
    }

    @Test
    void whereTheFirstRangeIsGivenOutNothingChanges() throws Exception {
        int first = freeRange();
        int other = freeRange();
        Hub hub = serving(McpMain.openWhereThePortsAre(settings(first), List.of(first, other), false));
        assertEquals(Link.port(first), hub.port());
    }

    @Test
    void aServerThatIsThereAlreadyIsNoReasonForAnotherOnTheNextRange() throws Exception {
        int first = freeRange();
        int other = freeRange();
        serving(McpMain.openWhereThePortsAre(settings(first), List.of(first, other), false));
        assertNull(McpMain.openWhereThePortsAre(settings(first), List.of(first, other), false), "one server is enough");
        assertFalse(Ports.answers(Link.port(other)), "and none was started on the other range");
    }

    @Test
    void noRangeGivenOutIsNoServer() {
        assertNull(McpMain.openWhereThePortsAre(settings(1), List.of(1, 2), false, first -> false));
    }

    @Test
    void theStatusSaysWhichPortsAreInUseOnlyWhenTheyAreNotTheUsualOnes() {
        int usual = Ports.FIRST.get(0);
        int second = Ports.FIRST.get(1);
        assertEquals("", Ports.note(usual));
        assertEquals("", Ports.note(usual + McpMain.PORT_RANGE - 1));
        String note = Ports.note(second + 2);
        assertTrue(note.contains(usual + "-" + (usual + McpMain.PORT_RANGE)), note);
        assertTrue(note.contains(second + "-" + (second + McpMain.PORT_RANGE)), note);
        assertTrue(note.contains("the user has nothing to set"), note);
        // A first port of the user's own is what they asked for: nothing to say.
        assertEquals("", Ports.note(5000));
    }
}
