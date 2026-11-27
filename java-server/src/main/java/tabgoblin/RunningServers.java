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
 * {@code servers} when it has opened: its first port, whether the browser is connected to it,
 * which it writes again when that changes, and what it is run under. It takes the file out when
 * it ends in order. A process without a port of its own looks there before it looks at the list:
 * first at a server that has the browser, then at the others.
 *
 * <p>The folder decides nothing by itself. A port from it is used only if something answers there
 * as the server does, and the two proofs of the pairing token follow on that connection as on
 * any other ({@link Link}); what a file says of the browser only puts one server before another.
 * The file of a server that was ended by force stays behind: nothing answers on its port, so it
 * is passed over, and the next server that opens takes it out. Whether a server is there is told
 * by its port alone, never by a process id: a process id means nothing across the Linux subsystem
 * of Windows or a sandbox, and a connection that is refused on the loopback costs nothing. A
 * process whose setup names a port goes to the server that has the browser only where that
 * server reads the same settings file and allows the same extension as the server it would start
 * itself, so that nothing its setup asked for is lost; otherwise it looks at its own port and no
 * other, and starts its server there. Each server writes its own file only, so two servers never
 * write over each other.
 */
final class RunningServers {

    /** The folder's name, beside the pairing token. */
    static final String FOLDER = "servers";
    /** More files than these are not read: a machine has one server, or few. */
    private static final int MOST = 8;
    private static final int ANSWER_WITHIN_MS = 500;
    private static final ObjectMapper JSON = new ObjectMapper();

    /**
     * What a server is run under, of what a setup can ask for: the settings file it reads, and the
     * extension it lets in. A process that names a port joins another server only where these are
     * the same as for the server it would start.
     */
    record Fit(String settings, String origin) {
        static Fit of(Path settings, String origin) {
            return new Fit(settings.toAbsolutePath().normalize().toString(), origin);
        }

        /** The same settings file, by the rules of the system's paths (on Windows letter case does not count), and the same extension. */
        boolean sameAs(Fit other) {
            if (other == null || settings.isEmpty() || !origin.equals(other.origin)) {
                return false;
            }
            try {
                return Path.of(settings).equals(Path.of(other.settings));
            } catch (RuntimeException e) {
                return false;
            }
        }
    }

    /**
     * What a server wrote of itself.
     *
     * @param first   its first port
     * @param browser the browser was connected to it when it last wrote
     * @param fit     what it is run under; empty where a file does not say
     */
    record Entry(int first, boolean browser, Fit fit) {
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
            if (!name.equals(first + ".json") || first < 1024 || first > 65535 - McpMain.PORT_RANGE
                    || !node.path("browser").isBoolean()) {
                return null;
            }
            return new Entry(first, node.path("browser").asBoolean(),
                    new Fit(node.path("settings").asString(""), node.path("origin").asString("")));
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    /**
     * A server has opened with this first port. Files of servers that no longer answer are taken
     * out first. A folder that cannot be written leaves things as they were before there was one.
     */
    static void add(Path tokenFile, int first, Fit fit) {
        for (Entry entry : read(tokenFile)) {
            if (entry.first() != first && !answers(entry.first())) {
                remove(tokenFile, entry.first());
            }
        }
        write(tokenFile, first, false, fit);
    }

