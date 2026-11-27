package tabgoblin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.modelcontextprotocol.json.McpJsonDefaults;
import io.modelcontextprotocol.spec.McpSchema;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.io.PrintStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * The tools as commands of a terminal: that a command line is read against the tools' own
 * definitions, that a command is one tool call through the one server, that the commands of one
 * name are one agent and those of another name another, and what a command says when it was
 * refused, when it has no server, and when its outcome is not known.
 */
class CliTest {

    static final String TOKEN = WebSocketBridgeTest.TOKEN;
    static final ObjectMapper JSON = new ObjectMapper();

    private final List<Hub> hubs = new java.util.concurrent.CopyOnWriteArrayList<>();
    private final List<FakeExtension> extensions = new java.util.concurrent.CopyOnWriteArrayList<>();
    private final List<PipedOutputStream> held = new java.util.concurrent.CopyOnWriteArrayList<>();
    private final AtomicInteger starts = new AtomicInteger();
    private int port;
    private Path keys;

    @AfterEach
    void endEverything() throws IOException {
        for (PipedOutputStream one : held) {
            one.close();
        }
        extensions.forEach(FakeExtension::close);
        hubs.forEach(Hub::drop);
    }

    private static int freePorts() throws IOException {
        for (int attempt = 0; attempt < 50; attempt++) {
            int port = 20_000 + (int) (Math.random() * 30_000);
            boolean free = true;
            for (int i = 0; i <= McpMain.PORT_RANGE && free; i++) {
                try (ServerSocket probe = new ServerSocket(port + i, 1, InetAddress.getByAddress(new byte[] {127, 0, 0, 1}))) {
                    probe.setReuseAddress(true);
                } catch (IOException e) {
                    free = false;
                }
            }
            if (free) {
                return port;
            }
        }
        throw new IOException("no free ports found");
    }

    private Hub hub(Path agentKeys) throws IOException {
        port = freePorts();
        keys = agentKeys;
        Hub hub = Hub.open(new Agent.Settings(port, () -> TOKEN, FakeExtension.ORIGIN, () -> BlockedSites.Rule.NONE, agentKeys), true);
        hubs.add(hub);
        Thread serving = new Thread(hub::serve, "test-hub");
        serving.setDaemon(true);
        serving.start();
        return hub;
    }

    private static void await(java.util.function.BooleanSupplier condition, String what) throws InterruptedException {
        for (int i = 0; i < 400 && !condition.getAsBoolean(); i++) {
            Thread.sleep(20);
        }
        assertTrue(condition.getAsBoolean(), "not reached in time: " + what);
    }

    /** One command as a process would run it: its exit code, the one JSON object it printed, and what it said beside it. */
    private record Ran(int exit, JsonNode said, String printed, String log) {
        String code() {
            return said.path("error").path("code").asString("");
        }
    }

    private final class Command {
        final ByteArrayOutputStream out = new ByteArrayOutputStream();
        final ByteArrayOutputStream err = new ByteArrayOutputStream();
        final Cli cli;

        Command(String stdin) {
            cli = new Cli(new PrintStream(out, true, StandardCharsets.UTF_8), new PrintStream(err, true, StandardCharsets.UTF_8),
                    new ByteArrayInputStream(stdin.getBytes(StandardCharsets.UTF_8)), CliTest.this::link);
        }

        Ran run(String... args) {
            int exit = cli.run(args, name -> null);
            String printed = out.toString(StandardCharsets.UTF_8).trim();
            JsonNode said;
            try {
                said = JSON.readTree(printed);
            } catch (RuntimeException e) {
                said = JSON.createObjectNode();
            }
            return new Ran(exit, said, printed, err.toString(StandardCharsets.UTF_8));
        }

        CompletableFuture<Ran> start(String... args) {
            CompletableFuture<Ran> ran = new CompletableFuture<>();
            Thread thread = new Thread(() -> {
                try {
                    ran.complete(run(args));
                } catch (Throwable e) {
                    ran.completeExceptionally(e);
                }
            }, "test-command");
            thread.setDaemon(true);
            thread.start();
            return ran;
        }
    }

