package browsercontext;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.UnknownHostException;
import java.util.List;
import java.util.function.IntPredicate;

/**
 * Where the ports begin, on a machine whose system keeps some of them back.
 *
 * <p>A server's ports are nine in a row from a first one: eight for the agents and the one after
 * them for the agents' processes. Windows can keep a range of ports back for its own networking,
 * and then none of the nine can be listened on. So there is a short list of first ports, far
 * apart, that the server, the agents' processes and the extension all know. The server takes the
 * first of them whose range the system gives out; the others look at each in turn. The extension
 * cannot be told a port, which is why the list is fixed: {@code FIRST_PORTS} in the extension's
 * {@code policy.ts} has to say the same.
 *
 * <p>A first port the user chose, with {@code --port} or {@code BCMCP_PORT}, is the only one that
 * is tried: a setup that names a port means that port.
 */
final class Ports {

    /** The first ports that are tried, in this order. The first is the one there always was. */
    static final List<Integer> FIRST = List.of(McpMain.DEFAULT_PORT, 37821, 27821);

    private Ports() {
    }

    /** The first ports to try: the one the user chose and no other, or the list. */
    static List<Integer> firsts(int port, boolean chosen) {
        return chosen ? List.of(port) : FIRST;
    }

    /** The first of these whose range can be used, or the first of them if none can: what is said then names the usual ports. */
    static int firstUsable(List<Integer> firsts) {
        return firstUsable(firsts, Ports::usable);
    }

    static int firstUsable(List<Integer> firsts, IntPredicate usable) {
        return firsts.stream().mapToInt(Integer::intValue).filter(usable).findFirst().orElse(firsts.get(0));
    }

    /**
     * Whether an agent can have a port in the range that begins here: one of the eight can be
     * listened on, or a program holds one, which is then a matter of closing something. A range
     * of which neither is so is kept back by the system. The error of a failed listening does not
     * say which it is; on Windows it says "in use" for both.
     */
    static boolean usable(int first) {
        for (int port = first; port < first + McpMain.PORT_RANGE; port++) {
            try (ServerSocket free = new ServerSocket(port, 1, loopback())) {
                return true;
            } catch (IOException e) {
                // Held by a program, or kept back: the next loop tells them apart.
            }
        }
        for (int port = first; port < first + McpMain.PORT_RANGE; port++) {
            if (answers(port)) {
                return true;
            }
        }
        return false;
    }

    /** Whether something listens on the port: a connection to it is taken. */
    static boolean answers(int port) {
        try (Socket probe = new Socket()) {
            probe.connect(new InetSocketAddress(loopback(), port), 300);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    /**
     * What a tool's status says of the ports when the usual ones could not be used, or nothing
     * when they are in use or the user chose the port.
     */
    static String note(int port) {
        int usual = FIRST.get(0);
        if (port >= usual && port < usual + McpMain.PORT_RANGE) {
            return "";
        }
        for (int first : FIRST) {
            if (port >= first && port < first + McpMain.PORT_RANGE) {
                return "Ports: this machine's system keeps the usual ports " + usual + "-" + (usual + McpMain.PORT_RANGE)
                        + " back, so this server uses " + first + "-" + (first + McpMain.PORT_RANGE)
                        + ". The extension looks there by itself: the user has nothing to set.";
            }
        }
        return "";
    }

    private static InetAddress loopback() {
        try {
            return InetAddress.getByAddress(new byte[] {127, 0, 0, 1});
        } catch (UnknownHostException e) {
            throw new IllegalStateException(e);
        }
    }
}