    /**
     * What this server says of itself: written again when the browser comes or goes. Says whether
     * it was written: on Windows the file cannot be replaced while another process reads it, and
     * what it says is then still what it said before.
     */
    static boolean write(Path tokenFile, int first, boolean browser, Fit fit) {
        Path folder = folder(tokenFile);
        Path next = folder.resolve(first + ".json.tmp");
        try {
            if (Files.isRegularFile(folder)) {
                // The one file of an earlier build of this branch, never released: the folder takes its place.
                Files.delete(folder);
            }
            Files.createDirectories(folder);
            ObjectNode node = JSON.createObjectNode();
            node.put("first", first);
            node.put("browser", browser);
            node.put("settings", fit.settings());
            node.put("origin", fit.origin());
            Files.writeString(next, JSON.writeValueAsString(node) + "\n", StandardCharsets.UTF_8);
            try {
                Files.move(next, fileOf(tokenFile, first), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (IOException e) {
                Files.move(next, fileOf(tokenFile, first), StandardCopyOption.REPLACE_EXISTING);
            }
            return true;
        } catch (IOException | RuntimeException e) {
            Log.warn("the file of this running server could not be written reason=" + e.getClass().getSimpleName());
            try {
                Files.deleteIfExists(next);
            } catch (IOException | RuntimeException left) {
                // A file that is not read by anyone: the glob of the folder passes it over.
            }
            return false;
        }
    }

    /** The server with this first port ends. */
    static void remove(Path tokenFile, int first) {
        try {
            Files.deleteIfExists(fileOf(tokenFile, first));
        } catch (IOException | RuntimeException e) {
            // Left behind: nothing answers on its port, so it is passed over and taken out by the next server.
        }
    }

    /**
     * The first ports a process looks for the server on. Without a port of its own: the servers that
     * run, the one with the browser first, and then the list. With one: a server that has the
     * browser and is run under the same settings and extension, then its own port and no other, on
     * which it starts its server if none runs.
     *
     * @param mine what the server this process would start is run under
     */
    static List<Integer> firsts(int port, boolean chosen, Path tokenFile, Fit mine) {
        return firsts(port, chosen, read(tokenFile), RunningServers::answers, mine);
    }

    /** @param answers whether a server answers on the port for links that follows from a first port */
    static List<Integer> firsts(int port, boolean chosen, List<Entry> written, IntPredicate answers, Fit mine) {
        List<Integer> list = Ports.firsts(port, chosen);
        if (chosen) {
            // The browser is at its own port's server, or no other server would run it as its setup asks: its port alone.
            if (written.stream().anyMatch(entry -> entry.first() == port && entry.browser() && answers.test(port))) {
                return list;
            }
            Set<Integer> firsts = new LinkedHashSet<>();
            written.stream()
                    .filter(entry -> entry.browser() && entry.fit().sameAs(mine) && answers.test(entry.first()))
                    .findFirst().ifPresent(entry -> firsts.add(entry.first()));
            firsts.addAll(list);
            return List.copyOf(firsts);
        }
        Set<Integer> firsts = new LinkedHashSet<>();
        List<Entry> running = written.stream().filter(entry -> answers.test(entry.first())).toList();
        running.stream().filter(Entry::browser).forEach(entry -> firsts.add(entry.first()));
        running.forEach(entry -> firsts.add(entry.first()));
        firsts.addAll(list);
        return List.copyOf(firsts);
    }

    /**
     * Whether another server than the one with this first port has the browser and answers, and
     * whether that one is run as the asking process's own would be: said to an agent that finds no
     * browser. Null where there is none. Nothing of that server is said beyond that, not its port
     * and nothing of its agents.
     *
     * @param mine what the server the agent's process would start is run under
     */
    static BrowserService.Elsewhere other(Path tokenFile, int own, Fit mine) {
        return other(read(tokenFile), own, RunningServers::answers, mine);
    }

    static BrowserService.Elsewhere other(List<Entry> written, int own, IntPredicate answers, Fit mine) {
        return written.stream()
                .filter(entry -> entry.first() != own && entry.browser() && answers.test(entry.first()))
                .findFirst().map(entry -> new BrowserService.Elsewhere(entry.fit().sameAs(mine))).orElse(null);
    }

    /**
     * Whether something answers as the server does on the port for links of this first port: it
     * opens with its hello. Nothing is proven by that, and nothing is sent: the proofs follow on
     * the connection a link then makes. A port nobody listens on refuses at once.
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