    /** The link of a command to the test's server. No server is started for it: a start is only counted. */
    private Link link(InputStream in, java.io.OutputStream out, McpMain.Options options) {
        return new Link(in, out, new PrintStream(new ByteArrayOutputStream()), () -> TOKEN, Link.port(port), false, true,
                () -> {
                    starts.incrementAndGet();
                    throw new IOException("no server is started in this test");
                }, options.agent(), keys).forCommand();
    }

    private Ran run(String... args) {
        return new Command("").run(args);
    }

    /**
     * An agent's first command, and the extension finding the agent while it runs: the agent is
     * made by that command, so there is nothing to pair with before it.
     */
    private FakeExtension firstCommand(Hub hub, String agent) throws Exception {
        int before = hub.agents().size();
        CompletableFuture<Ran> status = new Command("").start("status", "--agent", agent);
        await(() -> hub.agents().size() == before + 1, "the agent of the first command");
        FakeExtension ext = FakeExtension.paired(hub.agents().get(before).bridge().getPort(), TOKEN);
        extensions.add(ext);
        Ran ran = status.get(15, TimeUnit.SECONDS);
        assertEquals(Cli.EXIT_OK, ran.exit(), ran.printed());
        assertTrue(ran.said().path("ok").asBoolean(), ran.printed());
        assertTrue(ran.said().path("text").asString().contains("identity \"" + agent + "\": the same agent at every start"), ran.printed());
        // What the status asked the extension is not what a test counts.
        ext.commands.clear();
        return ext;
    }

    private Cli.Invocation parse(String... args) throws McpMain.UsageException {
        return new Cli(System.out, System.err, new ByteArrayInputStream("{\"ref\":3,\"text\":\"from stdin\"}".getBytes(StandardCharsets.UTF_8)),
                (in, out, options) -> null).parse(args);
    }

    // ---- The command line

    @Test
    void theCommandsAreTheServersToolsAndTheirArgumentsTheToolsOwn() {
        List<McpSchema.Tool> tools = McpMain.toolSpecs(null, McpJsonDefaults.getMapper()).stream().map(spec -> spec.tool()).toList();
        JsonNode catalogue = Cli.catalogue();
        assertEquals(14, catalogue.path("tools").size());
        Set<String> options = new TreeSet<>();
        for (int i = 0; i < tools.size(); i++) {
            McpSchema.Tool tool = tools.get(i);
            JsonNode listed = catalogue.path("tools").get(i);
            assertEquals(tool.name(), listed.path("tool").asString());
            assertEquals(tool.description(), listed.path("description").asString());
            assertEquals(JSON.valueToTree(tool.inputSchema()), listed.path("inputSchema"), tool.name() + ": the schema is the tool's, not a second one");
            // A command is found by its own name, with dashes or underscores, and by the tool's.
            String command = listed.path("command").asString();
            assertEquals("browser_" + command.replace('-', '_'), tool.name());
            for (String name : List.of(command, command.replace('-', '_'), tool.name())) {
                assertEquals(tool.name(), Cli.toolOf(name).name(), name);
            }
            // The MCP tool and the command are the one definition: the same by name on both sides.
            String help = Cli.help(ToolDefs.named(tool.name()));
            for (String property : ((Map<?, ?>) tool.inputSchema().get("properties")).keySet().toArray(String[]::new)) {
                options.add("--" + property.replace('_', '-'));
                assertTrue(help.contains("--" + property.replace('_', '-') + " <"), tool.name() + " " + property);
            }
        }
        // No argument of a tool is taken for an option of the server or of the command line.
        for (String own : List.of("--agent", "--port", "--token-file", "--extension-origin", "--settings", "--panel", "--no-panel",
                "--json", "--help", "--out", "--args", "--args-file")) {
            assertFalse(options.contains(own), own);
        }
        assertNull(Cli.toolOf("evaluate"));
        assertTrue(Cli.list().contains("press-key"), Cli.list());
        assertTrue(catalogue.path("exitCodes").has("4") && catalogue.path("instructions").asString().contains("untrusted"));
    }

