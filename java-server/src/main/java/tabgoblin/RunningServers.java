package tabgoblin;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.FileTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.function.IntPredicate;
import java.util.function.LongPredicate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Where the servers that run have their ports, and which of them has the browser, written down
 * beside the pairing token, so that an agent's process whose setup names no port goes to the
 * server the browser is at.
 *
 * <p>There is to be one server for all agents. A process looks for it on the list of first ports
 * that every part knows ({@link Ports}); a server that one agent's setup put on another port is
 * not on that list, and a second agent, set up without a port, started a second server beside
 * it, which the browser never came to. So each server writes a file of its own into the folder
 * {@code servers} when it has opened: its first port, its process, and whether the browser is
 * connected to it, which it writes again when that changes. It takes the file out when it ends in
 * order. A process without a port of its own looks there before it looks at the list: first at a
 * server that has the browser, then at the others.
 *
 * <p>The folder decides nothing by itself. A port from it is used only if something answers there
 * as the server does, and the two proofs of the pairing token follow on that connection as on
 * any other ({@link Link}); what a file says of the browser only puts one server before another.
 * The file of a server that was ended by force stays behind: its process is gone, so it is passed
 * over without a connection, and the next server that opens takes it out. A process whose setup
 * names a port looks at that port and no other, as before. Each server writes its own file only,
 * so two servers never write over each other.
 */
final class RunningServers {

    /** The folder's name, beside the pairing token. */
    static final String FOLDER = "servers";
    /** More files than these are not read: a machine has one server, or few. */
    private static final int MOST = 8;
    private static final int ANSWER_WITHIN_MS = 500;
    private static final ObjectMapper JSON = new ObjectMapper();

    /**
     * What a server wrote of itself.
     *
     * @param first   its first port
     * @param pid     its process, or 0 if not known
     * @param browser the browser was connected to it when it last wrote
     */
    record Entry(int first, long pid, boolean browser) {
    }

    private RunningServers() {
    }

    static Path folder(Path tokenFile) {
        Path beside = tokenFile.toAbsolutePath().getParent();
        return (beside == null ? Path.of(".") : beside).resolve(FOLDER);
    }

    private static Path fileOf(Path tokenFile, int first) {
        return folder(tokenFile).resolve(first + ".json");
    }

    /** What the servers wrote, the last written first. A folder that is not there or cannot be read says none. */
    static List<Entry> read(Path tokenFile) {
        Path folder = folder(tokenFile);
        if (!Files.isDirectory(folder)) {
            return List.of();
        }
        List<Path> files = new ArrayList<>();
        try (DirectoryStream<Path> listed = Files.newDirectoryStream(folder, "*.json")) {
            listed.forEach(files::add);
        } catch (IOException | RuntimeException e) {
            return List.of();
        }
        files.sort(Comparator.comparing(RunningServers::written).reversed());
        List<Entry> entries = new ArrayList<>();
        for (Path file : files) {
            if (entries.size() >= MOST) {
                break;
            }
            Entry entry = parse(file);
            if (entry != null) {
                entries.add(entry);
            }
        }
        return entries;
    }

    private static FileTime written(Path file) {
        try {
            return Files.getLastModifiedTime(file);
        } catch (IOException | RuntimeException e) {
            return FileTime.fromMillis(0);
        }
    }

    /** One server's file, or null if it is not one of this kind: its name and its first port have to agree. */
    private static Entry parse(Path file) {
        try {
            String name = file.getFileName().toString();
            if (!name.matches("[0-9]{4,5}\\.json") || Files.size(file) > 1024) {
                return null;
            }
            JsonNode node = JSON.readTree(Files.readString(file, StandardCharsets.UTF_8));
            int first = node.path("first").asInt(0);
            long pid = node.path("pid").asLong(0);
            if (!name.equals(first + ".json") || first < 1024 || first > 65535 - McpMain.PORT_RANGE || pid < 0
                    || !node.path("browser").isBoolean()) {
                return null;
            }
            return new Entry(first, pid, node.path("browser").asBoolean());
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    /**
     * A server has opened with this first port. Files of servers whose process is gone are taken
     * out first. A folder that cannot be written leaves things as they were before there was one.
     */
    static void add(Path tokenFile, int first) {
        for (Entry entry : read(tokenFile)) {
            if (!alive(entry.pid())) {
                remove(tokenFile, entry.first());
            }
        }
        write(tokenFile, first, false);
    }

    /** What this server says of itself: written again when the browser comes or goes. */
    static void write(Path tokenFile, int first, boolean browser) {
        Path folder = folder(tokenFile);
        try {
            if (Files.isRegularFile(folder)) {
                // The one file of an earlier build of this branch, never released: the folder takes its place.
                Files.delete(folder);
            }
            Files.createDirectories(folder);
            ObjectNode node = JSON.createObjectNode();
            node.put("first", first);
            node.put("pid", ProcessHandle.current().pid());
            node.put("browser", browser);
            Path next = folder.resolve(first + ".json.tmp");
            Files.writeString(next, JSON.writeValueAsString(node) + "\n", StandardCharsets.UTF_8);
            try {
                Files.move(next, fileOf(tokenFile, first), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (IOException e) {
                Files.move(next, fileOf(tokenFile, first), StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException | RuntimeException e) {
            Log.warn("the file of this running server could not be written reason=" + e.getClass().getSimpleName());
        }
    }

    /** The server with this first port ends. */
    static void remove(Path tokenFile, int first) {
        try {
            Files.deleteIfExists(fileOf(tokenFile, first));
        } catch (IOException | RuntimeException e) {
            // Left behind: its process is gone, and it is passed over and taken out by the next server.
        }
    }

    /** Whether the process is there. One that is not known counts as there: the server's hello decides then. */
    static boolean alive(long pid) {
        return pid <= 0 || ProcessHandle.of(pid).map(ProcessHandle::isAlive).orElse(false);
    }

    /**
     * The first ports a process looks for the server on: the user's own and no other; or, without
     * one, the servers that run, the one with the browser first, and then the list.
     */
    static List<Integer> firsts(int port, boolean chosen, Path tokenFile) {
        return firsts(port, chosen, read(tokenFile), RunningServers::answers, RunningServers::alive);
    }

    /** @param answers whether a server answers on the port for links that follows from a first port */
    static List<Integer> firsts(int port, boolean chosen, List<Entry> written, IntPredicate answers, LongPredicate alive) {
        List<Integer> list = Ports.firsts(port, chosen);
        if (chosen) {
            return list;
        }
        Set<Integer> firsts = new LinkedHashSet<>();
        List<Entry> running = written.stream().filter(entry -> alive.test(entry.pid()) && answers.test(entry.first())).toList();
        running.stream().filter(Entry::browser).forEach(entry -> firsts.add(entry.first()));
        running.forEach(entry -> firsts.add(entry.first()));
        firsts.addAll(list);
        return List.copyOf(firsts);
    }

    /**
     * Another server than the one with this first port, that has the browser and answers: its first
     * port, or 0. Said to an agent that finds no browser. Only a port is said, nothing of that
     * server's agents.
     */
    static int other(Path tokenFile, int own) {
        return other(read(tokenFile), own, RunningServers::answers, RunningServers::alive);
    }

    static int other(List<Entry> written, int own, IntPredicate answers, LongPredicate alive) {
        return written.stream()
                .filter(entry -> entry.first() != own && entry.browser() && alive.test(entry.pid()) && answers.test(entry.first()))
                .mapToInt(Entry::first).findFirst().orElse(0);
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
