package browsercontext;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.UnaryOperator;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * The tools as commands of a terminal, for an agent that runs programs and has no MCP:
 *
 * <pre>
 *   tabgoblin tools --json
 *   tabgoblin status --agent claude-code
 *   tabgoblin click --agent claude-code --session s1 --ref 12
 * </pre>
 *
 * <p>It is an adapter and nothing else, beside the one for MCP and not on top of it. The commands
 * and their arguments are the tools' one definition ({@link ToolDefs}), read here instead of
 * written again. A command is one tool call, sent through the same link an MCP client's process is
 * ({@link Link}), with the same proofs, to the same server, which runs it as it runs any call
 * ({@link Commands}); nothing of MCP is spoken or run for it. What a command may do is decided
 * where it is decided for MCP, in the server and the extension, and nowhere here.
 *
 * <p>Each command is a process of its own. The agent is the same at every one by its key
 * ({@link AgentKeys}), which is why a command names its agent, and the server keeps that agent's
 * connection to the browser between commands ({@link Hub}). Nothing is sent twice: a command
 * whose answer did not come says that its outcome is unknown.
 */
final class Cli {

    /** The tool answered, and not with an error. */
    static final int EXIT_OK = 0;
    /** The tool answered with an error: nothing was done, or it says what was. */
    static final int EXIT_FAILED = 1;
    /** The command line was not understood. Nothing was sent. */
    static final int EXIT_USAGE = 2;
    /** No server could be reached, or it would not take this command. Nothing was sent. */
    static final int EXIT_NO_SERVER = 3;
    /** The command was sent and no answer came, or the answer says so itself: whether it took effect is unknown. */
    static final int EXIT_UNKNOWN = 4;

    /** The codes of a tool's error that leave the outcome open, as the tool reference has them. */
    static final Set<String> UNKNOWN_OUTCOME = Set.of("TIMEOUT", "CONNECTION_LOST", "PAGE_TIMEOUT", "PAGE_NAVIGATED", "INTERRUPTED");

    /** Longer than any tool's own limit in the server: a command that has no answer by then never gets one. */
    static final long ANSWER_WITHIN_MS = 150_000;

    /** The options that are the server's own, as {@link McpMain.Options} reads them: with a value, and without. */
    static final Set<String> SERVER_VALUES = Set.of("--agent", "--port", "--token-file", "--extension-origin", "--settings");
    static final Set<String> SERVER_FLAGS = Set.of("--panel", "--no-panel");
    /** The options of the command line itself. */
    static final Set<String> OWN = Set.of("--json", "--help", "-h", "--out", "--args", "--args-file");

    private static final String PREFIX = "browser_";
    private static final ObjectMapper JSON = new ObjectMapper();

    /** Makes the link of one command, to the one server. */
    interface Links {
        Link open(InputStream in, OutputStream out, McpMain.Options options) throws IOException;
    }

    /** What a command line asks for. */
    record Invocation(String tool, ObjectNode arguments, List<String> serverArgs, Path out, boolean help, boolean json) {
    }

    private final PrintStream out;
    private final PrintStream err;
    private final Links links;
    private final InputStream stdin;
    private long answerWithin = ANSWER_WITHIN_MS;

    /** The command that is running: its tool and the way to the link, from when it was sent to when it was answered. */
    private volatile String running;
    private volatile OutputStream toLink;

    /**
     * @param out   where the one JSON object of the answer goes: the process's output
     * @param err   where everything else goes
     * @param stdin read only when the command line says so, with "--args -"
     */
    Cli(PrintStream out, PrintStream err, InputStream stdin, Links links) {
        this.out = out;
        this.err = err;
        this.stdin = stdin;
        this.links = links;
    }

    /** For tests: a shorter wait for an answer. */
    Cli answerWithin(long ms) {
        answerWithin = ms;
        return this;
    }

    /** Whether a command line is one for this: it begins with a word, where the server's own begin with an option. */
    static boolean handles(String[] args) {
        return args.length > 0 && !args[0].startsWith("-");
    }

    // ---- The commands: the tools' definitions, and nothing beside them

    /** The tools as the server defines them, for both interfaces. */
    static List<ToolDefs.Tool> tools() {
        return ToolDefs.ALL;
    }

    /** A tool's name as a command: browser_press_key is press-key. */
    static String commandOf(String tool) {
        return tool.substring(PREFIX.length()).replace('_', '-');
    }