    @Test
    void anArgumentIsReadAsTheTypeTheToolGivesIt() throws Exception {
        Cli.Invocation click = parse("click", "--agent", "ide", "--session", "s2", "--ref", "12", "--intent=submit");
        assertEquals("browser_click", click.tool());
        assertEquals(JSON.readTree("{\"session\":\"s2\",\"ref\":12,\"intent\":\"submit\"}"), click.arguments());
        assertEquals(List.of("--agent", "ide"), click.serverArgs(), "the server's own options go to the server's own reading");

        // A boolean is a switch; a dash stands for an underscore; a text is taken as it is, whatever it begins with.
        Cli.Invocation snapshot = parse("browser_snapshot", "--interactive-only", "--diff", "false", "--max_lines", "40");
        assertEquals(JSON.readTree("{\"interactive_only\":true,\"diff\":false,\"max_lines\":40}"), snapshot.arguments());
        Cli.Invocation fill = parse("fill", "--ref", "3", "--text", "--not an option", "--append");
        assertEquals(JSON.readTree("{\"ref\":3,\"text\":\"--not an option\",\"append\":true}"), fill.arguments());
        assertEquals("12", parse("fill", "--ref", "3", "--text", "12").arguments().path("text").asString(), "a text of digits stays a text");

        // What is an array or an object for the tool is given as JSON.
        Cli.Invocation submit = parse("submit", "--ref", "7", "--fields", "[{\"ref\":5,\"text\":\"a \\\"b\\\"\\nc\"}]", "--expect-text", "sent");
        assertEquals("a \"b\"\nc", submit.arguments().path("fields").path(0).path("text").asString());
        assertEquals(JSON.readTree("[1,2]"), parse("extract", "--refs", "[1,2]").arguments().path("refs"));
    }

    @Test
    void allArgumentsCanBeGivenAsOneObject(@TempDir Path dir) throws Exception {
        Cli.Invocation whole = parse("fill", "--args", "{\"ref\":3,\"text\":\"one\"}", "--text", "two");
        assertEquals(JSON.readTree("{\"ref\":3,\"text\":\"two\"}"), whole.arguments(), "a single argument comes on top");
        assertEquals("from stdin", parse("fill", "--args", "-").arguments().path("text").asString());
        Path file = dir.resolve("args.json");
        Files.writeString(file, "{\"ref\":9,\"fields\":[{\"ref\":1,\"text\":\"x\"}]}");
        assertEquals(1, parse("submit", "--args-file", file.toString()).arguments().path("fields").size());

        for (String[] wrong : List.of(
                new String[] {"fill", "--args", "[1]"},
                new String[] {"fill", "--args", "{\"ref\":\"3\",\"text\":\"x\"}"},
                new String[] {"fill", "--args", "{\"ref\":3,\"text\":\"x\",\"script\":\"alert(1)\"}"},
                new String[] {"fill", "--args-file", dir.resolve("none.json").toString()})) {
            assertThrows(McpMain.UsageException.class, () -> parse(wrong), String.join(" ", wrong));
        }
    }

    @Test
    void aCommandLineThatIsNotUnderstoodSendsNothingAndSaysWhy() throws Exception {
        for (String[] wrong : List.of(
                new String[] {"evaluate", "--agent", "ide"},
                new String[] {"click", "--agent", "ide"},
                new String[] {"click", "--agent", "ide", "--ref", "twelve"},
                new String[] {"click", "--agent", "ide", "--ref", "1", "--script", "x"},
                new String[] {"click", "--agent", "ide", "--ref", "1", "--intent", "force"},
                new String[] {"click", "--agent", "ide", "--ref"},
                new String[] {"click", "--agent", "ide", "--ref", "1", "stray"},
                new String[] {"extract", "--agent", "ide", "--refs", "1,2"},
                new String[] {"snapshot", "--agent", "ide", "--out", "x.jpg"},
                new String[] {"status", "--agent", "not a name"},
                new String[] {"status"})) {
            Ran ran = run(wrong);
            assertEquals(Cli.EXIT_USAGE, ran.exit(), String.join(" ", wrong));
            assertFalse(ran.said().path("ok").asBoolean(true));
            assertEquals("USAGE", ran.code(), ran.printed());
            assertTrue(ran.log().contains("USAGE"), "and a line for a person, beside the answer");
        }
        assertEquals(0, starts.get(), "nothing was looked for, and nothing started");
        assertTrue(run("status").said().path("error").path("message").asString().contains("--agent <name>"));

        // The list of commands and a command's help need no agent and no server.
        Ran tools = run("tools", "--json");
        assertEquals(Cli.EXIT_OK, tools.exit());
        assertEquals(Cli.catalogue(), tools.said());
        assertTrue(run("tools").printed().contains("request-access"));
        Ran help = run("press-key", "--help");
        assertEquals(Cli.EXIT_OK, help.exit());
        assertTrue(help.printed().startsWith("tabgoblin press-key --agent <name> --key <string>"), help.printed());
        assertTrue(Cli.handles(new String[] {"status"}) && !Cli.handles(new String[] {"--panel"}) && !Cli.handles(new String[0]));
    }

