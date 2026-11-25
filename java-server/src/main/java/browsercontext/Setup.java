package browsercontext;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Locale;

/**
 * Setting TabGoblin up for one agent, on the user's own command. The skill is put in its place;
 * the rest is said, ready to be pasted or followed: the one line that tells the agent about the
 * server, with the paths of this very server; where the extension's folder is; and how to pair.
 *
 * <p>Nothing of another program is run or written here. An agent is told about a server by that
 * agent's own command, and it is the user who runs it.
 */
final class Setup {

    /** The server's name in an agent's settings. */
    static final String NAME = "tabgoblin";

    private Setup() {
    }

    /**
     * This server as it lies on the disk.
     *
     * @param java      the Java it runs on, as an agent's program has to start it
     * @param jar       its jar
     * @param launcher  the command of a download that starts it for a person, or null where there is none
     * @param extension the folder of the extension that came with it, or null if none is found
     */
    record Self(Path java, Path jar, Path launcher, Path extension) {

        /** The server that is running, or null if it does not run from a jar: there is nothing then to tell an agent about. */
        static Self running() {
            try {
                Path jar = Path.of(Setup.class.getProtectionDomain().getCodeSource().getLocation().toURI());
                Path java = ProcessHandle.current().info().command().map(Path::of).orElse(null);
                if (java == null || !Files.isRegularFile(jar)) {
                    return null;
                }
                return at(java, jar, System.getProperty("os.name", ""));
            } catch (java.net.URISyntaxException | RuntimeException e) {
                return null;
            }
        }

        /**
         * A server from where its Java and its jar are. Beside the jar of a download lie its
         * launcher and the extension; a build from source has the extension in the checkout.
         */
        static Self at(Path java, Path jar, String system) {
            boolean windows = system.toLowerCase(Locale.ROOT).contains("win");
            // An agent's program talks to the server through its input and output: on Windows that
            // is the Java with a console, also where this process is the one without.
            Path console = java.resolveSibling("java.exe");
            if (windows && java.getFileName().toString().equalsIgnoreCase("javaw.exe") && Files.isRegularFile(console)) {
                java = console;
            }
            Path folder = jar.toAbsolutePath().getParent();
            Path launcher = folder.resolve(windows ? "tabgoblin.cmd" : "tabgoblin");
            Path extension = folder.resolve("extension");
            if (!Files.isRegularFile(extension.resolve("manifest.json"))) {
                // java-server/target/<jar>, in a checkout
                Path checkout = folder.getParent() == null ? null : folder.getParent().getParent();
                extension = checkout == null ? null : checkout.resolve("chrome-extension").resolve("dist");
                if (extension == null || !Files.isRegularFile(extension.resolve("manifest.json"))) {
                    extension = null;
                }
            }
            return new Self(java.toAbsolutePath(), jar.toAbsolutePath(), Files.isRegularFile(launcher) ? launcher : null, extension);
        }

        /** The command an agent's program starts, each part in quotes: a path may have a space in it. */
        String command() {
            return quoted(java) + " -jar " + quoted(jar);
        }

        /** The command a person runs, with one option. */
        String forAPerson(String option) {
            return (launcher != null ? quoted(launcher) : command()) + " " + option;
        }

        private static String quoted(Path path) {
            return "\"" + path + "\"";
        }
    }

    /**
     * The line that tells an agent about this server, for the user to run: the agent's own command
     * for adding an MCP server, as its documentation had it on 2026-11-23.
     */
    static String registration(Skills.Agent agent, Self self) {
        return switch (agent) {
            // For the user, and so for every project: without the scope it would be for the folder the command is run in.
            // Each agent is named to the server: by that it has a key of its own, and its tabs again after a restart.
            case CLAUDE_CODE -> "claude mcp add --scope user " + NAME + " -- " + self.command() + " --agent " + agent.id();
            case CODEX -> "codex mcp add " + NAME + " -- " + self.command() + " --agent " + agent.id();
            case COPILOT -> "copilot mcp add " + NAME + " -- " + self.command() + " --agent " + agent.id();
        };
    }

