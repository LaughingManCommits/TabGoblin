package tabgoblin;

import java.io.IOException;
import java.io.Reader;
import java.net.IDN;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
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
    record Rule(List<String> domains, String unreadable, Limits limits) {

        /** A list of blocked sites, and no other restriction. */
        Rule(List<String> domains, String unreadable) {
            this(domains, unreadable, Limits.NONE);
        }

        /** Nothing is blocked: no file, or no entry in it. */
        static final Rule NONE = new Rule(List.of(), null);

        /**
         * The host among these addresses that is outside the sites agents are limited to, or null
         * if all of them are inside, or there is no such limit. An address that is no site is
         * outside: what cannot be told to be allowed is not.
         */
        String outside(Iterable<String> addresses) {
            if (limits.allowed().isEmpty()) {
                return null;
            }
            Rule within = new Rule(limits.allowed(), null);
            for (String address : addresses) {
                if (address == null || address.isEmpty()) {
                    continue;
                }
                String host = host(address);
                if (host == null) {
                    return "an address that names no site";
                }
                if (within.blocking(host) == null) {
                    return host;
                }
            }
            return null;
        }

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

    /** The three access levels of a session, from the least to the most. */
    enum Access {
        READ("Read"), EXPLORE("Explore"), WRITE("Write");

        private final String label;

        Access(String label) {
            this.label = label;
        }

        /** The level as the user reads it. */
        String label() {
            return label;
        }

        /** The level as the settings file and the protocol have it. */
        String wire() {
            return name().toLowerCase(Locale.ROOT);
        }

        /** Whether a session of this level may do what needs that level. */
        boolean covers(Access needed) {
            return needed.ordinal() <= ordinal();
        }

        /** The level of that name, whatever its case, or null if there is none. */
        static Access of(String name) {
            for (Access access : values()) {
                if (access.wire().equalsIgnoreCase(name == null ? "" : name.trim())) {
                    return access;
                }
            }
            return null;
        }
    }

    /**
     * What the user's settings restrict besides blocked sites. It is local to this machine: a file
     * the user, or whoever manages the machine, writes. Nothing here widens what an agent may do;
     * every entry takes something away.
     *
     * @param strict             the strict profile: every submission is put to the user, a click that may
     *                           change something is a submission, and a tab is authorized for one named agent
     * @param allowed            the only sites agents may work on, as domains; empty for no such limit
     * @param screenshots        whether an agent may take a picture of a tab
     * @param maxAccess          the highest access level a session may have
     * @param sessionMaxMinutes  how long an authorization lasts at most; 0 for no limit
     * @param sessionIdleMinutes after how long without a command an authorization ends; 0 for never
     * @param cli                whether agents may come by commands of the command line
     * @param mcp                whether agents may come by MCP. An organisation that forbids the protocol turns it off
     */
    record Limits(boolean strict, List<String> allowed, boolean screenshots, Access maxAccess, int sessionMaxMinutes,
            int sessionIdleMinutes, boolean cli, boolean mcp) {

        /** With both interfaces. */
        Limits(boolean strict, List<String> allowed, boolean screenshots, Access maxAccess, int sessionMaxMinutes,
                int sessionIdleMinutes) {
            this(strict, allowed, screenshots, maxAccess, sessionMaxMinutes, sessionIdleMinutes, true, true);
        }

        /** No restriction: what holds without a settings file. */
        static final Limits NONE = new Limits(false, List.of(), true, Access.WRITE, 0, 0);

        /** Whether an agent that comes this way is let in. */
        boolean allows(boolean byCommands) {
            return byCommands ? cli : mcp;
        }

        /** The interfaces in force, as the settings file names them: "cli, mcp", "cli" or "mcp". */
        String interfaces() {
            return cli && mcp ? "cli, mcp" : cli ? "cli" : "mcp";
        }

        /** Whether an action that needs this access level is within the highest level allowed. */
        boolean allows(Access needed) {
            return maxAccess.covers(needed);
        }

        /**
         * The restrictions in one short line, for where there is little room: the server's window.
         * Empty when there is none. What each means is said in full by {@link #summary()}.
         */
        String inShort() {
            List<String> parts = new ArrayList<>();
            if (strict) {
                parts.add("strict");
            }
            if (!allowed.isEmpty()) {
                parts.add(allowed.size() == 1 ? "1 site allowed" : allowed.size() + " sites allowed");
            }
            if (!screenshots) {
                parts.add("no screenshots");
            }
            if (maxAccess != Access.WRITE) {
                parts.add("up to " + maxAccess.label());
            }
            if (sessionMaxMinutes > 0 || sessionIdleMinutes > 0) {
                parts.add("ends by itself");
            }
            if (!mcp) {
                parts.add("CLI only");
            } else if (!cli) {
                parts.add("MCP only");
            }
            return String.join(", ", parts);
        }

        /** The restrictions in a few words, for the user and for an agent; empty when there is none. */
        String summary() {
            List<String> parts = new ArrayList<>();
            if (strict) {
                parts.add("strict profile (every submission is confirmed by the user; a click that may change something counts as one)");
            }
            if (!allowed.isEmpty()) {
                parts.add("agents work only on " + String.join(", ", allowed));
            }
            if (!screenshots) {
                parts.add("no screenshots");
            }
            if (maxAccess != Access.WRITE) {
                parts.add("access up to " + maxAccess.label());
            }
            if (sessionMaxMinutes > 0) {
                parts.add("an authorization lasts at most " + sessionMaxMinutes + " min");
            }
            if (sessionIdleMinutes > 0) {
                parts.add("and ends after " + sessionIdleMinutes + " min without a command");
            }
            if (!mcp) {
                parts.add("agents come by the command line only (MCP is off)");
            } else if (!cli) {
                parts.add("agents come by MCP only (the command line is off)");
            }
            return String.join("; ", parts);
        }
    }

    /** The keys of the restrictions. */
    static final String PROFILE = "security.profile";
    static final String ALLOWED = "allowed.sites";
    static final String SCREENSHOTS = "screenshots";
    static final String MAX_ACCESS = "access.max";
    static final String SESSION_MAX = "session.max.minutes";
    static final String SESSION_IDLE = "session.idle.minutes";
    static final String INTERFACES = "interfaces";
    /** What the strict profile sets where the file says nothing else. */
    static final int STRICT_SESSION_MAX = 480;
    static final int STRICT_SESSION_IDLE = 30;

    /** A problem in the settings file: a few words for the user. */
    private static final class Slip extends Exception {
        private static final long serialVersionUID = 1L;

        Slip(String what) {
            super(what);
        }
    }

    private static Limits limits(Properties properties) throws Slip {
        String profile = properties.getProperty(PROFILE, "standard").trim().toLowerCase(Locale.ROOT);
        if (!profile.equals("standard") && !profile.equals("strict")) {
            throw new Slip("\"" + profile + "\" in " + PROFILE + " is neither standard nor strict");
        }
        boolean strict = profile.equals("strict");
        TreeSet<String> allowed = new TreeSet<>();
        for (String entry : properties.getProperty(ALLOWED, "").split("[,\\s]+")) {
            if (entry.isEmpty()) {
                continue;
            }
            String domain = domain(entry);
            if (domain == null) {
                throw new Slip("\"" + entry + "\" in " + ALLOWED + " is no domain");
            }
            allowed.add(domain);
        }
        String pictures = properties.getProperty(SCREENSHOTS, strict ? "off" : "on").trim().toLowerCase(Locale.ROOT);
        if (!pictures.equals("on") && !pictures.equals("off")) {
            throw new Slip("\"" + pictures + "\" in " + SCREENSHOTS + " is neither on nor off");
        }
        String level = properties.getProperty(MAX_ACCESS, Access.WRITE.wire()).trim();
        Access access = Access.of(level);
        if (access == null) {
            throw new Slip("\"" + level + "\" in " + MAX_ACCESS + " is none of read, explore, write");
        }
        boolean cli = false;
        boolean mcp = false;
        String interfaces = properties.getProperty(INTERFACES, "").trim().toLowerCase(Locale.ROOT);
        for (String entry : interfaces.split("[,\\s]+")) {
            switch (entry) {
                case "" -> { }
                case "cli" -> cli = true;
                case "mcp" -> mcp = true;
                default -> throw new Slip("\"" + entry + "\" in " + INTERFACES + " is neither cli nor mcp");
            }
        }
        if (!cli && !mcp) {
            // Nothing named is nothing taken away: an entry only ever takes something away.
            cli = true;
            mcp = true;
        }
        return new Limits(strict, List.copyOf(allowed), pictures.equals("on"), access,
                minutes(properties, SESSION_MAX, strict ? STRICT_SESSION_MAX : 0),
                minutes(properties, SESSION_IDLE, strict ? STRICT_SESSION_IDLE : 0), cli, mcp);
    }

    private static int minutes(Properties properties, String key, int fallback) throws Slip {
        String text = properties.getProperty(key);
        if (text == null || text.isBlank()) {
            return fallback;
        }
        try {
            int minutes = Integer.parseInt(text.trim());
            if (minutes >= 0 && minutes <= 7 * 24 * 60) {
                return minutes;
            }
        } catch (NumberFormatException e) {
            // said below
        }
        throw new Slip("\"" + text.trim() + "\" in " + key + " is no number of minutes between 0 and 10080");
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
            #
            # Restrictions. Each one takes something away from every agent; none gives anything.
            #
            # security.profile = strict       every submission is confirmed by you, a click that may change
            #                                 something counts as one, a tab is authorized for one named agent,
            #                                 no screenshots, and an authorization ends after 8 hours, or
            #                                 after 30 minutes without a command
            # allowed.sites = example.org     agents work on these sites and their subdomains only
            # screenshots = off               no agent takes a picture of a tab
            # access.max = explore            no session has more than this: read, explore or write
            # session.max.minutes = 240       an authorization lasts this long at most
            # session.idle.minutes = 20       and ends when no command came for this long
            # interfaces = cli                how agents may reach the tools: cli, mcp, or both (the default).
            #                                 With cli alone no MCP agent is let in; with mcp alone no command
            #                                 of the command line is
            #
            # A record of what agents did, on this machine only: one line of JSON for each tool call, in
            # audit.jsonl beside this file. It has ids, actions, times and outcomes, and nothing of a page.
            #
            # audit.log = on
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
        Limits limits;
        try {
            limits = limits(properties);
        } catch (Slip slip) {
            // A restriction that was meant and is not in force must not go unnoticed either.
            return new Rule(List.of(), slip.getMessage());
        }
        return domains.isEmpty() && limits.equals(Limits.NONE) ? Rule.NONE : new Rule(List.copyOf(domains), null, limits);
    }

    /** Whether the settings file asks for the record of what agents did. Only a plain "on" does. */
    static boolean audits(Path file) {
        if (!Files.exists(file)) {
            return false;
        }
        Properties properties = new Properties();
        try (Reader in = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            properties.load(in);
        } catch (IOException | IllegalArgumentException e) {
            return false;
        }
        return properties.getProperty(Audit.KEY, "off").trim().equalsIgnoreCase("on");
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
                    Audit.to(audits(file) ? file.toAbsolutePath().resolveSibling(Audit.FILE) : null);
                    if (!read.equals(rule)) {
                        rule = read;
                        Log.info(read.everything() ? "blocked sites: settings file unreadable, every site is refused"
                                : "blocked sites: " + read.domains().size() + " in force");
                        if (!read.everything() && !read.limits().equals(Limits.NONE)) {
                            Log.info("security policy: profile=" + (read.limits().strict() ? "strict" : "standard")
                                    + " allowed_sites=" + read.limits().allowed().size()
                                    + " screenshots=" + (read.limits().screenshots() ? "on" : "off")
                                    + " access_max=" + read.limits().maxAccess().wire()
                                    + " session_max_min=" + read.limits().sessionMaxMinutes()
                                    + " session_idle_min=" + read.limits().sessionIdleMinutes()
                                    + " interfaces=" + read.limits().interfaces().replace(", ", ","));
                        }
                    }
                }
                return rule;
            }
        };
    }
}