    // ---- Through the server

    @Test
    void theCommandsOfOneNameAreOneAgentFromOneProcessToTheNext(@TempDir Path dir) throws Exception {
        Hub hub = hub(dir);
        FakeExtension ext = firstCommand(hub, "ide");
        String id = hub.agents().get(0).bridge().clientId();
        assertEquals(AgentKeys.idOf(AgentKeys.read(dir, "ide")), id, "the agent of its key");
        assertEquals("ide (command line)", hub.agents().get(0).bridge().clientName());

        // The command's process is gone; the agent, its port and its pairing are not.
        ext.send("""
                {"type":"event","event":"sessions","data":{"sessions":[{"session":"s1","origin":"https://a.example","mode":"write","state":"active"}]}}""");
        await(() -> hub.agents().get(0).bridge().sessions().size() == 1, "the session the user gave");
        ext.responder = cmd -> cmd.path("action").asString().equals("click")
                ? FakeExtension.ok(cmd, JSON.createObjectNode().put("dispatched", true))
                : FakeExtension.ok(cmd, JSON.createObjectNode().put("text", "the page of " + cmd.path("session").asString()));
        Ran snapshot = run("snapshot", "--agent", "ide", "--session", "s1", "--max-lines", "40");
        assertEquals(Cli.EXIT_OK, snapshot.exit(), snapshot.printed());
        assertEquals("browser_snapshot", snapshot.said().path("tool").asString());
        assertTrue(snapshot.said().path("text").asString().contains("the page of s1"), snapshot.printed());
        assertFalse(snapshot.said().has("result"));
        assertEquals(1, snapshot.printed().lines().count(), "one JSON object, on one line");
        assertEquals("snapshot", ext.commands.get(0).path("action").asString());
        assertTrue(ext.commands.get(0).path("params").toString().contains("40"), ext.commands.get(0).toString());

        // A tool that returns an object gives it as one.
        Ran click = run("click", "--agent", "ide", "--ref", "4");
        assertEquals(Cli.EXIT_OK, click.exit(), click.printed());
        assertTrue(click.said().path("result").path("dispatched").asBoolean(), click.printed());

        // A refusal is the tool's own, with its code; nothing is made of it here.
        ext.responder = cmd -> FakeExtension.fail(cmd, "WRITE_NOT_AUTHORIZED", "This session may not write.");
        Ran refused = run("fill", "--agent", "ide", "--ref", "4", "--text", "x");
        assertEquals(Cli.EXIT_FAILED, refused.exit());
        assertEquals("WRITE_NOT_AUTHORIZED", refused.code());
        assertFalse(refused.said().has("outcome"));
        assertTrue(refused.said().path("text").asString().startsWith("Error [WRITE_NOT_AUTHORIZED]: "), refused.printed());

        assertEquals(1, hub.agents().size(), "one agent through all of it");
        assertEquals(id, hub.agents().get(0).bridge().clientId());
        assertTrue(ext.isOpen(), "and one pairing");
        assertEquals(0, starts.get());
    }

