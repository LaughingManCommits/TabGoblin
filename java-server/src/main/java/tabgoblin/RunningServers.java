package tabgoblin;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.function.IntPredicate;

/**
 * Where the servers that run have their ports, written down beside the pairing token, so that an
 * agent's process whose setup names no port finds a server that was started on a port of the
 * user's own.
 *
 * <p>There is to be one server for all agents. A process looks for it on the list of first ports
 * that every part knows ({@link Ports}); a server that one agent's setup put on another port is
 * not on that list, and a second agent, set up without a port, started a second server beside
 * it, which the browser never came to. So a server writes its first port into this file when it
 * has opened, and takes it out when it ends in order; a process without a port of its own looks
 * there before it looks at the list.
 *
 * <p>The file decides nothing by itself. A port from it is used only if something answers there
 * as the server does, and the two proofs of the pairing token follow on that connection as on
 * any other ({@link Link}). A server that was ended by force leaves its line behind: nobody
 * answers there, and the line is passed over. A process whose setup names a port looks at that
 * port and no other, as before.
 */
final class RunningServers {

    /** The file's name, beside the pairing token. */
    static final String FILE = "servers";
    /** More lines than these are not kept or read: a machine has one server, or few. */
    private static final int MOST = 8;
    private static final int ANSWER_WITHIN_MS = 500;

    private RunningServers() {
    }

    static Path file(Path tokenFile) {
        Path beside = tokenFile.toAbsolutePath().getParent();
        return (beside == null ? Path.of(".") : beside).resolve(FILE);
    }

    /** The first ports written there, in the file's order. A file that is not there or cannot be read says none. */
    static List<Integer> read(Path tokenFile) {
        List<Integer> ports = new ArrayList<>();
        try {
            for (String line : Files.readAllLines(file(tokenFile), StandardCharsets.UTF_8)) {
                String text = line.strip();
                if (!text.matches("[0-9]{4,5}")) {
                    continue;
                }
                int port = Integer.parseInt(text);
                if (port >= 1024 && port <= 65535 - McpMain.PORT_RANGE && !ports.contains(port) && ports.size() < MOST) {
                    ports.add(port);
                }
            }
        } catch (IOException | RuntimeException e) {
            // No file, or not one of this kind: nothing is known from it.
        }
        return ports;
    }

    /** A server has opened with this first port. A file that cannot be written leaves things as they were before there was one. */
    static void add(Path tokenFile, int first) {
        List<Integer> ports = read(tokenFile);
        ports.remove(Integer.valueOf(first));
        ports.add(0, first);
        write(tokenFile, ports.subList(0, Math.min(ports.size(), MOST)));
    }

    /** The server with this first port ends. */
    static void remove(Path tokenFile, int first) {
        List<Integer> ports = read(tokenFile);
        if (ports.remove(Integer.valueOf(first))) {
            write(tokenFile, ports);
        }
    }

    private static void write(Path tokenFile, List<Integer> ports) {
        Path file = file(tokenFile);
        try {
            if (ports.isEmpty()) {
                Files.deleteIfExists(file);
                return;
            }
            StringBuilder text = new StringBuilder();
            ports.forEach(port -> text.append(port).append('\n'));
            Path next = file.resolveSibling(FILE + ".tmp");
            Files.writeString(next, text, StandardCharsets.UTF_8);
            try {
                Files.move(next, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (IOException e) {
                Files.move(next, file, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException | RuntimeException e) {
            Log.warn("the file of running servers could not be written reason=" + e.getClass().getSimpleName());
        }
    }

    /**
     * The first ports a process looks for the server on: the user's own and no other; or, without
     * one, a server that runs on a port outside the list, and then the list.
     */
    static List<Integer> firsts(int port, boolean chosen, Path tokenFile) {
        return firsts(port, chosen, read(tokenFile), RunningServers::answers);
    }

    /** @param answers whether a server answers on the port for links that follows from a first port */
    static List<Integer> firsts(int port, boolean chosen, List<Integer> written, IntPredicate answers) {
        List<Integer> list = Ports.firsts(port, chosen);
        if (chosen) {
            return list;
        }
        List<Integer> firsts = new ArrayList<>();
        for (int first : written) {
            if (!list.contains(first) && answers.test(first)) {
                firsts.add(first);
            }
        }
        firsts.addAll(list);
        return List.copyOf(firsts);
    }

    /**
     * Another server than the one with this first port, that is written down and answers: the first
     * of them, or 0. Said to an agent that finds no browser, since the browser connects to one
     * server only. Only a port is said, nothing of that server's agents.
     */
    static int other(Path tokenFile, int own) {
        return other(read(tokenFile), own, RunningServers::answers);
    }

    static int other(List<Integer> written, int own, IntPredicate answers) {
        return written.stream().mapToInt(Integer::intValue).filter(first -> first != own && answers.test(first)).findFirst().orElse(0);
    }

    /**
     * Whether something answers as the server does on the port for links of this first port: it
     * opens with its hello. Nothing is proven by that, and nothing is sent: the proofs follow on
     * the connection a link then makes.
     */
    static boolean answers(int first) {
        try (Socket probe = new Socket()) {
            probe.connect(new InetSocketAddress(InetAddress.getByAddress(new byte[] {127, 0, 0, 1}), Link.port(first)), ANSWER_WITHIN_MS);
            probe.setSoTimeout(ANSWER_WITHIN_MS);
            String hello = new BufferedReader(new InputStreamReader(probe.getInputStream(), StandardCharsets.UTF_8)).readLine();
            return hello != null && hello.contains("\"hello\"") && hello.contains("\"nonce\"");
        } catch (IOException | RuntimeException e) {
            return false;
        }
    }
}