    /** The tool a command names: by its command name, with dashes or underscores, or by the tool's own name. Null if none. */
    static ToolDefs.Tool toolOf(String command) {
        String wanted = command.toLowerCase(Locale.ROOT).replace('-', '_');
        String name = wanted.startsWith(PREFIX) ? wanted : PREFIX + wanted;
        return tools().stream().filter(tool -> tool.name().equals(name)).findFirst().orElse(null);
    }

    private static JsonNode schemaOf(ToolDefs.Tool tool) {
        return tool.schema();
    }

    private static String optionOf(String property) {
        return "--" + property.replace('_', '-');
    }

    /** What "tools --json" prints: every command with its description and the schema of its arguments. */
    static ObjectNode catalogue() {
        ObjectNode all = JSON.createObjectNode();
        all.put("ok", true);
        all.put("name", "TabGoblin");
        all.put("version", McpMain.version());
        all.put("usage", "tabgoblin <command> --agent <name> [--<argument> <value> ...] [--args <json object>]");
        all.put("instructions", McpMain.INSTRUCTIONS);
        ArrayNode list = all.putArray("tools");
        for (ToolDefs.Tool tool : tools()) {
            ObjectNode one = list.addObject();
            one.put("command", commandOf(tool.name()));
            one.put("tool", tool.name());
            one.put("title", tool.title());
            one.put("description", tool.description());
            one.put("readOnly", tool.readOnly());
            one.put("structuredResult", tool.structured());
            one.set("inputSchema", schemaOf(tool));
        }
        ObjectNode options = all.putObject("options");
        options.put("--agent <name>", "Who the agent is: the name of its key. Required by every command but tools; or set BCMCP_AGENT. "
                + "The same name at every command is the same agent, with the same sessions.");
        options.put("--<argument> <value>", "One argument of the tool, by its name in inputSchema; a dash may stand for an underscore. "
                + "A boolean needs no value. An array or an object is given as JSON.");
        options.put("--args <json object>", "All arguments as one JSON object, as an MCP client would send them. \"--args -\" reads it "
                + "from standard input. Single arguments given beside it come on top.");
        options.put("--args-file <path>", "The same, read from a file.");
        options.put("--out <path>", "With screenshot: write the image to this file, and say its path in place of the base64 data.");
        options.put("--help", "After a command: its description and arguments as text.");
        ObjectNode output = all.putObject("output");
        output.put("stdout", "One JSON object. ok:true with text, and result (the object of a tool that returns one) or image "
                + "(mimeType with base64, or with file under --out). ok:false with error.code and error.message, and "
                + "outcome:\"unknown\" where it is not known whether the command took effect.");
        output.put("stderr", "Diagnostics: the server's log lines for this agent. Never part of the result.");
        ObjectNode codes = all.putObject("exitCodes");
        codes.put("0", "The tool answered, and not with an error.");
        codes.put("1", "The tool answered with an error; error.code says which.");
        codes.put("2", "The command line was not understood. Nothing was sent.");
        codes.put("3", "No server could be reached, or it did not take the command. Nothing was sent.");
        codes.put("4", "Outcome unknown: the command was sent and no answer came. It was not retried; inspect the page before repeating it.");
        return all;
    }

    /** The same for a person: one line for each command. */
    static String list() {
        StringBuilder said = new StringBuilder("TabGoblin commands (each is the tool of the same name, with the same rules):\n\n");
        for (ToolDefs.Tool tool : tools()) {
            said.append(String.format("  %-16s%s%n", commandOf(tool.name()), tool.title()));
        }
        said.append("\n  tabgoblin tools --json            every command with its description and argument schema, as JSON\n");
        said.append("  tabgoblin <command> --help        one command's description and arguments\n");
        said.append("  tabgoblin <command> --agent <name> [--<argument> <value> ...]\n");
        return said.toString();
    }

    /** One command's description and arguments, as text. */
    static String help(ToolDefs.Tool tool) {
        JsonNode schema = schemaOf(tool);
        Set<String> required = required(schema);
        StringBuilder said = new StringBuilder("tabgoblin " + commandOf(tool.name()) + " --agent <name>");
        required.forEach(name -> said.append(' ').append(optionOf(name)).append(" <").append(typeOf(schema.path("properties").path(name))).append('>'));
        said.append("\n\n").append(tool.description()).append("\n\nArguments (the tool ").append(tool.name()).append("):\n");
        for (var property : schema.path("properties").properties()) {
            JsonNode about = property.getValue();
            said.append("  ").append(optionOf(property.getKey())).append(" <").append(typeOf(about)).append('>')
                    .append(required.contains(property.getKey()) ? "  (required)" : "").append('\n');
            if (about.has("enum")) {
                said.append("      one of: ").append(about.get("enum")).append('\n');
            }
            said.append("      ").append(about.path("description").asString("")).append('\n');
        }
        said.append("\nAll arguments at once: --args '<json object>', --args - (standard input) or --args-file <path>.\n");
        return said.toString();
    }

