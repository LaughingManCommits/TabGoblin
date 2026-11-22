package browsercontext;

import java.io.IOException;
import java.io.Reader;
import java.net.IDN;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.List;
import java.util.Locale;
import java.util.Properties;
import java.util.TreeSet;
import java.util.function.Supplier;
import java.util.regex.Pattern;

/**
 * The sites no agent may work on. The user names them in a file of properties beside the pairing
 * token; whatever a tab is authorized for, an action on such a site is refused here, before it
 * reaches the browser.
 *
 * <p>The server knows no website: it ships no entry and names no site. The list is the user's.
 *
 * <p>An entry is a domain, and blocks that domain with every subdomain, on every port and with
 * every scheme. A file that is there and cannot be read, or that has an entry which is no
 * domain, blocks everything: a guard that is silently off is worse than tools that are off.
 */
final class BlockedSites {

    /** The name of the settings file, in the folder of the pairing token. */
    static final String FILE = "tabgoblin.properties";
    /** The key under which the blocked domains stand, separated by commas or blanks. */
    static final String KEY = "blocked.sites";

    /** A scheme with its slashes; for the two a browser opens, also without them, as a browser reads it. */
    private static final Pattern SCHEME = Pattern.compile("^(https?:/*|[a-z][a-z0-9+.-]*://)");
    private static final Pattern LABEL = Pattern.compile("[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?");
    private static final Pattern IPV4 = Pattern.compile("\\d{1,3}(\\.\\d{1,3}){3}");
    private static final Pattern IPV6 = Pattern.compile("\\[[0-9a-f:.]{2,45}]");

    private BlockedSites() {
    }

    /**
     * What is in force: the blocked domains, in the form hosts are compared in; and, if the file
     * could not be taken as a list, why: a few words for the user, which follow "the settings file
     * is not in force:". While that is so every site counts as blocked.
     */
    record Rule(List<String> domains, String unreadable) {

        /** Nothing is blocked: no file, or no entry in it. */
        static final Rule NONE = new Rule(List.of(), null);

        /** Whether everything is refused, because the list could not be read. */
        boolean everything() {
            return unreadable != null;
        }

        /**
         * The entry that blocks this host, or null if none does. A host is blocked by an entry
         * that is the host itself or a domain it lies under. An address that is a number is
         * blocked only by itself: its parts are no domains.
         *
         * @param host as {@link #host} gives it
         */
        /** The host among these addresses that is blocked, or null if none of them is. */
        String among(Iterable<String> addresses) {
            for (String address : addresses) {
                String host = host(address);
                if (blocking(host) != null) {
                    return host;
                }
            }
            return null;
        }

        String blocking(String host) {
            if (host == null) {
                return null;
            }
            boolean number = IPV4.matcher(host).matches() || host.startsWith("[");
            for (String domain : domains) {
                if (host.equals(domain) || (!number && host.endsWith("." + domain))) {
                    return domain;
                }
            }
            return null;
        }
    }

    /** What a settings file starts with, when the user asks to edit one and there is none: what it can hold, as comments. */
    static final String TEMPLATE = """
            # TabGoblin settings.
            #
            # Sites that no agent may work on, whatever a tab is authorized for.
            # One line, the domains separated by commas. A domain blocks itself and its subdomains.
            # A change is in force as soon as this file is saved.
            #
            # blocked.sites = example.org, intranet.example
            """;

