package browsercontext;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * The skills for agents, as the jar carries them, and the putting of one where its agent looks
 * for skills. A skill tells an agent how to work with the tools; the texts are in the
 * repository's {@code skills} folder, one for each agent, and the build takes them into the jar.
 *
 * <p>Each agent has two: one for the MCP tools, and one for the same tools as commands of a
 * terminal ({@link Cli}), in {@code skills/mcp} and {@code skills/cli}. They have one name and one place, so an agent
 * has the one for the way it was set up and not both: a skill says how to reach the tools, and
 * an agent is not to change from one way to the other by itself.
 *
 * <p>A skill is put into a folder of the user's home, and only on the user's own command. One
 * that is there already and is not this one is left as it is, unless the user says to replace it:
 * it may be theirs.
 */
final class Skills {

    /** The skill's name, and so its folder's: the format wants the two the same. */
    static final String NAME = "tabgoblin";

    private Skills() {
    }

    /**
     * An agent that has a skill: its name on the command line and in the repository, its name as
     * people say it, where it looks for a user's skills below the home folder, and the files of its
     * skill. The places are from each agent's own documentation.
     */
    enum Agent {
        CLAUDE_CODE("claude-code", "Claude Code", List.of(".claude", "skills"), List.of("SKILL.md")),
        CODEX("codex", "Codex", List.of(".agents", "skills"), List.of("SKILL.md", "agents/openai.yaml")),
        COPILOT("copilot", "GitHub Copilot", List.of(".copilot", "skills"), List.of("SKILL.md"));

        private final String id;
        private final String called;
        private final List<String> place;
        private final List<String> files;

        Agent(String id, String called, List<String> place, List<String> files) {
            this.id = id;
            this.called = called;
            this.place = place;
            this.files = files;
        }

        String id() {
            return id;
        }

        String called() {
            return called;
        }

        /** The files of this agent's skill, as paths below the skill's folder. */
        List<String> files() {
            return files;
        }

        /** Where this agent's skill goes for a user with this home folder. */
        Path folder(Path home) {
            Path folder = home;
            for (String part : place) {
                folder = folder.resolve(part);
            }
            return folder.resolve(NAME);
        }

        /** The agent of that name on the command line, or null if there is none. */
        static Agent named(String id) {
            return Arrays.stream(values()).filter(agent -> agent.id.equals(id)).findFirst().orElse(null);
        }

        /** The names a command line may give, for a message. */
        static String names() {
            return Arrays.stream(values()).map(Agent::id).collect(Collectors.joining(", "));
        }
    }

    /** How putting a skill in its place ended. */
    enum Outcome {
        /** It was not there, and is now. */
        INSTALLED,
        /** It was there already, file for file. Nothing was written. */
        UP_TO_DATE,
        /** Something else was there, and the user said to replace it. */
        REPLACED,
        /** Something else is there, and was left as it is. */
        DIFFERENT
    }

    /** Where a skill went, or would have gone, and how that ended. */
    record Result(Agent agent, Path folder, Outcome outcome, boolean commandLine) {

        Result(Agent agent, Path folder, Outcome outcome) {
            this(agent, folder, outcome, false);
        }

        /** Whether the skill is in its place now. */
        boolean ok() {
            return outcome != Outcome.DIFFERENT;
        }

        /** What the user is told. */
        String says() {
            String skill = "the TabGoblin skill for " + agent.called() + (commandLine ? ", for the command line," : "");
            return switch (outcome) {
                case INSTALLED -> "Installed " + skill + " in " + folder + "\n"
                        + "Start " + agent.called() + " again if it does not show the skill. " + (commandLine
                                ? "Nothing is registered for the command line:\nthe agent has to find the command tabgoblin, "
                                        + "or be told its line (--setup " + agent.id() + " --mode cli prints it)."
                                : "A skill does not add the server:\n"
                                        + "the agent has to be told about the server as well (installation guide, step 5).");
                case UP_TO_DATE -> "Nothing to do: " + skill + " is already in " + folder;
                case REPLACED -> "Replaced " + skill + " in " + folder + "\n"
                        + "Start " + agent.called() + " again if it still shows the old one.";
                case DIFFERENT -> "There is a skill in " + folder + " that is not this one. It was left as it is.\n"
                        + "To overwrite it, run the command again with --replace.";
            };
        }
    }

    /**
     * Puts an agent's skill into its folder below the user's home.
     *
     * @param replace overwrite a skill that is there and is not this one
     */
    static Result install(Agent agent, Path home, boolean replace) throws IOException {
        return install(agent, home, replace, false);
    }

    /**
     * @param commandLine the skill for the tools as commands of a terminal, in place of the one
     *                    for the MCP tools. Either takes the other's place without being told to
     *                    replace it: that one is this server's own, and not the user's
     */
    static Result install(Agent agent, Path home, boolean replace, boolean commandLine) throws IOException {
        Path folder = agent.folder(home);
        Map<String, byte[]> files = bundled(agent, commandLine);
        boolean taken = taken(folder);
        if (taken && same(folder, files)) {
            return new Result(agent, folder, Outcome.UP_TO_DATE, commandLine);
        }
        if (taken && !replace && !same(folder, bundled(agent, !commandLine))) {
            return new Result(agent, folder, Outcome.DIFFERENT, commandLine);
        }
        for (Map.Entry<String, byte[]> file : files.entrySet()) {
            Path to = resolve(folder, file.getKey());
            Files.createDirectories(to.getParent());
            Files.write(to, file.getValue());
        }
        return new Result(agent, folder, taken ? Outcome.REPLACED : Outcome.INSTALLED, commandLine);
    }

    /** The files of an agent's skill as the jar carries them, by their path below the skill's folder. */
    static Map<String, byte[]> bundled(Agent agent) throws IOException {
        return bundled(agent, false);
    }

    /** @param commandLine the agent's skill for the command line, which the jar has under {@code skills/cli}, where the other is under {@code skills/mcp} */
    static Map<String, byte[]> bundled(Agent agent, boolean commandLine) throws IOException {
        Map<String, byte[]> files = new LinkedHashMap<>();
        for (String file : agent.files()) {
            String resource = "/skills/" + (commandLine ? "cli/" : "mcp/") + agent.id() + "/" + NAME + "/" + file;
            try (InputStream in = Skills.class.getResourceAsStream(resource)) {
                if (in == null) {
                    throw new IOException("This build carries no " + resource.substring(1) + ". Build the server again.");
                }
                files.put(file, in.readAllBytes());
            }
        }
        return files;
    }

    /** Whether something is at the skill's place: a folder with anything in it, or a file. */
    private static boolean taken(Path folder) throws IOException {
        if (!Files.exists(folder)) {
            return false;
        }
        if (!Files.isDirectory(folder)) {
            return true;
        }
        try (Stream<Path> inside = Files.list(folder)) {
            return inside.findAny().isPresent();
        }
    }

    /** Whether the folder has each of these files with exactly this content. */
    private static boolean same(Path folder, Map<String, byte[]> files) throws IOException {
        if (!Files.isDirectory(folder)) {
            return false;
        }
        for (Map.Entry<String, byte[]> file : files.entrySet()) {
            Path at = resolve(folder, file.getKey());
            if (!Files.isRegularFile(at) || !Arrays.equals(Files.readAllBytes(at), file.getValue())) {
                return false;
            }
        }
        return true;
    }

    private static Path resolve(Path folder, String file) {
        Path path = folder;
        for (String part : file.split("/")) {
            path = path.resolve(part);
        }
        return path;
    }
}