    private static String typeOf(JsonNode property) {
        String type = property.path("type").asString("string");
        return type.equals("array") || type.equals("object") ? "json " + type : type;
    }

    private static Set<String> required(JsonNode schema) {
        Set<String> required = new java.util.LinkedHashSet<>();
        schema.path("required").forEach(name -> required.add(name.asString()));
        return required;
    }

    // ---- The command line

    /**
     * Reads a command line against the tool's own schema. Nothing is guessed: an option the tool
     * does not have, a value of another type and a missing required argument are refused here,
     * before anything is sent. What an argument may be beyond its type the server decides, as for MCP.
     */
    Invocation parse(String[] args) throws McpMain.UsageException {
        String command = args[0];
        boolean listing = command.equals("tools");
        ToolDefs.Tool tool = listing ? null : toolOf(command);
        if (!listing && tool == null) {
            throw new McpMain.UsageException("Unknown command: " + command + ". \"tabgoblin tools\" lists the commands.");
        }
        JsonNode properties = listing ? JSON.createObjectNode() : schemaOf(tool).path("properties");
        ObjectNode given = JSON.createObjectNode();
        ObjectNode whole = null;
        List<String> serverArgs = new ArrayList<>();
        Path file = null;
        boolean help = false;
        boolean json = false;
        for (int i = 1; i < args.length; i++) {
            String arg = args[i];
            String inline = null;
            int equals = arg.indexOf('=');
            if (arg.startsWith("--") && equals > 2) {
                inline = arg.substring(equals + 1);
                arg = arg.substring(0, equals);
            }
            String next = inline != null ? inline : i + 1 < args.length ? args[i + 1] : null;
            if (SERVER_FLAGS.contains(arg)) {
                serverArgs.add(arg);
            } else if (SERVER_VALUES.contains(arg)) {
                serverArgs.add(arg);
                serverArgs.add(value(arg, next));
                i += inline == null ? 1 : 0;
            } else if (arg.equals("--help") || arg.equals("-h")) {
                help = true;
            } else if (arg.equals("--json")) {
                json = true;
            } else if (arg.equals("--out")) {
                file = Path.of(value(arg, next));
                i += inline == null ? 1 : 0;
            } else if (arg.equals("--args") || arg.equals("--args-file")) {
                String text = value(arg, next);
                i += inline == null ? 1 : 0;
                whole = object(arg, arg.equals("--args-file") ? read(Path.of(text)) : text.equals("-") ? readAll(stdin) : text);
            } else if (arg.startsWith("--") && !listing) {
                String name = arg.substring(2).replace('-', '_');
                JsonNode about = properties.path(name);
                if (about.isMissingNode()) {
                    throw new McpMain.UsageException(commandOf(tool.name()) + " has no argument " + arg + ". \"tabgoblin "
                            + commandOf(tool.name()) + " --help\" lists its arguments.");
                }
                if (about.path("type").asString("").equals("boolean")) {
                    // A switch: on by being named. A value is taken only where it is one.
                    boolean valued = next != null && (next.equals("true") || next.equals("false"));
                    given.put(name, !valued || next.equals("true"));
                    i += valued && inline == null ? 1 : 0;
                } else {
                    given.set(name, typed(arg, about, value(arg, next)));
                    i += inline == null ? 1 : 0;
                }
            } else {
                throw new McpMain.UsageException("Not understood: " + arg + ".");
            }
        }
        if (listing) {
            return new Invocation(null, given, serverArgs, null, help, json);
        }
        ObjectNode arguments = JSON.createObjectNode();
        if (whole != null) {
            for (var entry : whole.properties()) {
                JsonNode about = properties.path(entry.getKey());
                if (about.isMissingNode()) {
                    throw new McpMain.UsageException(commandOf(tool.name()) + " has no argument \"" + entry.getKey() + "\".");
                }
                check("\"" + entry.getKey() + "\"", about, entry.getValue());
                arguments.set(entry.getKey(), entry.getValue());
            }
        }
        arguments.setAll(given);
        if (!help) {
            for (String name : required(schemaOf(tool))) {
                if (!arguments.has(name)) {
                    throw new McpMain.UsageException(commandOf(tool.name()) + " needs " + optionOf(name) + ".");
                }
            }
        }
        if (file != null && !tool.name().equals("browser_screenshot")) {
            throw new McpMain.UsageException("--out goes with screenshot: no other command returns an image.");
        }
        return new Invocation(tool.name(), arguments, serverArgs, file, help, json);
    }

