package tabgoblin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.InetAddress;
import java.net.ServerSocket;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** What an agent without a port is told: who holds the ports, as far as that can be found out. */
class AgentPortsTest {

    @Test
    void portsThatNothingListensOnAreNotBlamedOnOtherServers() {
        // Seen on Windows: the system kept the whole range back, no program had a port of it, and
        // the message said that too many servers were running.
        String said = Agent.noPort(47821, 0);
        assertTrue(said.startsWith("Could not listen on any of ports 47821-47828 on 127.0.0.1: no program is listening on "
                + "them, and the system does not give them out."), said);
        assertTrue(said.contains("netsh interface ipv4 show excludedportrange protocol=tcp"), said);
        assertTrue(said.contains("--port"), said);
        assertFalse(said.contains("too many"), said);
        assertFalse(said.contains("servers are running"), said);
    }

    @Test
    void portsThatAreAllTakenSaySo() {
        String said = Agent.noPort(47821, McpMain.PORT_RANGE);
        assertTrue(said.startsWith("Could not listen on any of ports 47821-47828 on 127.0.0.1: all of them are taken, by "
                + "TabGoblin servers or by other programs."), said);
        assertFalse(said.contains("netsh"), said);
        assertTrue(said.contains("--port"), said);
    }

    @Test
    void whereSomeAreTakenAndTheRestKeptBackBothAreSaid() {
        String said = Agent.noPort(47821, 3);
        assertTrue(said.contains("3 of them are taken by programs, and of the rest the system does not give them out."), said);
    }

    @Test
    void theLogHasOneShortLineOfIt() {
        assertEquals("no port to listen on ports=47821-47828 taken=0 reason=kept_back_by_the_system", Agent.noPortLogged(47821, 0));
        assertEquals("no port to listen on ports=47821-47828 taken=8 reason=all_taken", Agent.noPortLogged(47821, 8));
        assertEquals("no port to listen on ports=47821-47828 taken=3 reason=taken_or_kept_back", Agent.noPortLogged(47821, 3));
    }

    @Test
    void aPortIsCountedAsTakenWhenSomethingAnswersOnIt() throws Exception {
        List<ServerSocket> held = new ArrayList<>();
        try {
            int first = freeRun();
            assertEquals(0, Agent.answering(first));
            for (int port : new int[] {first, first + 3}) {
                held.add(new ServerSocket(port, 5, InetAddress.getByAddress(new byte[] {127, 0, 0, 1})));
            }
            assertEquals(2, Agent.answering(first));
        } finally {
            for (ServerSocket socket : held) {
                socket.close();
            }
        }
    }

    /** A port from which a whole range is free. */
    private static int freeRun() throws Exception {
        for (int attempt = 0; attempt < 50; attempt++) {
            int first = 20_000 + (int) (Math.random() * 10_000);
            boolean free = true;
            for (int i = 0; i < McpMain.PORT_RANGE && free; i++) {
                try (ServerSocket probe = new ServerSocket(first + i, 1, InetAddress.getByAddress(new byte[] {127, 0, 0, 1}))) {
                    probe.setReuseAddress(true);
                } catch (java.io.IOException e) {
                    free = false;
                }
            }
            if (free) {
                return first;
            }
        }
        throw new IllegalStateException("no free ports found");
    }
}