    /** Makes the settings file, with what it can hold written out as comments, if there is none. */
    static void ensure(Path file) throws IOException {
        Path place = file.toAbsolutePath();
        if (Files.exists(place)) {
            return;
        }
        if (place.getParent() != null) {
            Files.createDirectories(place.getParent());
        }
        Files.writeString(place, TEMPLATE, StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
    }

    /** The command that opens a file of text for editing, on a system of this name. */
    static List<String> editor(String system, Path file) {
        String os = system.toLowerCase(Locale.ROOT);
        String path = file.toAbsolutePath().toString();
        if (os.contains("mac") || os.contains("darwin")) {
            return List.of("open", "-t", path);
        }
        if (os.contains("win")) {
            return List.of("notepad.exe", path);
        }
        return List.of("xdg-open", path);
    }

    /**
     * Opens the settings file in the system's editor for text, on the user's word in the server's
     * window; a file that is not there is made first. Returns whether an editor was started.
     */
    static boolean edit(Path file) {
        try {
            ensure(file);
            new ProcessBuilder(editor(System.getProperty("os.name", ""), file))
                    .redirectErrorStream(true).redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
            return true;
        } catch (IOException | RuntimeException e) {
            return false;
        }
    }

    /** Where the settings are unless the command line or the environment names another file: beside the pairing token. */
    static Path beside(Path tokenFile) {
        return tokenFile.toAbsolutePath().resolveSibling(FILE);
    }

    /**
     * The host of an address, an origin or an entry of the list, in the one form hosts are
     * compared in: lower case, without scheme, port, path or a dot at either end, and a name in
     * another script in its encoded form. Null if what is left is no host.
     */
    static String host(String address) {
        if (address == null) {
            return null;
        }
        // As a browser reads an address: a backslash is a slash, and a tab or a line break is not there.
        String text = address.replaceAll("[\\t\\n\\r]", "").trim().replace('\\', '/').toLowerCase(Locale.ROOT);
        text = SCHEME.matcher(text).replaceFirst("");
        if (text.startsWith("//")) {
            text = text.substring(2);
        }
        int end = indexOfAny(text, "/?#");
        if (end >= 0) {
            text = text.substring(0, end);
        }
        int at = text.lastIndexOf('@');
        if (at >= 0) {
            text = text.substring(at + 1);
        }
        if (text.startsWith("[")) {
            // An address in the newer notation: it keeps its brackets, and what follows them is a port.
            int close = text.indexOf(']');
            text = close < 0 ? text : text.substring(0, close + 1);
            return IPV6.matcher(text).matches() ? text : null;
        }
        int colon = text.lastIndexOf(':');
        if (colon >= 0 && text.substring(colon + 1).chars().allMatch(Character::isDigit)) {
            text = text.substring(0, colon);
        }
        while (text.startsWith(".")) {
            text = text.substring(1);
        }
        while (text.endsWith(".")) {
            text = text.substring(0, text.length() - 1);
        }
        try {
            text = IDN.toASCII(text, IDN.ALLOW_UNASSIGNED).toLowerCase(Locale.ROOT);
        } catch (IllegalArgumentException e) {
            return null;
        }
        if (text.isEmpty() || text.length() > 253) {
            return null;
        }
        for (String label : text.split("\\.", -1)) {
            if (!LABEL.matcher(label).matches()) {
                return null;
            }
        }
        return text;
    }

    /**
     * An entry of the list as the domain it blocks: what a user may paste is taken down to that,
     * a leading {@code *.} included. Null if it is no domain.
     */
    static String domain(String entry) {
        String text = entry == null ? "" : entry.trim();
        return host(text.startsWith("*.") ? text.substring(2) : text);
    }

    private static int indexOfAny(String text, String any) {
        for (int i = 0; i < text.length(); i++) {
            if (any.indexOf(text.charAt(i)) >= 0) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Reads the list. A file that is not there, or has no entry, blocks nothing. One that is
     * there and cannot be read, or has an entry that is no domain, blocks everything, and the
     * rule says why.
     */
    static Rule read(Path file) {
        if (!Files.exists(file)) {
            return Rule.NONE;
        }
        Properties properties = new Properties();
        try (Reader in = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            properties.load(in);
        } catch (IOException | IllegalArgumentException e) {
            return new Rule(List.of(), "it cannot be read (" + e.getClass().getSimpleName() + ")");
        }
        TreeSet<String> domains = new TreeSet<>();
        for (String entry : properties.getProperty(KEY, "").split("[,\\s]+")) {
            if (entry.isEmpty()) {
                continue;
            }
            String domain = domain(entry);
            if (domain == null) {
                // A slip of the pen must not unblock the site it was meant for without a word.
                return new Rule(List.of(), "\"" + entry + "\" in " + KEY + " is no domain");
            }
            domains.add(domain);
        }
        return domains.isEmpty() ? Rule.NONE : new Rule(List.copyOf(domains), null);
    }

    /**
     * The list as it is now: read from the file, and read again when the file has changed. One
     * server runs for as long as an agent does, and a changed list has to be in force without the
     * server being stopped. The file is looked at twice a second at most.
     */
    static Supplier<Rule> source(Path file) {
        return new Supplier<>() {
            private Rule rule = Rule.NONE;
            private String seen = "";
            private long lookedAt = Long.MIN_VALUE;

            @Override
            public synchronized Rule get() {
                long now = System.nanoTime();
                if (lookedAt != Long.MIN_VALUE && now - lookedAt < 500_000_000L) {
                    return rule;
                }
                lookedAt = now;
                String state;
                try {
                    state = Files.exists(file) ? Files.getLastModifiedTime(file).toMillis() + ":" + Files.size(file) : "none";
                } catch (IOException e) {
                    state = "unreadable";
                }
                if (!state.equals(seen)) {
                    seen = state;
                    Rule read = read(file);
                    if (!read.equals(rule)) {
                        rule = read;
                        Log.info(read.everything() ? "blocked sites: settings file unreadable, every site is refused"
                                : "blocked sites: " + read.domains().size() + " in force");
                    }
                }
                return rule;
            }
        };
    }
}