    private static String value(String option, String next) throws McpMain.UsageException {
        if (next == null) {
            throw new McpMain.UsageException(option + " needs a value.");
        }
        return next;
    }

    /** A value of the command line as the type the tool's schema gives its argument. */
    private static JsonNode typed(String option, JsonNode about, String text) throws McpMain.UsageException {
        JsonNode value;
        switch (about.path("type").asString("string")) {
            case "integer" -> {
                try {
                    long number = Long.parseLong(text.trim());
                    value = number == (int) number ? JSON.getNodeFactory().numberNode((int) number) : JSON.getNodeFactory().numberNode(number);
                } catch (NumberFormatException e) {
                    throw new McpMain.UsageException(option + " takes a whole number, not \"" + text + "\".");
                }
            }
            case "array", "object" -> {
                try {
                    value = JSON.readTree(text);
                } catch (RuntimeException e) {
                    throw new McpMain.UsageException(option + " takes JSON (" + about.path("type").asString() + "), and this is not JSON.");
                }
            }
            default -> value = JSON.getNodeFactory().stringNode(text);
        }
        check(option, about, value);
        return value;
    }

    private static void check(String what, JsonNode about, JsonNode value) throws McpMain.UsageException {
        String type = about.path("type").asString("string");
        boolean fits = switch (type) {
            case "integer" -> value.isIntegralNumber();
            case "boolean" -> value.isBoolean();
            case "array" -> value.isArray();
            case "object" -> value.isObject();
            default -> value.isString();
        };
        if (!fits) {
            throw new McpMain.UsageException(what + " takes " + (type.equals("integer") ? "a whole number" : "a value of type " + type) + ".");
        }
        if (about.has("enum")) {
            boolean among = false;
            for (JsonNode allowed : about.get("enum")) {
                among |= allowed.equals(value);
            }
            if (!among) {
                throw new McpMain.UsageException(what + " is one of " + about.get("enum") + ", not " + value + ".");
            }
        }
    }

    private static ObjectNode object(String option, String text) throws McpMain.UsageException {
        try {
            if (JSON.readTree(text) instanceof ObjectNode object) {
                return object;
            }
        } catch (RuntimeException e) {
            // said below
        }
        throw new McpMain.UsageException(option + " takes one JSON object with the tool's arguments.");
    }

    private static String read(Path file) throws McpMain.UsageException {
        try {
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new McpMain.UsageException("--args-file: the file cannot be read.");
        }
    }

    private static String readAll(InputStream in) throws McpMain.UsageException {
        try {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new McpMain.UsageException("--args -: standard input cannot be read.");
        }
    }

    // ---- Running a command

    /** Runs one command line, prints its one answer, and says the exit code. */
    int run(String[] args, UnaryOperator<String> environment) {
        Invocation asked;
        McpMain.Options options;
        try {
            asked = parse(args);
            options = McpMain.Options.parse(asked.serverArgs().toArray(String[]::new), environment);
            if (asked.tool() != null && !asked.help() && options.agent() == null) {
                throw new McpMain.UsageException("Name the agent with --agent <name> (or BCMCP_AGENT), the same name at every "
                        + "command: by it the commands are one agent, and have its sessions.");
            }
        } catch (McpMain.UsageException e) {
            return fail(null, "USAGE", e.getMessage(), false, EXIT_USAGE);
        }
        if (asked.tool() == null) {
            out.println(asked.json() ? JSON.writeValueAsString(catalogue()) : list());
            return EXIT_OK;
        }
        if (asked.help()) {
            out.println(help(toolOf(asked.tool())));
            return EXIT_OK;
        }
        return call(asked, options);
    }

    /** What the link wrote for the agent, line by line. */
    private static final class Lines extends OutputStream {
        private final BlockingQueue<String> lines = new LinkedBlockingQueue<>();
        private final ByteArrayOutputStream line = new ByteArrayOutputStream();