    @Test
    void aScreenshotIsAnImageInTheAnswerOrAFile(@TempDir Path dir) throws Exception {
        Hub hub = hub(dir);
        FakeExtension ext = firstCommand(hub, "ide");
        ext.responder = cmd -> FakeExtension.ok(cmd, JSON.createObjectNode().put("data", "QUJD").put("mimeType", "image/jpeg"));
        Ran inline = run("screenshot", "--agent", "ide");
        assertEquals(Cli.EXIT_OK, inline.exit(), inline.printed());
        assertEquals("image/jpeg", inline.said().path("image").path("mimeType").asString());
        assertEquals("QUJD", inline.said().path("image").path("base64").asString());

        Path file = dir.resolve("shot.jpg");
        Ran written = run("screenshot", "--agent", "ide", "--out", file.toString());
        assertEquals("ABC", Files.readString(file));
        assertEquals(file.toAbsolutePath().toString(), written.said().path("image").path("file").asString());
        assertEquals(3, written.said().path("image").path("bytes").asInt());
        assertFalse(written.said().path("image").has("base64"));
    }

    @Test
    void commandsAtOnceAreTheirAgentAndAnotherNameIsAnotherAgent(@TempDir Path dir) throws Exception {
        Hub hub = hub(dir);
        FakeExtension ext = firstCommand(hub, "ide");
        FakeExtension other = firstCommand(hub, "second");
        Agent ide = hub.agents().get(0);
        Agent second = hub.agents().get(1);
        assertNotEquals(ide.bridge().clientId(), second.bridge().clientId());
        assertNotEquals(ide.bridge().getPort(), second.bridge().getPort(), "each has a connection of its own to the extension");

        ext.send("""
                {"type":"event","event":"sessions","data":{"sessions":[{"session":"s1","origin":"https://a.example","mode":"read","state":"active"}]}}""");
        await(() -> ide.bridge().sessions().size() == 1, "the first agent's session");
        ext.responder = cmd -> FakeExtension.ok(cmd, JSON.createObjectNode().put("text", "the first agent's page"));
        other.responder = cmd -> FakeExtension.fail(cmd, "NOT_AUTHORIZED", "No tab is authorized for this agent.");

        // Several commands of one agent at the same time: each has its answer, and they are one agent.
        List<CompletableFuture<Ran>> together = new java.util.ArrayList<>();
        for (int i = 0; i < 4; i++) {
            together.add(new Command("").start("snapshot", "--agent", "ide", "--start-line", String.valueOf(i)));
        }
        CompletableFuture<Ran> ofTheOther = new Command("").start("snapshot", "--agent", "second", "--session", "s1");
        for (CompletableFuture<Ran> one : together) {
            Ran ran = one.get(15, TimeUnit.SECONDS);
            assertEquals(Cli.EXIT_OK, ran.exit(), ran.printed());
            assertTrue(ran.said().path("text").asString().contains("the first agent's page"));
        }
        // The other agent's command went to the other agent's connection, with the first one's session id or without.
        Ran refused = ofTheOther.get(15, TimeUnit.SECONDS);
        assertEquals(Cli.EXIT_FAILED, refused.exit(), refused.printed());
        assertFalse(refused.printed().contains("the first agent's page"));
        assertEquals(4, ext.commands.size());
        assertEquals(2, hub.agents().size());
        assertTrue(second.bridge().sessions().isEmpty(), "an agent is told nothing of another's tabs");
    }

    @Test
    void aCommandDoesNotBecomeASecondAgentBesideOneThatIsConnectedWithItsKey(@TempDir Path dir) throws Exception {
        Hub hub = hub(dir);
        // An MCP client's process with the key: it stays connected.
        PipedOutputStream open = new PipedOutputStream();
        held.add(open);
        Link staying = new Link(new PipedInputStream(open), new ByteArrayOutputStream(), new PrintStream(new ByteArrayOutputStream()),
                () -> TOKEN, Link.port(port), false, true, () -> { }, "ide", dir);
        assertTrue(staying.connect());
        await(() -> hub.agents().size() == 1, "the agent that stays connected");

        Ran ran = run("status", "--agent", "ide");
        assertEquals(Cli.EXIT_NO_SERVER, ran.exit(), ran.printed());
        assertEquals("AGENT_IN_USE", ran.code());
        assertTrue(ran.said().path("error").path("message").asString().contains("Nothing was sent"), ran.printed());
        assertEquals(1, hub.agents().size(), "no second agent, and none with an id of its own");
    }

