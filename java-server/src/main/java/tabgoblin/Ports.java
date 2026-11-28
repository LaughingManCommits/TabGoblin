package tabgoblin;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.UnknownHostException;
import java.util.List;
import java.util.function.IntPredicate;

/**
 * Which port the server listens on, on a machine whose system keeps some ports back.
 *
 * <p>The server has one port: the extension pairs there, and the agents' processes connect there
 * too. Windows can keep a range of ports back for its own networking, and then the usual one
 * cannot be listened on. So there is a short list of ports, far apart, that the server, the
 * agents' processes and the extension all know. The server takes the first of them the system
 * gives out; the others look at each in turn. The extension cannot be told a port, which is why the
 * list is fixed: {@code PORTS} in the extension's {@code policy.ts} has to say the same.
 *
 * <p>A port the user chose, with {@code --port} or {@code TABGOBLIN_PORT}, is the only one that is
 * tried: a setup that names a port means that port, and the popup has to name it too.
 */
final class Ports {

    /** The ports that are tried, in this order. The first is the one there always was. */
    static final List<Integer> FIRST = List.of(McpMain.DEFAULT_PORT, 37821, 27821);

    private Ports() {
    }

    /** The ports to try: the one the user chose and no other, or the list. */
    static List<Integer> firsts(int port, boolean chosen) {
        return chosen ? List.of(port) : FIRST;
    }

    /** The list as a sentence names it: "47821, 37821 and 27821". */
    static String listed() {
        List<String> words = FIRST.stream().map(String::valueOf).toList();
        return String.join(", ", words.subList(0, words.size() - 1)) + " and " + words.get(words.size() - 1);
    }

    /**
     * What an agent is told while no browser has come to a server on a port that is not on the
     * list: the extension looks at the list and nowhere else. Empty for a port on it.
     */
    static String offList(int port) {
        if (FIRST.contains(port)) {
            return "";
        }
        return "This server listens on " + port + ", which the extension does not look at: it finds a server on "
                + listed().replace(" and ", " or ") + " only. For a browser, start the server without --port.";
    }

    /** The first of these that can be used, or the first of them if none can: what is said then names the usual port. */
    static int firstUsable(List<Integer> ports) {
        return firstUsable(ports, Ports::usable);
    }

    static int firstUsable(List<Integer> ports, IntPredicate usable) {
        return ports.stream().mapToInt(Integer::intValue).filter(usable).findFirst().orElse(ports.get(0));
    }

    /**
     * Whether the port can be had: it can be listened on, or a program holds it, which is then a
     * server to join or a matter of closing something. One of which neither is so is kept back by
     * the system. The error of a failed listening does not say which it is; on Windows it says "in
     * use" for both.
     */
    static boolean usable(int port) {
        try (ServerSocket free = new ServerSocket(port, 1, loopback())) {
            return true;
        } catch (IOException e) {
            return answers(port);
        }
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
     * What a tool's status says of the port when the usual one could not be used, or nothing when
     * it is in use or the user chose the port.
     */
    static String note(int port) {
        int usual = FIRST.get(0);
        if (port == usual) {
            return "";
        }
        if (FIRST.contains(port)) {
            return "Ports: this machine's system keeps the usual port " + usual + " back, so this server uses " + port
                    + ". The extension looks there by itself: the user has nothing to set.";
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