        @Override
        public synchronized void write(int b) {
            if (b == '\n') {
                lines.add(line.toString(StandardCharsets.UTF_8));
                line.reset();
            } else {
                line.write(b);
            }
        }
    }

    private int call(Invocation asked, McpMain.Options options) {
        String tool = asked.tool();
        BlockedSites.Rule policy = BlockedSites.source(options.settings()).get();
        if (!policy.everything() && !policy.limits().cli()) {
            return fail(tool, "INTERFACE_NOT_ALLOWED", BrowserService.interfaceOff(true, policy.limits()), false, EXIT_NO_SERVER);
        }
        Lines answers = new Lines();
        PipedOutputStream to = new PipedOutputStream();
        Link link;
        try {
            link = links.open(new PipedInputStream(to, 1 << 16), answers, options);
        } catch (IOException e) {
            return fail(tool, "ERROR", "The command could not be set up.", false, EXIT_NO_SERVER);
        }
        if (!link.connect()) {
            if (Hub.INTERFACE_NOT_ALLOWED.equals(link.refusal())) {
                return fail(tool, "INTERFACE_NOT_ALLOWED", "The command line is off by the TabGoblin server's settings file "
                        + "(interfaces = mcp): no agent comes this way, and nothing was sent. Only the user can change that. "
                        + "Do not switch to MCP by yourself; tell the user.", false, EXIT_NO_SERVER);
            }
            if ("agent_in_use".equals(link.refusal())) {
                return fail(tool, "AGENT_IN_USE", "An agent with the identity \"" + options.agent() + "\" is connected to the "
                        + "TabGoblin server through MCP, and a key has one agent at a time. Nothing was sent. Use that "
                        + "agent's MCP tools, or run the commands under another --agent name: a new agent, with no tab "
                        + "until the user authorizes one. Do not switch by yourself; tell the user.", false, EXIT_NO_SERVER);
            }
            return fail(tool, "NO_SERVER", "The TabGoblin server could not be reached or started on this machine"
                    + (link.refusal() == null ? "" : " (" + link.refusal() + ")") + ". Nothing was sent. Tell the user.", false,
                    EXIT_NO_SERVER);
        }
        CompletableFuture<Link.End> ended = new CompletableFuture<>();
        Thread passing = new Thread(() -> ended.complete(link.run()), "bcmcp-cli-link");
        passing.setDaemon(true);
        passing.start();
        try {
            // The one message of this command, in the command line's own words: no MCP is spoken for it.
            ObjectNode call = JSON.createObjectNode().put("type", Commands.CALL).put("tool", tool);
            call.set("arguments", asked.arguments());
            toLink = to;
            running = tool;
            send(to, call);
            JsonNode answer = answer(answers, ended, answerWithin);
            boolean ours;
            synchronized (this) {
                // Either this thread reports the command, or the one that cancels it: never both.
                ours = running != null;
                running = null;
            }
            if (!ours) {
                return EXIT_UNKNOWN;
            }
            if (answer == null) {
                boolean late = !ended.isDone();
                if (late) {
                    cancel(to);
                }
                return fail(tool, late ? "TIMEOUT" : "CONNECTION_LOST", (late
                        ? "No answer came from the TabGoblin server in time, and the command was cancelled."
                        : "The connection to the TabGoblin server ended while this command was running.")
                        + " Whether it took effect in the browser is unknown, and it was not retried: inspect the page before "
                        + "repeating it.", true, EXIT_UNKNOWN);
            }
            return report(asked, answer);
        } catch (IOException | InterruptedException e) {
            boolean sent = running != null;
            running = null;
            return fail(tool, "CONNECTION_LOST", sent
                    ? "The connection to the TabGoblin server ended while this command was running. Whether it took effect in "
                            + "the browser is unknown, and it was not retried: inspect the page before repeating it."
                    : "The connection to the TabGoblin server ended before the command was sent. Nothing was sent.",
                    sent, sent ? EXIT_UNKNOWN : EXIT_NO_SERVER);
        } finally {
            try {
                // The end of the input is this agent's command leaving; the server keeps the agent.
                to.close();
            } catch (IOException e) {
                // ending anyway
            }
        }
    }