    @Test
    void anAgentTheUserRevokedHasNoCommandAndAllowedAgainItIsANewAgent(@TempDir Path dir) throws Exception {
        Hub hub = hub(dir);
        FakeExtension ext = firstCommand(hub, "ide");
        String id = hub.agents().get(0).bridge().clientId();
        ext.responder = cmd -> FakeExtension.ok(cmd, JSON.createObjectNode().put("text", "a page"));

        AgentKeys.revoke(dir, "ide");
        for (String command : List.of("status", "snapshot")) {
            Ran ran = run(command, "--agent", "ide");
            assertEquals(Cli.EXIT_FAILED, ran.exit(), ran.printed());
            assertEquals("AGENT_REVOKED", ran.code(), ran.printed());
        }
        assertTrue(ext.commands.isEmpty(), "nothing went to the browser");
        assertEquals("", AgentKeys.read(dir, "ide"), "and no key was made for the name");

        assertTrue(AgentKeys.allow(dir, "ide"));
        CompletableFuture<Ran> again = new Command("").start("status", "--agent", "ide");
        await(() -> !AgentKeys.read(dir, "ide").isEmpty()
                && hub.agents().stream().anyMatch(agent -> agent.bridge().clientId().equals(AgentKeys.idOf(AgentKeys.read(dir, "ide")))),
                "the agent of the new key");
        assertNotEquals(id, AgentKeys.idOf(AgentKeys.read(dir, "ide")), "a new agent: what the old one had does not come to it");
        String newId = AgentKeys.idOf(AgentKeys.read(dir, "ide"));
        Agent fresh = hub.agents().stream().filter(agent -> agent.bridge().clientId().equals(newId)).findFirst().orElseThrow();
        extensions.add(FakeExtension.paired(fresh.bridge().getPort(), TOKEN));
        assertEquals(Cli.EXIT_OK, again.get(15, TimeUnit.SECONDS).exit());
        assertTrue(fresh.bridge().sessions().isEmpty());
    }

    @Test
    void anAgentThatHasNoCommandForAWhileIsLetGoAndIsItselfAgainAtItsNext(@TempDir Path dir) throws Exception {
        Hub hub = hub(dir);
        hub.commandIdle(300);
        FakeExtension ext = firstCommand(hub, "ide");
        String id = hub.agents().get(0).bridge().clientId();
        await(() -> hub.agents().isEmpty(), "the agent to be let go");
        await(() -> !ext.isOpen(), "its connection to the extension to be closed");
        firstCommand(hub, "ide");
        assertEquals(id, hub.agents().get(0).bridge().clientId());
    }

    // ---- When there is no answer

    @Test
    void whereNoServerIsToBeHadNothingIsSentAndNoneStandsInForIt(@TempDir Path dir) throws Exception {
        port = freePorts();
        keys = dir;
        Ran ran = run("click", "--agent", "ide", "--ref", "1");
        assertEquals(Cli.EXIT_NO_SERVER, ran.exit(), ran.printed());
        assertEquals("NO_SERVER", ran.code());
        assertFalse(ran.said().has("outcome"), "nothing was sent: there is nothing unknown about it");
        assertEquals(1, starts.get(), "the one server was asked for, once");
    }

    @Test
    void aCommandWhoseServerGoesAwaySaysThatItsOutcomeIsUnknownAndIsNotSentAgain(@TempDir Path dir) throws Exception {
        Hub hub = hub(dir);
        FakeExtension ext = firstCommand(hub, "ide");
        ext.responder = cmd -> null;
        CompletableFuture<Ran> click = new Command("").start("click", "--agent", "ide", "--ref", "1");
        await(() -> ext.commands.size() == 1, "the command to be in the browser");
        hub.drop();
        Ran ran = click.get(15, TimeUnit.SECONDS);
        assertEquals(Cli.EXIT_UNKNOWN, ran.exit(), ran.printed());
        assertEquals("CONNECTION_LOST", ran.code());
        assertEquals("unknown", ran.said().path("outcome").asString());
        assertTrue(ran.said().path("error").path("message").asString().contains("not retried"), ran.printed());
        assertEquals(1, ext.commands.size(), "sent once");
        assertEquals(0, starts.get(), "and no server is started anew for a command that is over");
    }