    /**
     * What the user is told: what was done, and what is theirs to do, in order.
     *
     * @param skill how putting the skill in its place ended
     */
    static String says(Skills.Result skill, Self self) {
        return says(skill, self, false);
    }

    /**
     * The command an agent runs in its terminal for one tool, where it is set up for the command
     * line: the download's own command, or the Java and the jar. Nothing is registered for it.
     */
    static String commandLine(Skills.Agent agent, Self self, String command) {
        return self.forAPerson(command) + " --agent " + agent.id();
    }

    /**
     * @param commandLine the agent is to run the tools as commands in its terminal (--mode cli),
     *                    and not to be told about an MCP server
     */
    static String says(Skills.Result skill, Self self, boolean commandLine) {
        Skills.Agent agent = skill.agent();
        String skillLine = switch (skill.outcome()) {
            case INSTALLED -> "installed in " + skill.folder();
            case UP_TO_DATE -> "already in " + skill.folder();
            case REPLACED -> "replaced in " + skill.folder();
            case DIFFERENT -> "NOT installed. There is a skill in " + skill.folder() + " that is not this one,\n"
                    + "   and it was left as it is. To overwrite it, run this command again with --replace.";
        };
        StringBuilder said = new StringBuilder();
        said.append("TabGoblin setup for ").append(agent.called()).append("\n\n");
        said.append("1. The skill, which tells the agent how to use the tools: ").append(skillLine).append("\n\n");
        if (commandLine) {
            said.append("2. The command. Nothing is registered: ").append(agent.called()).append(" runs the tools as commands in its\n");
            said.append("   terminal, each with its own name behind it. This one lists your tabs:\n\n");
            said.append("     ").append(commandLine(agent, self, "status")).append("\n\n");
            said.append("   The skill calls the command tabgoblin. ");
            said.append(self.launcher() != null
                    ? "Put this folder on your PATH so that the agent finds it:\n\n     " + self.launcher().getParent() + "\n\n"
                            + "   or tell the agent the line above once, for instance in its instructions file.\n\n"
                    : "A build from source has no such command: tell the agent\n"
                            + "   the line above once, for instance in its instructions file.\n\n");
            said.append("   The tools and the rules are the same as through MCP. To use MCP instead, run this setup\n");
            said.append("   with --mode mcp; the agent does not change from one to the other by itself.\n\n");
        } else {
            said.append("2. The server. Run this line once, so that ").append(agent.called()).append(" knows it:\n\n");
            said.append("     ").append(registration(agent, self)).append("\n\n");
        }
        if (!commandLine && agent == Skills.Agent.COPILOT) {
            said.append("   That is for Copilot's command line. In VS Code, run \"MCP: Add Server\" from the Command Palette\n");
            said.append("   and give it what stands behind the two dashes as the command.\n\n");
        }
        said.append("3. The extension. In Chrome, open chrome://extensions, switch Developer mode on, press\n");
        said.append("   Load unpacked and choose this folder:\n\n");
        if (self.extension() != null) {
            said.append("     ").append(self.extension()).append("\n\n");
        } else {
            said.append("     (not found beside this server: it is the folder \"extension\" of a download, and\n");
            said.append("     chrome-extension/dist of a build from source, once the extension is built)\n\n");
        }
        said.append("4. Pair, once. Open the server's window:\n\n");
        said.append("     ").append(self.forAPerson("--panel")).append("\n\n");
        said.append("   Press Copy next to Pairing token there. Click the goblin in Chrome's toolbar, paste the\n");
        said.append("   token and press Save and connect.\n\n");
        if (commandLine) {
            // An agent that comes by commands is in the popup's list once it has run one: the status is the first.
            said.append("Then start ").append(agent.called()).append(" anew and ask it for the browser status. After that, open a website,\n");
            said.append("click the goblin on that tab and press Authorize.");
        } else {
            said.append("Then start ").append(agent.called()).append(" anew, open a website, click the goblin on that tab, press\n");
            said.append("Authorize, and ask the agent for the browser status.");
        }
        return said.toString();
    }
}