    /**
     * The process is being ended while its command runs (Ctrl+C, a signal, the agent's own time
     * limit): the server is told to stop the command in the browser, and the answer says that its
     * outcome is unknown. For the shutdown hook; it does nothing when no command is running.
     */
    void cancelled() {
        String tool;
        synchronized (this) {
            tool = running;
            running = null;
        }
        OutputStream to = toLink;
        if (tool == null || to == null) {
            return;
        }
        cancel(to);
        try {
            // The link passes the message on from a thread of its own: it is given the moment for it.
            Thread.sleep(300);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        fail(tool, "CANCELLED", "The command was cancelled while it was running. Whether it took effect in the browser is "
                + "unknown, and it was not retried: inspect the page before repeating it.", true, EXIT_UNKNOWN);
    }

    private void cancel(OutputStream to) {
        ObjectNode cancel = JSON.createObjectNode().put("type", Commands.CANCEL).put("reason", "the command's process is ending");
        try {
            send(to, cancel);
        } catch (IOException e) {
            // The way to the server is gone as well: there is nobody to tell.
        }
    }

    private static void send(OutputStream to, JsonNode message) throws IOException {
        synchronized (to) {
            to.write((JSON.writeValueAsString(message) + "\n").getBytes(StandardCharsets.UTF_8));
            to.flush();
        }
    }

    /** The server's answer to the call, or null: the link ended without one, or none came in time. */
    private JsonNode answer(Lines from, CompletableFuture<Link.End> ended, long within) throws InterruptedException {
        long until = System.currentTimeMillis() + within;
        boolean last = false;
        while (true) {
            String line = from.lines.poll(100, TimeUnit.MILLISECONDS);
            if (line != null) {
                try {
                    JsonNode message = JSON.readTree(line);
                    String type = message.path("type").asString("");
                    if (type.equals(Commands.RESULT) || type.equals(Commands.ERROR)) {
                        return message;
                    }
                } catch (RuntimeException e) {
                    // not a message: left out
                }
                continue;
            }
            if (last || System.currentTimeMillis() > until || running == null) {
                // Also when the command was cancelled meanwhile: a cancelled call gets no answer.
                return null;
            }
            // What the link wrote before it ended is still read: once more round after its end.
            last = ended.isDone();
        }
    }

    /** Prints a tool's answer as the one JSON object of this command, and says the exit code. */
    private int report(Invocation asked, JsonNode answer) throws IOException {
        String tool = asked.tool();
        if (answer.path("type").asString("").equals(Commands.ERROR)) {
            return fail(tool, "ERROR", answer.path("message").asString("The server refused the call."), false, EXIT_FAILED);
        }
        String text = answer.path("text").asString("");
        if (answer.path("isError").asBoolean(false)) {
            // The code is a field of the result; the text repeats it in front, for an agent that reads text.
            String code = answer.path("code").isString() ? answer.path("code").asString() : "ERROR";
            String prefix = "Error [" + code + "]: ";
            String message = text.startsWith(prefix) ? text.substring(prefix.length()) : text;
            boolean unknown = UNKNOWN_OUTCOME.contains(code);
            return fail(tool, code, message, unknown, unknown ? EXIT_UNKNOWN : EXIT_FAILED);
        }
        ObjectNode said = JSON.createObjectNode();
        said.put("ok", true);
        said.put("tool", tool);
        said.put("text", text);
        if (answer.hasNonNull("structured")) {
            said.set("result", answer.get("structured"));
        }
        JsonNode image = answer.path("image");
        if (image.isObject()) {
            ObjectNode picture = said.putObject("image");
            picture.put("mimeType", image.path("mimeType").asString(""));
            if (asked.out() != null) {
                byte[] bytes = java.util.Base64.getDecoder().decode(image.path("base64").asString(""));
                Files.write(asked.out(), bytes);
                picture.put("file", asked.out().toAbsolutePath().toString());
                picture.put("bytes", bytes.length);
            } else {
                picture.put("base64", image.path("base64").asString(""));
            }
        }
        out.println(JSON.writeValueAsString(said));
        return EXIT_OK;
    }

    /** Prints an error as the one JSON object of this command: on the output for the agent, and in a line for a person. */
    private int fail(String tool, String code, String message, boolean unknown, int exit) {
        ObjectNode said = JSON.createObjectNode();
        said.put("ok", false);
        if (tool != null) {
            said.put("tool", tool);
        }
        said.putObject("error").put("code", code).put("message", message);
        if (unknown) {
            said.put("outcome", "unknown");
        }
        said.put("text", "Error [" + code + "]: " + message);
        out.println(JSON.writeValueAsString(said));
        out.flush();
        err.println("[tabgoblin] " + code + ": " + message);
        return exit;
    }
}