    @Test
    void aCommandWithoutAnAnswerInTimeIsCancelledAndItsOutcomeIsUnknown(@TempDir Path dir) throws Exception {
        Hub hub = hub(dir);
        FakeExtension ext = firstCommand(hub, "ide");
        ext.responder = cmd -> null;
        Command command = new Command("");
        command.cli.answerWithin(400);
        Ran ran = command.run("click", "--agent", "ide", "--ref", "1");
        assertEquals(Cli.EXIT_UNKNOWN, ran.exit(), ran.printed());
        assertEquals("TIMEOUT", ran.code());
        assertEquals("unknown", ran.said().path("outcome").asString());
        await(() -> !ext.cancels.isEmpty(), "the command to be cancelled in the browser");
        assertEquals(1, ext.commands.size());

        // The browser's own "no answer" is the same to the one who ran the command.
        ext.responder = cmd -> FakeExtension.fail(cmd, "PAGE_TIMEOUT", "The page did not answer.");
        Ran late = run("click", "--agent", "ide", "--ref", "1");
        assertEquals(Cli.EXIT_UNKNOWN, late.exit(), late.printed());
        assertEquals("unknown", late.said().path("outcome").asString());
    }

    @Test
    void aCommandWhoseProcessIsEndedIsCancelledInTheBrowserAndSaysSoOnce(@TempDir Path dir) throws Exception {
        Hub hub = hub(dir);
        FakeExtension ext = firstCommand(hub, "ide");
        ext.responder = cmd -> null;
        Command command = new Command("");
        CompletableFuture<Ran> click = command.start("click", "--agent", "ide", "--ref", "1");
        await(() -> ext.commands.size() == 1, "the command to be in the browser");
        // What the process does when it is ended while its command runs.
        command.cli.cancelled();
        await(() -> !ext.cancels.isEmpty(), "the command to be cancelled in the browser");
        assertEquals(Cli.EXIT_UNKNOWN, click.get(15, TimeUnit.SECONDS).exit());
        // The answer is the cancelling's, printed before the process is let go; the command's own way out adds none.
        String printed = command.out.toString(StandardCharsets.UTF_8).trim();
        assertEquals(1, printed.lines().count(), printed);
        JsonNode said = JSON.readTree(printed);
        assertEquals("CANCELLED", said.path("error").path("code").asString(), printed);
        assertEquals("unknown", said.path("outcome").asString());
        // Ended when nothing runs, it says nothing.
        Command idle = new Command("");
        idle.cli.cancelled();
        assertEquals("", idle.out.toString(StandardCharsets.UTF_8));
        assertEquals(1, hub.agents().size(), "the agent stays for its next command");
    }

    @Test
    void whereTheSettingsHaveTheCommandLineOffNothingIsSentAndTheCommandSaysWhy(@TempDir Path dir) throws Exception {
        Hub hub = hub(dir);
        firstCommand(hub, "ide");
        Path settings = dir.resolve("settings.properties");
        Files.writeString(settings, "interfaces = mcp\n", StandardCharsets.UTF_8);
        Ran ran = run("status", "--agent", "ide", "--settings", settings.toString());
        assertEquals(Cli.EXIT_NO_SERVER, ran.exit(), ran.printed());
        assertEquals("INTERFACE_NOT_ALLOWED", ran.code());
        assertTrue(ran.said().path("error").path("message").asString().contains("nothing was sent"), ran.printed());
        assertFalse(ran.said().has("outcome"));
        assertEquals(1, hub.agents().size(), "the agent that was there is left as it was");
        // With MCP off a command is as it always was.
        Files.writeString(settings, "interfaces = cli\n", StandardCharsets.UTF_8);
        assertEquals(Cli.EXIT_OK, run("status", "--agent", "ide", "--settings", settings.toString()).exit());
    }
}
