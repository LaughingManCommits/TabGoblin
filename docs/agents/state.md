# Current state and handoff

Last updated: 2026-11-28. Claims here go stale; check the date, then `git status` and `git log`.

## Connecting an agent through MCP, said more simply: 2026-11-28

On branch `simpler-agent-setup-docs`, made from `main` at `354952c`, on the owner's word
("update the docs to make it simple for developers"). Not committed. In
[installation.md](../installation.md#through-mcp) the part for a build from source now has the
one command every agent is told, setup as the short way, a row for each agent with its own
line (Claude Code, Codex, Copilot's command line and VS Code, IntelliJ IDEA), the JSON, and
four things to get right: an absolute path, a Java 25, no `--port`, a name for each agent. The
lines are the ones `Setup.java` `registration` prints. Taken out as no longer so: "up to eight
at once" in the installation guide, the developer guide and the architecture's vocabulary
(WP-33 dropped the limit; no code has it). **Next:** the owner reviews and commits.

Seen the same day with the live server from `main`'s build (port 47821, agent `claude-code`,
one tab at Explore): eleven tools answered, a fill and a navigation to another site were
refused. See the validation log.

## WP-33, one port: built, 2026-11-28

On branch `one-port`, made from `main` at `0d54694` (the merge of pull request 15) on the owner's
word ("go, one port, drop the servers folder, new branch after merge"). Built in one session, not
yet merged: the server listens on one port (`ExtensionServer`, new; `Ports` cut to the list of
three), the extension opens one connection and every agent travels inside it with its id on each
message (`agents`, `agent`, `agents_refused`), the agents' processes reach the server over the
same port on the path `/link` as WebSocket frames (`Link` version 3), protocol version 1 on the
owner's word ("we should still be version 1 of our protocol"; a 0.2.0 part, which said 3, is
refused and told to update). Gone: `RunningServers` and the `servers` folder, the per-agent
ports and bridges, the port scan, the limit of eight agents, `setup_port`, `settings` and
`origin` in the link's `attach`, `cameFrom`, the port chips of the window and the popup. The
pages follow: architecture (processes and ports, the pairing diagram), the protocol reference,
the tool reference's status, the security model's connection and identity rows, installation,
developer guide, assessment, the CLI page, the three CLI skills (the paragraph on another
server's port is out).

Seen: the server's `mvn verify` (240 tests, 20 skipped `PanelTest`; `McpConformanceIT` 8 of 8),
the extension's `npm run check` (217 tests), the end-to-end suite here (110 passed, 0 failed;
the window's section is Windows-only and did not run). Not seen: the window on a real screen,
and the acceptance by hand on Windows that WP-33 in [TODO.md](../../TODO.md) lists.

A second commit on the branch, the same day, on the owner's word ("review and strengthen
TabGoblin's documentation maintenance rules"): the rules that documentation is part of a change
are in [development.md](../development.md#documentation-is-part-of-a-change) (the owner), with
the impact review's table, the contract for diagrams and pictures, the four grades of a security
claim, the checks and the review summary that ends a task, with a picture of the flow at its
head (`documentation.svg`, the sixth of the script's); `AGENTS.md` and `CONTRIBUTING.md`
point there. Two checks are new: `check-drift.mjs` (retired names; the protocol version, the
link version and the ports the same in both parts and in the pages; in CI, in the job now
called *Documentation*, with the link check) and `check-diagrams.mjs` (every Mermaid block
parses; in CI too, with a Mermaid installed outside the tree, since its dependencies carry
advisories, and the SVG files held to their script there). The drift check also holds every
code file and `TABGOBLIN_*` variable a page names to the tree.

Then, on the owner's word ("no port needed as input on the extension"): the popup's pairing
form takes the token alone. The extension looks at the three ports a server may be on and at no
other; a port in its storage (`port`), which no popup writes, is for the end-to-end suite, whose
servers are on ports of their own, and the worker takes it up at once (`chrome.storage.onChanged`).
The server's words follow: a held port is not stepped over ("Close that program"), a kept-back
one has the list as the way out, and a server started with `--port` on another port is told in
its pairing help that the extension does not look there (`Ports.offList`); the window's port
chip says the extension finds the port by itself. The pages say the same (architecture,
developer guide, installation, tool reference, assessment). `--port` stays, for a second server
beside the one. The alignment review of the branch found and mended: the components picture ("one
port per agent", "protocol 3"), the window's picture (footer "protocol 3"), the popup's pictures
(port chips, *First port*), `status.txt`, a Mermaid line that a semicolon cut short, stale
comments in five tests and `McpMain`, the worker's header comment, two backlog notes, the Windows
token script's comment. The window's 20 tests ran under a virtual display: 19 passed, and the
icon test wants the extension's icons beside the copy it ran in. **Next:** the owner reviews and
merges; then the acceptance by hand on Windows.

## CI's end-to-end run on Windows: two steps mended, 2026-11-28

On branch `one-server-found-and-plain-answers`, after `3cfff0b`, on the owner's word ("the CI
fails on the end2end tests"). CI run 61 (pull request 15) failed in two steps of the suite on
Windows and in *Dependencies*:

- **"Kill in the window …":** the suite's second server has a token file of its own beside the
  first's (`window-token`), and the `servers` folder is beside the token, so both tokens shared
  it. The new agent saw the first server (browser, same settings), was refused there for its
  token, and served its agent alone, so nothing listened on its link port. Each file now names
  its token file, and a process reads only its own token's files (`RunningServers.ownToken`);
  a test has two tokens in one folder. Seen with real processes: the second token's agent got
  its own server while the first's had the browser.
- **"a command under the name of a connected MCP agent …":** timed out waiting for the extension
  to find the new agent. Concluded from the code, not seen: the step opened the popup while the
  command's process was still starting, so the popup's look came before the new agent's port
  existed, and the extension found it only at its 30-second alarm; a Windows runner starts a
  Java process more slowly than this container, and the branch's start reads the folder and
  probes a server once more. The step opens the popup again once the command is through.
- **Also found:** the architecture page still described process ids in the files, since an edit
  of the session before had not been written; mended.
- **Not ours:** *Dependencies* fails on every pull request with "Dependency review is not
  supported on this repository. Please ensure that Dependency graph is enabled" (runs 57, 59,
  61); a push to `main` does not run that step. The owner enables the dependency graph in the
  repository's security settings, or the step goes.

**Not run:** the window's section of the suite, which runs on Windows only: CI's next run on
the pull request is the check. **Next:** read that run.

## The branch reviewed: six faults mended, 2026-11-27

On branch `one-server-found-and-plain-answers`, after `c350f29`, on the owner's word ("review the
current branch ... fix whatever you find"). Two found by the session (`f0642a5`) and four more
by an independent review of the whole diff, all mended:

- **The settings were compared on the wrong side.** The server compared another server's
  settings with its own, where what decides whether an agent's next process goes there is the
  process's own `--settings` and `--extension-origin`, which the server did not know. The link
  now sends them in its `attach` (`settings`, `origin`), and the server compares against those
  (`Hub.fitOf`, `unpaired(quiet, mine)`).
- **A gate hid the hint when the browser had moved.** "Said only if no browser ever came here"
  is gone: another server's `browser:true` is written again within a quarter second when the
  browser goes, so it is fresh whatever happened here; only a browser that came here with
  another token still takes precedence.
- **Process ids are gone from the files.** A process id means nothing across the Linux
  subsystem of Windows or a sandbox, and a wrong "dead" would have deleted a live server's
  file. Whether a server is there is told by whether its port answers; a refused connection on
  the loopback is instant, so nothing is lost.
- **A failed rewrite is written again** at the watcher's next look (`write` says whether it
  succeeded; on Windows the file cannot be replaced while another process reads it), and no
  `.tmp` is left.
- **No write after a stop** (`Hub.close` and the watcher share a lock), and **the own-port
  check** no longer trusts a file whose server does not answer.
- **The message names no port any more**: that would tell an agent about another agent's
  setup, and the process finds the server by itself. It says "once more", and the skills say
  not to run a third time. The status line of an agent served away from its setup's port says
  the browser *was* here when it came.

Left as judgement, said in the architecture page: a look costs one connection per listed
server; `--panel --port X` by hand shows the window of the server with the browser where that
one runs as X would. **Not tried:** a real browser (a fake extension was paired with real
servers), and any agent with the skills. **Next:** the owner's look; the jar built in the tree
once no agent runs from it; a task in a fresh Codex session with the skill installed anew.

## A named port joins the server with the browser where that one runs under the same settings, 2026-11-27

On branch `one-server-found-and-plain-answers`, after `7a79ba7`, on the owner's word ("build the
safer variant"), which settles the question the entry below left open. Each server's file also
says which settings file it reads and which extension it lets in. A process whose setup names
`--port` goes first to a server that has the browser and runs under the same two
(`RunningServers.Fit`), and otherwise to its own port alone, where it starts its server as
before. The process tells the server its setup's port, and an agent served elsewhere than there
is told why in its status (`cameFrom`). The message to an agent without a browser says whether
the other server runs under the same settings: if so, its next process goes there by itself; if
not, it is to tell the user. The skills no longer have a command give the other server's port.
A process without a port still joins any server that runs, whatever its settings, as before.
**Not tried:** a real browser (a fake extension was paired with real servers), and an agent
with the skills.

## Each server's own file says whether it has the browser, 2026-11-27

On branch `one-server-found-and-plain-answers`, after `2a20b3b`, committed as `7a79ba7`. The
question it leaves open is settled above. On the owner's word, with "only
if it adds value": the file `servers` is now a folder of that name with one file for each
server that runs (`<first>.json`: first port, process id, and whether the browser is connected
to it), which only that server writes. A process without `--port` goes to the server that has
the browser first; the message to an agent without a browser names only a server that says it
has it, and so says "is connected", where it said "likely". A file whose process is gone is
passed over without a connection, and taken out by the next server that opens. Left out as
redundant: the version and the start time, which nothing would read. Owned by
[architecture.md](../architecture.md#processes-and-ports). **Not decided, the owner's:**
whether a process that names `--port` should go to the server with the browser when its own has
none; it does not, and is told the port instead. **Not tried:** the flag with a real browser
(the hub's test pairs a fake extension over a real connection).

## An agent without a browser is told of another server; the skills share the rules for few calls, 2026-11-27

On branch `one-server-found-and-plain-answers`, after `69bdb81`, committed as `2a20b3b`. The
file `servers` it names is a folder since (above). On the owner's
word ("help the codex actually use tabgoblin and then apply those improvements to other agent
skills"):

- **A server that no browser came to names another server's port.** When a tool finds no
  browser, the server reads `servers` for another server that answers and says its first port
  in place of the pairing help (`Hub.unpaired`, `BrowserService.otherServer`; in a process that
  serves its agent alone too). A command of the command line is told to give that `--port`, an
  MCP agent to have the user change its setup. Nothing is said once a browser has come to this
  server. Owned by [architecture.md](../architecture.md#processes-and-ports); the text is in the
  tool reference.
- **The six skills share the rules for few calls,** where only the two for Codex had them: a
  section "Use few commands" or "Use few calls" with the table of shortest ways and the smoke
  test, from "Start with the status" on. The common part says to leave `--port` out unless the
  setup names one, to read what an action answers instead of a new snapshot ("Act" said
  otherwise before), and what to do when the status names another server. The Codex heads keep
  only what is Codex's.

**Not tried:** any agent with the new skills; the message with two real servers and a real
browser. **Next:** the owner's look and commit; then a task in a fresh Codex session with the
skill installed anew (the old copy removed first).

## A server on another port is found; `--plain`; the instructions ask for few calls, 2026-11-27

On branch `one-server-found-and-plain-answers`, made from `main` at `9c751a9`, not committed;
it carries the skill edits of the entries below as well. Three changes, after the owner found
Codex slow and without a browser:

- **A process that names no port finds a server on a port of another agent's setup.** A server
  writes its first port into `servers`, beside the pairing token, and takes it out when it
  ends in order (`RunningServers.java`, called from `McpMain.serveAll`); a link or a command
  without `--port` looks there before the list (`McpMain.main`, `commandLink`). A port from
  the file is used only where something opens with the server's greeting, and the proofs
  follow as before. A process that names a port still looks at that port alone. Owned by
  [architecture.md](../architecture.md#processes-and-ports).
- **`--plain` on the command line** prints the answer's text as it is, and an error as the one
  line `Error [CODE]: message`; `screenshot` needs `--out` with it. In `Cli.java`, the guide
  ([cli.md](../cli.md#the-answer-as-text)) and the three skills for the command line.
- **The server's instructions** (`McpMain.java`) say to read with an extract, to read what an
  action returns, and to take a new snapshot only for refs.

**Not done:** the command line's start was to be made quicker, and cannot be from here: on the
owner's machine `java -version` alone takes 1.15 s, and a command 1.28 s. **Not run:** the
end-to-end suite and `mvn verify`; the extension was not changed. **Not covered:** two agents
set up with two different ports still have two servers; a status does not say that another
server has the browser. **Next:** the owner's look; end to end before a merge; then the jar
built in the tree once no agent runs from it, and a task in a fresh Codex session.

## Both Codex skills cut to few calls, 2026-11-27

Working tree on `main` at `9c751a9`, not committed. This replaces the Codex sections that the
four entries below describe: what they say of diagram captures, timing recipes and repository
examples is no longer in the skills. The owner found Codex slow with TabGoblin. Seen in the
running processes, not in Codex itself: a hook of another program (`gk.exe ai hook run --host
codex --blocking`) ran for more than a minute before Codex's shell calls, and Codex's commands,
which gave no `--port`, started a second server on 47821 while the browser was connected to the
one on 39821 that another agent's registration had asked for. Neither is the skill's. In the
skills, the Codex section of each now says: read with an extract, take a snapshot only for
refs, read what a click or a navigation answers and take no snapshot to confirm it, and for
the command line put commands that need no answer of each other into one shell call and write
no script that searches a snapshot. The command-line skill has the description of the other
two again. `SkillsTest` passed, 9 of 9. **Not tried:** either skill in Codex; whether Codex is
quicker with them. An installed skill is not overwritten by `--install-skill`: the copy Codex
has must be removed first. **Next:** the owner turns the hook off, puts every agent on one
port, installs the skill anew and tries a task in a fresh Codex session.

## Codex CLI workflow rewrite, 2026-11-27

Working tree on `main` at `9c751a9`. The Codex CLI section starts with session and shell
handling, then maps tasks to commands for reading, browsing, waiting, requesting access and
writing. It preserves the diagram and timing recipes and starts smoke tests on the live
tab when requested. The GitHub run exercised eleven CLI commands and restored the starting
URL. All fourteen also worked against the local demo in a disposable Chrome profile,
including the access grant and verified submission. The skill has not been loaded in a
fresh Codex session.

## Codex CLI diagram captures, 2026-11-27

Working tree on `main` at `9c751a9`. The Codex CLI skill explains how to find a diagram,
verify its position, save and inspect overlapping viewport captures, and handle a capture
blocked by a frame from another origin. The live GitHub run captured the Components diagram
in two images and the README overview in one. Each image was inspected. The command-flow
capture was blocked. The revised wording has not been tried in a fresh Codex session.

## Codex CLI smoke test and timing, 2026-11-27

Working tree on `main` at `9c751a9`. The Codex CLI skill now groups a known smoke test in
one shell launch, verifies each move before the next, and records CLI elapsed time and
TabGoblin diagnostics separately. It also says to wait for a pending shell approval before
starting another. The live rerun on the configured port passed navigation and restored the
GitHub tab. The isolated package build passed. The long delay before shell launch is outside
the skill's control.

## Codex MCP skill examples, 2026-11-27

Working tree on `main` at `9c751a9`, not committed. On the owner's request, the Codex MCP
skill has a quick start, a tool chooser, examples for reading, repository browsing and build
logs, a browsing smoke-test checklist, and guidance on timing diagnostics. The additions sit
in the Codex section; the common text, other agents, CLI skills and `openai.yaml` are unchanged.
`SkillsTest` passed, 9 of 9; `mvn package` passed in a copy, 244 tests with none skipped.
The preceding smoke test used seven MCP tools on the repository
in the owner's authorized GitHub tab; it did not test writing, submissions or automatic skill
selection. **Next:** review the skill edit; the revised skill has not been tried in a fresh agent.

## The diagrams looked at again for alignment and wording, 2026-11-27

On branch `ccr-7d9f8e27-k7i1f9`, made from `main` at `f6fe056`, documentation only. Every picture rendered and looked at. In the SVG pictures (`build.mjs`): the legends' gaps are even (each word's width is estimated, where a fixed width per letter left wide gaps after long words); in the components, the loopback label no longer touches the interfaces' box and the agent's labels have room; in the checks, the "yes" above the authorized tab no longer sits on the extension's box, the result's ENFORCED and BEST EFFORT stand on the lines they name, the note beside it is centred, and the session check reads "not paused or suspended"; in the security boundary the fork is coloured as in the overview, so no slate line leads to what is out of reach. In the Mermaid diagrams: notes that ran out of their box span two participants, the submission's long note is in three lines, the submission's states lead their non-submissions to one *Not submitted* state where six lines crossed the diagram to the end marker, and five messages are reworded. **Next:** the owner's look and commit; the pages on GitHub, whose Mermaid version was not tried here.

## A virus scanner quarantined `TabGoblin.exe`, 2026-11-27

The owner's scanner on Windows (Avira) put the download's `TabGoblin.exe` in quarantine as `Drop.Win64.UserProfileSelfRun`. The likely cause, from the code and not from the scanner: when the window opened, JavaFX unpacked the 54 DLLs in the jar (among them `ucrtbase.dll` and `msvcp140.dll`) into `%USERPROFILE%\.openjfx\cache` and loaded them from there, which is what such a name describes. On branch `ccr-ed552230-wm7n6w`, made from `main` at `4534eda`, not committed: `release/bundle.sh` puts JavaFX's native files for its system into the runtime (`runtime/tabgoblin-javafx`), and before JavaFX starts the server names that folder in `javafx.cachedir` (`McpMain.nativeFilesFromDownload`, called from `Panel.onFxThread`); JavaFX then finds each file the same as its own and writes nothing. Seen on Linux with a download made here; **not tried on Windows, and not with the scanner.** The program itself is still not signed, and a scanner may hold it back for that alone. **Next:** the owner makes the Windows download, opens the window with `%USERPROFILE%\.openjfx` removed first, checks that it does not come back, and scans the folder.

## A last documentation pass on main, 2026-11-27

On branch `ccr-df3851d4-clmz1a`, made again from `main` at `9c6aed1`, not committed. A submission's `CONFIRMED`, `FAILED` and `UNCERTAIN` are said everywhere as what the page showed, not what the site's backend stored (tool reference, security model, corporate assessment, the submission diagrams); `SECURITY.md` lists credential fields other than passwords among the best-effort controls. **Still open, in the code:** `Ports.note` says 47821-47829 and 37821-37829 where the ranges are eight ports; the tool reference quotes it. **Next:** the owner's look and commit.

## The documentation aligned with main, 2026-11-27

On branch `ccr-df3851d4-clmz1a`, after the diagram commit, documentation only, not committed. The README is half as long: no release history, no comparison tables, no example workflows, one table of controls each marked enforced, configurable or best effort, and no false line that `tabgoblin` is a legacy name. The installation guide and `skills/README.md` name no release, date or test history. Security claims narrowed to what the code does: only `type=password` is certain, other credential fields are best effort; only a form's submit control and Enter in a form are always recognised as submissions, others by English label; high-impact is by English label everywhere; `audit.log` is off unless `on`. The tool reference, the CLI guide and the CLI skills list `INTERRUPTED` as an unknown outcome and a command's own `CANCELLED` as unknown. `server-panel.png` drawn again (`PanelPictures`), with the interface pills. **Found in the code, not changed:** `Ports.note` says the ranges are 47821-47829 and 37821-37829, where they are eight ports (to …28); the tool reference quotes that text. **Next:** the owner's look and commit.

## The diagrams aligned with the code, 2026-11-27

On branch `ccr-df3851d4-clmz1a`, made from `main` at `e701c94`, documentation only, not committed. Every diagram was checked against the code. The five SVG pictures: the server is called the TabGoblin server where the overview said "bridge"; the CLI and MCP are green, as TabGoblin's code; the components show the link endpoint and the two adapters side by side (`Commands`, the MCP SDK), both built from `ToolDefs` and both leading into one service, where both used to run through the tool definitions; the checks picture has three server checks, with the settings marked configurable apart from the enforced ones and `SCREENSHOTS_DISABLED`, `AUTHORIZATION_EXPIRED` and the cancel rule added; each control is marked enforced, configurable or best effort. The Mermaid diagrams end every refusal, cancellation and expiry in a `break`, where three had the flow go on after a refusal (connection, authorization, submission); the connection diagram is two now (link, extension pairing, with their close codes); the submission's sequence and states follow `submit` in `background.ts` (`FILL_REJECTED`, the form's own validation, the last safe point, a control gone at the click); the session lifecycle has pause and suspension as two independent states; a small flow says how a cancelled operation ends; the CLI guide's diagram has the refusals with exit code 3 and a command ended while it runs. Also mended in the prose: a CLI command does not send an MCP tool call (`architecture.md`, "Processes and ports"), and the revocation table has the CLI's cancel. The conventions (names, line meanings, `break`, no semicolons) are in `development.md`, "About the diagrams". **Next:** the owner's look and commit; a look at the pages on GitHub, whose Mermaid version was not tried here.

## Releases by a workflow that sets the version, 2026-11-27

Merged in pull request 8: `node release/version.mjs` changes the version in the ten files that carry it, betas included (`0.3.0-beta.1` is `"version": "0.3.0.1"` and a `version_name` in the manifest), and the release workflow is started by hand with a version: from `main` a release, from another branch the next beta as a pre-release; it commits the version and tags only after everything passed. On branch `ccr-9855a613-wqwjrk`, made again from `main` at `4e00e6a`: a release's notes get the list GitHub makes of the pull requests merged since the release before (`--generate-notes`; a beta counts from the beta before, `--previous` in the script), and the README and the installation guide no longer say that 0.2.0 is the published release: they say what a release has, what the first one lacked, and link to the latest. **Not known:** whether `main` refuses the workflow's push; the workflow has not run on GitHub. **Next:** the owner's merge, then a run of *Release* on `main` with *publish* off, then with it on (0.4.0 is meant).

## A review of WP-31 and WP-32, 2026-11-27

On branch `ccr-2317e25f-tftdvd` (the same commits as `cli-mcp-side-by-side`): a review found four faults in the command line's conversation with the server and six smaller ones, mended (see the validation log). **Left open:** the window says every agent is turned away while the settings file cannot be read, where agents are let in and only sites refused (`PanelModel.Blocked`); every command's process logs the blocked sites and the policy on its standard error (`Cli.java` reads the file through `BlockedSites.source`); the validation log is not folded to about ten entries; `release/bundle.sh` does not look at an `app.classpath` line of `TabGoblin.cfg`; the download's documentation links to pages it does not hold (`docs/agents/`, `TODO.md`, `art/`). Pushed to `cli-mcp-side-by-side`, the branch of pull request 6, after every CI job passed here. **Next:** the owner's merge.

## One name, and the documentation in the download, 2026-11-27

On branch `cli-mcp-side-by-side`, after WP-31, on the owner's word ("no users yet", "do it"): every technical name is `tabgoblin` now (WP-32, in the history of `TODO.md`): the jar, the package and group, `~/.tabgoblin`, `TABGOBLIN_*`, the threads, the notice's element `tabgoblin-notice`. One substitution over the tree; `TODO.md` and the validation log keep the old names as history. The download now holds the documentation (`docs/`, with pictures and diagrams, and the root pages it links to). **A setup from before has to be run again**, and a token from before is not found: `~/.tabgoblin` is new. Every suite passed after it (see the validation log); the Windows and macOS downloads were not made.

## The CLI and MCP side by side, 2026-11-27

On branch `cli-mcp-side-by-side`, made from `ccr-dae1119b-klvwgh` (the Windows program and the review's mends, not merged); built on the owner's word by the proposals of WP-31 (in the history of `TODO.md`), whose decisions the owner took as proposed after it was built. The tools are defined once (`ToolDefs`), a command speaks its own three messages to the server (`Commands`, link version 2) and nothing of MCP (`SeparationTest`), the error's code is a field of a result, and `interfaces = cli` or `mcp` in the settings file turns the other interface off: an MCP start ends with the reason, the server refuses the link, a connected agent is told `INTERFACE_NOT_ALLOWED`. The window has a pill for each interface beside the title, red with a drawn no-entry sign where one is off, marks each agent `CLI` or `MCP`, and counts MCP starts turned away. The pictures of the window were drawn here under Xvfb and looked at. **Not run here:** the end-to-end suite and the extension's check (the extension is not changed); a Windows download. **Next:** end to end on a machine with Chrome, if the run here did not pass; then the owner's merge.

## A program with the goblin's icon in the Windows download, 2026-11-26

On branch `windows-launcher`, not merged: two commits on `main` at `b82f97c`, `bcb890e` (the scripts to double-click for the window and the token) and `26d4f39` (the program), and the review's mends after them. The Windows download gets `TabGoblin.exe`, to double-click for the server's window, in place of `tabgoblin-window.cmd`, and keeps `tabgoblin-token.cmd` and `tabgoblin.cmd`. `release/bundle.sh` has `jpackage` make the program and takes the program and its settings only; the settings (`app/TabGoblin.cfg`) name the jar where it lies, so the jar is there once and an agent's registration is as before. The icon file is written by `art/mascot.ts --windows-icon` when a download is made and is not in the tree. In the server: a start by that program is a person's though it has no console (`McpMain.byHand`), the one server is then started with the Java the program runs on (`McpMain.launcher`), and a window that could not be opened is said in a message window (`Panel.tell`), or in the log if JavaFX itself does not start. The program means the window whatever its arguments (`McpMain.wantsWindow`): the packaging tool's `--panel` is only a default that any argument replaces. While the server that the program started comes up, a look that times out is waited out; only the first look, at a server that was there already, says that the port is held by something that does not answer. Tried from a download made here before the review's mends; see the validation log. The mends are tested in the unit tests only, not in a download on Windows.

**Not signed.** Nothing of ours in the download is: the Java that `jlink` puts into it is not either, though the JDK's own is. Windows may ask before it runs these files, and a machine that runs signed programs only refuses them; this was so before the program was added. Signing the download is not begun. **Not done:** the same for macOS, which refuses an unsigned program outright, and Linux, where a program in a folder shows no icon; setup still names the command for the window, not the program.

## A move through history that loads late, and the window's steps made steady, 2026-11-26

On branch `history-waits-for-load`, made from `main` at `7bca71d`; in the working tree, not committed. Found in a test of the command line on a public site with the owner's Chrome: `navigate --history back` answered `no-change` with the address it was leaving, once; in 24 further tries, 16 of them after the mend, it answered rightly, each within 150 ms. The cause is concluded from the code, not seen: a move through history had a second and a half for a load to begin. The page now says whether the entry it goes to is another document, and the extension then waits for that load as for any other. Shown by a test with a made-up tab only; no slow move was met on the site.

**The section "The server's window" of the end-to-end suite, merged to `main` earlier the same day (`7bca71d`), failed in two of the next three runs,** in two different steps, and is mended on this branch: the step with Kill took a random port for its second server without looking at the eight after it, and asserted two facts in one line; it takes nine free ports in a row now and says which fact is wrong. The first step read the window before the newest agent had said its name; it waits for the name. What failed in the step with Kill was not seen: the cause is the likely one. After both mends the suite passed twice in a row, 115 of 115. **Until this branch is merged, the end-to-end job on `main` can fail on that section.** The section is on Windows only, and CI's job is on a Windows runner, where it has not run.

The test that holds the goblin's files to their script compared one text file byte for byte, and failed on a Windows checkout, which gives that file other line ends; with it the extension's build did not run here. It compares the words now.

## The README and the documentation's review, 2026-11-26

On branch `claude/docs-onboarding`, made from `main` at `d3f3436`, on the owner's word; documentation only. The README is in seven sections: what TabGoblin is, how it works, security by design (each control marked enforced, configurable or best effort, and where it stops), a quick start of four steps, CLI or MCP with the setup lines of the three agents, example use cases, and the documentation. **The published release, 0.2.0, has MCP only** (eleven tools, no CLI, no `--agent`, no workspaces, no policy beyond blocked sites, no audit record): the README and the installation guide say so, and that until the next release `main` is built and packed with `release/bundle.sh`. The diagrams have a fourth colour, amber, for what asks the user; authorized tabs are green; a fifth diagram, `security-boundary.svg`, is the README's. Mended in the pages: the CLI guide's walkthrough takes a new snapshot after following a link, Pause is said as it acts (a running command is cancelled before its next step; a step already done is not undone), two troubleshooting rows hold for both interfaces, Read is said without "sends nothing", the Java Maven needs is 25. **Left for the code:** the popup says *Disconnected: is the MCP server running?* to an agent of either interface (`popup.ts`). What passed is in the validation log.

## The pixel goblin, 2026-11-26

On branch `claude/goblin-mascot`, made from `claude/branch-review-fixes`, on the owner's word and to the owner's two pictures (a goblin in full with a hood, a pickaxe and a z, and the face that is the icon now). One drawing, `art/goblin.ts`, is every picture of the goblin: the icons (also the server's window icon), the popup's logo, the notice's face, and the panel's sprites; `art/mascot.ts` writes the files, and a test holds them to it. A critical review of the first form followed, on the owner's word, and its twelve points are mended in the second commit: the props stay in the goblin's own room, a running call is shown while it runs, a new mood waits for a whole round, at rest it is still but for a blink, it waits while the browser is not connected, the body stands out on the dark ground, the satchel and strap are gone, walking is a two-pixel step, the eyes have a shine of two by two, the 48-pixel icon is a 24-pixel face, a refusal is a shield and not a puzzle, and the z is one quiet one. The popup's and the notice's pictures in `docs/images` are drawn again (in this container's font). **Left:** no hood (the owner's icon has none); the look on Windows and macOS is not seen. The extensions page's picture was taken with this container's Chromium, with the line that it is managed by an organization hidden: the next run of `screenshots.mjs` on a machine of the owner's draws it plainly. What passed is in the validation log.

## Review of `claude/branch-review-xcf2ty`, 2026-11-25

A review of the branch's eight commits found ten faults; all are mended, in the working tree, not committed. `navigate`: a load that has to come is waited for on Chrome's events and no longer by looking at the tab every tenth of a second, so a quick load of the same address is not missed; a site that has not answered after 20 seconds, with the navigation still pending, is `timeout` and no longer `no-change`; and a move to the same address without its fragment is waited for as a new document. The window: on a screen lower than 560 plus its margin the screen wins; in a system's frame its lowest height counts the title bar; an agent is told that the window is open only while it is on the screen, not after it was hidden or put away; the port's tooltip is made once; and the log's short line says `outside scope` after a call refused for leaving its sites. Also `state.md`'s two older copies of two entries taken out, and two claims in `development.md` and `TODO.md` mended. What passed is in the validation log. Left as it was: a hidden window does not come up again by itself when the browser has another token (it does so once, as before); the agent is then sent to `--show-token`.

## Server panel, 2026-11-25

The working tree shows the popup's **First port** in the header before pairing. Click the number to copy it. Sessions, Metrics, Log and Control now fold independently. A running server picks up the change when started from the rebuilt jar.

## Skills, 2026-11-25

All three CLI skills now cover reusing a configured first port and investigating failed builds; the three MCP skills have the failed build too. The next release build will include the updated instructions.

## Review of `smoke-tests`, 2026-11-25

Four of the review's nine findings are mended, committed on `smoke-tests` (`ff65692`) on the owner's word, not pushed: three in the MCP test client (`e2e/mcp-client.mjs`) and the panel's first port, which is counted back from the server's link port. The end-to-end suite passed with the changed client, 110 of 110. Two more are mended since: the failed-build section is in the three MCP skills as well, in the words of tools, and `SkillsTest` lets a CLI skill name `--agent` and `--port` of the server's options and no other. The last three are mended as well, on the owner's word: an agent's port shows again, in its heading where a server has several, and for one agent at the end of the connection line where it is another than the port under the title; a folded Log card is written on and holds nothing; and an `error` event ends the test client only when the process never started. None of the review's findings is open. The window was drawn, not seen: the jar is not built.

## The command line on Windows, 2026-11-25

Used by hand with the real extension and a tab the owner gave with Explore: reading, Explore's actions and the refusals work, and are in the validation log. **`navigate` said `no-change` with the old address where a site was slow to answer,** though the tab went there: the extension took a tab to have stayed when no load had begun after a second and a half. It now waits for a load that has to come, up to the 20 seconds a load has. Mended, in the same commit, and seen on the site where it was found, for another address. For the address the tab is already at it was mended after that, and seen there too once the owner had loaded the extension again. Still not tried on Windows: Write, `submit`, `tabgoblin.cmd`.

## Whose a tab is, 2026-11-25

A tab given to *Any agent* is the first agent's that uses it, and closed to every other: the owner met that with an agent of the command line and found it hard to see. The popup's row now says `Owner: <agent>`, and the server's window `owner: <agent>` in a tab's row where it has several agents. In the same commit; the suite passed with it, 110 of 110. Not seen in the real window, which needs a new jar. Left as it is: the option's name *Any agent*, and that an agent which is refused is not told that another agent has the tab.

## The window's port, 2026-11-25

The chip under the title reads **Port** and no longer *First port*, on the owner's word; its tooltip says that it is the number for the popup's Connection. The popup's own field is still called *First port*, and so is the setting in the documentation: whether those follow is the owner's to say. Committed.

## The window gone over critically, 2026-11-25

On the owner's word, after a review of twelve of its drawn states. Committed (`b93640a`), and drawn, not seen in the real window. A tool call's line in the Log is short (`s1 navigate  31 ms  NAVIGATION_BLOCKED`), where it took four rows; the note under Stop and Kill is one line, and the rest is under the pointer; Metrics' second column is headed *typical*, with what it means under the pointer; a server that waits for the extension says what to do; a long problem is a line for each sentence; and where no browser is connected the Sessions card says that tabs show once it is. With several agents the list shows three rows since, and the window does not scroll there. Left on purpose: `owner: <agent>` under that agent's heading, which says the name twice and was asked for; and the label Kill, since it does end the process and needs two clicks as Stop does. Open for the owner: the popup's field and the documentation still say *First port*, and so does the message of a server without a port.

## The window under the keyboard, 2026-11-25

Looked at with two programs that drive the window's own code (in the session's scratch folder, not in the repository): Tab reaches every control in the order they are shown, Space and Enter press them, no label is cut short, and text has a contrast of 6.3 to 1 or more. What was found is mended, on the owner's word: the port chip is reached and pressed by the keyboard and takes a click 25 high; the window is light where the system is, as the popup is; its lower edge makes it higher or lower, down to 560, and it opens where and as high as it was left, kept in Java's preferences of the user, if that place is still on a screen; a switch that is off has an edge that is seen; a card's heading is 24 high; and with several agents the list shows three rows as with one, so the window itself does not scroll there. Seen in the real window on Windows, opened as the server opens it: the dark theme on a system set to dark, the edge's pointer and a drag by it, and a place kept and read back.

**The server needs Java 25 since 2026-11-25, and has JavaFX 27.0.1.1,** on the owner's word ("ok go ahead with java 25"): JavaFX 27 is compiled for Java 25, and it is what tells the window the system's theme and whether less motion is asked for. Committed on `smoke-tests`. **What it changes for a setup:** a jar built from here does not start on an older Java (`UnsupportedClassVersionError`, class file version 69), so an agent's registration that names a Java 21 has to name a Java 25 or newer; the owner's own names `azul-21.0.10`, and the session did not change it. A download carries its own runtime and is not affected. The two workflows ask for Java 25 and **have not run on GitHub since.** Not seen: the light theme and less motion in a real window (the system here is set to dark and to motion), a change of either while the window is open, Linux and macOS, a scaled screen, a screen reader. 

**The window on Windows has the system's frame around its own header since 2026-11-25,** on the owner's word after seeing a try of it in both themes ("adopt it, close hides the window, remove maximize"): `StageStyle.EXTENDED`, the system's buttons switched off, and the header's own two for putting the window away and for hiding it. Hiding ends nothing, and `--panel` shows the window again. No button fills the screen, and a request to is undone. Committed on `smoke-tests` on the owner's word. Seen in the real window, opened as the server opens it: the style, the two buttons and what the system takes them for, a height that follows the frame, the fill refused, hidden by a close request and shown again by what `--panel` calls; and every control pressed with the real pointer. On a real server started from the jar, Stop and Kill were each pressed twice through the system's accessibility interface, and the server's process ended both times. **By the owner, in the real window of a server started by hand on Java 27:** the header moves the window, a click on the port copies it, and the height can be changed. The session could not show the header's drag itself: a scripted pointer did not move the window, and a hit test sent from another process said *client area* for the header while JavaFX's own said *drag bar*; the owner's hand settled it. Not tried: `--panel` from a second process bringing a hidden window back. The window without any frame is still there for a Windows whose JavaFX says it cannot do this; nothing draws it any more, and the pictures are of the new one.

## Where the code is

- `main` = `origin/main` = `fde041c`: the owner's merge of `release-keeps-ci` on
  2026-11-23, and pushed. Before it, the same day, the merge of `easy-install`, which brought
  WP-17 as it was cut back and WP-15. The repository is public since 2026-11-22.
- **The tag `v0.2.0` is on `fde041c`, and release 0.2.0 was published from it** on
  2026-11-23: the first release.
- Branch `wp-24-performance`, made from `main` on 2026-11-23: the filing of WP-24, a
  performance test between the extension and the server, with the owner's decisions on it,
  which is not to be started yet; the filing of WP-25, release notes that say what changed;
  and the records of the first release. Its commits were made on the owner's word. Not pushed
  and not merged.
- Branch `simpler-front-pages`, made from `wp-24-performance` on 2026-11-23: the root README
  and `docs/README.md` made simpler, after the owner said the documentation might be too
  complex. Both now say in a few steps what happens when an agent uses a tool; the quick
  start is the download; the pages are grouped by who reads them; and `docs/README.md` has the
  chain of who talks to whom as a few lines of plain text. No other page was touched. The
  filing of WP-26 is on this branch as well.
  One commit, made on the owner's word. Not pushed and not merged. Whether the longer guides
  get the same is the owner's to say once these two have been read.
- Branch `claude/tabgoblin-security-features-ncxa9m`, made from `a06b0ce` (the merge of
  `simpler-front-pages`) on 2026-11-24, in a session that ran in the cloud: WP-27, security
  hardening and features for developers. Committed there by the session, and pushed to that
  branch on the owner's word ("Push to development branch your work"). Nothing went to `main`, and no pull request was opened. Not merged. It carries a branch `smart-extract`, merged into it.
  The documentation was rewritten there on 2026-11-24, on the owner's word: three pages have
  new names (`docs/security-model.md`, `docs/developer-guide.md`, `docs/tool-reference.md`),
  three are new (`docs/corporate-assessment.md`, `SECURITY.md`, `CONTRIBUTING.md`), and two
  are gone, their content folded into others (`docs/README.md`, `docs/cheatsheet.md`). The
  owner has not read them yet. Two sentences in `SECURITY.md` speak for the owner and want
  their yes: that only the latest release is maintained, and that a confirmed vulnerability
  is described in a release's notes. Whether GitHub's private reporting is switched on for
  the repository was not looked at; the page says what to do if it is not. Release 0.2.0's
  notes link to `docs/installation.md`, which is where it was.
- Branch `collect-late-page`, made from `main` at `9030038` on 2026-11-24: `browser_collect`
  with `next` waits for a page that a site swaps in late, where it gave up after a quarter of
  a second and reported one page. Found in a smoke test on a public site, with the real
  extension. Committed on the owner's word. Not pushed and not merged. Not yet seen on the
  site where it was found: the extension has to be built from this branch and loaded again.
  A plain `browser_click` on such a link still reports `navigated: false`; left as it is.
- `main` has moved on since the lines above: the owner merged the branch of WP-27 with the
  rewritten documentation, `editors-page-simpler`, and `collect-late-page` (`1e355c7`).
- Branch `wp-28-fallback-ports`, made from `1e355c7` on 2026-11-24: WP-28, a list of three
  first ports (47821, 37821, 27821) that the server, the agents' processes and the extension
  all know, so that a machine whose system keeps the usual ports back still gets a server.
  Built on the owner's word to mend the fault; its four decisions were taken as the entry
  proposed, and which ports is the session's choice: all four are the owner's to change.
  **It has not run on a machine with a reserved range,** which is what its acceptance asks
  for: the owner's Windows machine is the place. Committed, and pushed to that branch on the owner's word; no pull request.
  The owner merged it into `main` on 2026-11-24 (`dec2f8f`), with a repair to one of its
  tests that failed on Windows only. On that machine the server is started with `--port`, so
  the fallback itself is still not seen there.
- Branch `port-copy-and-0.2.1`, made from `main` at `dec2f8f` on 2026-11-24, both asked for by
  the owner: a click on a port in the server's window copies its number, and the version is
  0.2.1 in the seven places the runbook names. Committed on the owner's word. Not pushed and
  not merged. No tag: a release of 0.2.1 is the owner's, and WP-25 (release notes) was filed
  to come with the next release. The click was not tried in the real window. The owner merged
  it into `main` on 2026-11-24 (`9229490`).
- Branch `late-navigation`, made from `main` at `9229490` on 2026-11-24, on the owner's word
  ("yeah fix them"): after a click on a link the address has up to two seconds to change
  before the tab is taken to have stayed, so that `browser_click` says where the tab went and
  `browser_collect` reads the next page and not the one before, on a site that swaps its
  content in late. Committed on the owner's word. Not pushed and not merged. Not yet seen on
  the site where the faults were found: the extension has to be built from it and loaded again.
- Branch `ccr-6350ba03-tntbzp`, made from `main` at `f720a40` on 2026-11-25, in a session that
  ran in the cloud: WP-29, the tools as commands of a terminal (`tabgoblin status --agent
  <name>`), for an agent without MCP. A command is one MCP tool call through the same link to
  the same server; the server keeps such an agent between its commands. `--setup <agent>
  --mode cli`, a skill of its own for the command line for each of the three agents
  (`skills/cli`; the ones for MCP are in `skills/mcp` since then), and the documentation. Committed there by the
  session, and pushed to that branch on the owner's word ("Commit an push to a branch"). Not
  merged, and no pull request.
- `main` = `origin/main` = `402aaf8` since the owner merged WP-29 on 2026-11-25 and removed its
  branch. Branch `ccr-6350ba03-tntbzp` was then made anew from that `main`, in the same cloud
  session, for WP-30: the documentation gone over so that TabGoblin is presented as a browser
  bridge with two interfaces, CLI and MCP, and not as an MCP server first. Documentation only;
  no code and no skill was changed. Committed there by the session and pushed on the owner's
  word. A second commit the same day is a last review of it for accuracy: what is said about
  approvals, the first steps with the CLI, and restrictions on MCP as against restrictions on
  agents in the browser.
- A branch `svg-pictures` was made, pushed and deleted by the owner on 2026-11-23 (WP-23, see
  the backlog's overview). Nothing of it is in `main`.

## Active work

| Item | Status | Authoritative source |
|---|---|---|
| The backlog | Cleared on 2026-11-27 to what is open: WP-12, WP-16, WP-24, WP-25 and WP-26 not started; small faults found and not mended; what was not tried; what is the owner's. The packages that were built and merged are in git history | [TODO.md](../../TODO.md) |

## Blockers and unknowns

- **`docs/mcp-reference.md` is `docs/tool-reference.md` since 2026-11-25** (branch
  `ccr-6350ba03-tntbzp`, made anew from `main` at `cf9bbca`; committed by the session, not
  pushed). The old name is a short page that points to the new one, so a link to the file
  still arrives; a link to one of its sections arrives at that pointer and not at the section.
  `SkillsTest` and `ToolReferenceTest` read the new name. Older entries of the backlog and of
  the validation log name the file as it is called now.

- **Four diagrams are SVG files now** (`docs/assets/diagrams/`), where they were Mermaid in the
  pages. The proxy at the owner's work that holds back the documentation's pictures (below)
  will hold these back too, by what WP-23 found; Mermaid was text and was not affected. Their
  alternative texts say what each shows. They were looked at in the container's Chromium on a
  light and a dark ground, not on GitHub. The owner reported the same day that no picture
  showed in IntelliJ: the four were then made one file each, with a ground of its own, and
  put into the pages in the plain Markdown form. Not seen in IntelliJ by the session. The
  thirteen screenshots are `<img>` elements as before; whether those show in IntelliJ is not
  known. The Mermaid diagrams show there only with a plugin that draws Mermaid.

- **Words in the program still put MCP first,** found in the review of 2026-11-25 and left,
  since that was for the documentation only: the popup's "Disconnected: is the MCP server
  running?", the help's heading "TabGoblin MCP server", the first line of `tabgoblin tools`,
  and the status' "pass session=<id> to every tool", which a CLI agent reads as well.

- **The command line has run on Linux only,** in a container with Java 21 and the container's
  Chromium, started without its sandbox. Not tried: Windows and macOS, `tabgoblin.cmd` with
  arguments that have quotes in them, a download's launcher, and a real agent with the skill's
  new section. The server's window was not seen with an agent of the command line in it.
- **The step of the end-to-end suite that failed once in four runs is explained, by what mended it:** "an agent
  whose server restarts gets its sessions back" waited for the tab's row to read `agent-one (not connected)`
  while a second program under the same name was connected. The popup tells two agents of one name apart by
  adding the owner's id, so that text is there only until the popup has the second one's name: a race. On the
  jar built on 2026-11-25 at 20:06 it failed twice in two runs, and the steps after it with it; with the wait
  taking the name with or without the id it passed, 110 of 110. The popup's text at the failing moment was
  not read. A popup wait that fails now says what the popup showed.
- **An agent of the command line holds one of the eight ports for ten minutes after its last
  command.** Many names in a short time can use the ports up; the message is the one for
  eight connected agents.

- **The default ports can be kept back by Windows, and then no server has a port.** Found on
  the owner's machine on 2026-11-24: Windows had the range 47749 to 47848 reserved for its own
  networking, which holds the server's eight ports and the one after them. The server now says
  that this is the cause and how to list the ranges, and the window says that it has no port;
  the owner runs with `--port 39821`. What does not exist yet is a way around it without the
  user: it is filed as WP-28, and waits for the owner's decisions.
- **A real agent has used WP-27 by hand, in part.** With the real extension on Windows and the
  owner at the popup: reading, a click on a link, hovering, collecting, a screenshot, three
  refusals, a request for access that was allowed, a fill, Enter in a search field, and a
  submission that was confirmed. Not yet by hand: a Deny of a question; pause, revoke and
  disconnect; a workspace; a policy; the notice's **Answer** button.

- **WP-27 changes what an existing setup does,** in four ways that its entry lists: the server
  and the extension have to be of the same release (protocol 3); tabs come back after a restart
  only to an agent that is named with `--agent`; a screenshot is refused while a frame of
  another site is in view; and text that looks like a credential reads `[redacted]`.
- **WP-27 has run on Linux and on Windows.** In a container, with its Chromium and Java 21:
  the three suites, and the window's tests and pictures on a virtual display. On Windows 11, by
  a second session at `41248d7`: the three suites with none skipped, and the editor lab with
  the tab in front, 222 of 225 as before WP-27. Not run: the two workflows, which run on GitHub
  only; the editor lab with `BACKGROUND=1`; the live window on a desktop with a policy in
  force; a real agent with a real extension by hand.
- **The editor lab's packages carry two advisories of high severity** (`npm audit` in
  `e2e/editors`): fixed versions of other people's editors, loaded in a test page and never
  shipped. The new CI job lists them and does not fail on them.

- **Release 0.2.0 is published, and nobody has used it.** Read from GitHub on 2026-11-23: run
  #2 of *Release*, for the tag `v0.2.0` on `fde041c`, succeeded; the release has the three
  downloads, 47.9 MB for Windows, 51.3 MB for Linux and 47.1 MB for macOS, and
  `SHA256SUMS.txt` with a line for each; GitHub holds an attestation for the Windows
  download, which is the one that was asked for. Not done: a download of the release taken
  and used, on any system; and `gh attestation verify` run against one.
- **That run cancelled CI run #22,** the one for the merge of `easy-install`, after 5m 25s:
  four of its jobs had ended and *Editors* was cut off. GitHub's words: *Canceling since a
  higher priority waiting request for ci-refs/heads/main exists*. The release calls the CI's
  jobs, and they were in the CI's group for the branch. On `release-keeps-ci` the group has
  the workflow's name in it, merged since. Not shown on GitHub yet: it takes a release started
  on a branch while a CI run for that branch is going. CI run #23, for the merge of that
  change, passed; the release for the tag ran on the tag, which was never in the CI's group.
- **The downloads: Windows used, Linux in part, macOS made and not used.** On Windows the download
  was unpacked into a folder with a space in its name and used: help, setup, the line for
  Claude Code in two shells, the server and its window, and the end-to-end suite on the runtime
  that is inside. In the Linux subsystem, without Java: help, setup, and the server as an agent
  starts it; its window was not seen, though the server's log said *panel shown*. The one for
  macOS was made on GitHub's machine, where the server started on its runtime. None is signed.
- **On Linux the server that `--panel` starts in a terminal ended with that terminal,** in
  one try with a terminal made up for it. The command says that it stays. Not mended: it is
  the one server's start, which had not been tried on Linux before.
- **Setup's lines for Codex and Copilot are from their documentation,** read on 2026-11-23, and
  were not run. Claude Code's was.
- **The window that comes up by itself has run on Windows only,** with Java 21, and with a
  made-up browser: a program that answers the server's challenge with a proof that is none.
  Not tried: Linux and macOS, and the owner's own extension after a real rotation.
- **A server that starts is connected on the pairing made before,** as it always was. WP-17
  as it was filed would have changed that; the owner dropped it for what it cost.
- **A proxy at the owner's work holds back the documentation's pictures on GitHub,** PNG and
  SVG alike (WP-23, dropped). What the block page names when a picture's address is opened was
  not read, so the cause is not known.
- **The three skills for the command line have not been loaded in an agent either;** they
  were installed in a test only.
- **The three skills have not been loaded in an agent,** and none is in the owner's own home
  folder: the command that installs one was tried against a folder made for the purpose. Their
  places and fields are from each agent's documentation as read on 2026-11-22. How the server is added to Codex and to Copilot
  could not be read that day, and is said nowhere beyond the general row of the installation
  guide.
- **Blocked sites have run on Windows only,** with Java 21 and the suite's Chrome. **Edit** in
  the server's window was pressed there in the real window: it opened Notepad on the settings
  file. On Linux it asks `xdg-open` and on macOS `open -t`; neither was tried. Not tried
  either: this server with an extension from before this change, with real parts. The server
  is built not to send such an extension the list while it checks the pairing, which it would
  take for a failed pairing; that is covered by a test of the server alone.
- **The settings file is beside the token that is in use.** A setup with `--token-file` has its
  own list there, and the owner's own list is `tabgoblin.properties` in `.tabgoblin`
  of the home folder. None exists until **Edit** is pressed or the file is written by hand.
- **The server's window is 824 pixels high,** 64 more than before the row of blocked sites and
  the line over the metrics' numbers. On a screen lower than that it is as high as fits, as
  before.
- **A screenshot of a tab whose window is covered or minimized was not tried.** The page draws
  nothing then, so it answers at once that its notice is gone, and the picture is what the
  browser has. The same goes for a page that has not drawn after a second and a half.
- **CI runs again.** Runs #15 to #20 had failed in three seconds each, with GitHub's message
  about the account's billing. Run #21, for the merge of `agent-skills` on 2026-11-22, passed
  in 5m 34s, and so did every job of the release's run on 2026-11-23; read on GitHub that day.
  What cured it was not looked into.
- **`main` on GitHub has no ruleset and no branch protection,** read the same way; the other
  settings that were read are in WP-21. Changing them is the owner's.
- **After a site is taken off the list, a command can still be refused for a moment** by an
  extension that has not been told yet. Since the server tells it ahead of the next command,
  the suite no longer shows it; a command that was already on its way can.
- **One server for all agents has run on Windows with Java 21 only.** Not tried: Linux and
  macOS, where a process of its own is started in another way; and an IDE's program that ends
  every process below it when it closes, which would end the server with that agent and leave
  the others to start it anew. With real processes these were seen: two agents through one
  server, an agent leaving, the server ending after its last agent, the jar run in a terminal
  with `--panel`, an agent joining that server, and Stop. Done in tests only, inside one Java
  process: the taking over when the server is gone without a stop, and the jar run in a
  terminal while a server runs. Covered by no run: a process that serves its agent alone because
  another program holds the server's port, beyond that it finds this out.
- **Kill is no stop any more.** Agents that still run start the server anew at once. The
  window's line under the two buttons still says only that Kill ends the process at once.
- **A server that runs is not replaced by a new build.** An agent that connects after the jar
  was rebuilt is served by the server that was there, with the old code, until that server
  has ended: by Stop, or with its last agent. Nothing in the window says that the jar on disk
  is newer.
- **The owner's extension was connected to no server for some minutes on 2026-11-22**, around
  15:35, with Chrome running. Why is not known; after the owner built and reloaded it at
  15:47 it was connected.
- **A disconnected agent's server is turned away on what it says of itself,** before any
  proof, by an extension and a server that are both of this build. With either of them older
  it is paired with and closed at every look, as before. Seen end to end in the suite's
  Chrome: one disconnect in the server's log and nothing after it.
- **Tabs come back to a server that is started again by its agent's name, and at once.** Seen
  with the suite's client and with a server started by hand, on Windows. Not tried: a real
  IDE's agent. What follows from a name being all there is: of two agents with the same name,
  the one that connects next takes up the tabs of the one that has gone, where before it took
  them with its first use of them; and every server started by hand has one name, *Started by
  hand*, so one such server takes up the tabs of the one before it. Each tab that is taken up
  adds a line to the popup's activity list. WP-17 would have put a pairing in front of that
  at every start of a server; it was taken out again, and this is as it was.
- **The copy button of the panel was pressed on Windows only.** There the clipboard held the
  token, the window and the log had nothing of it, and it was gone from the clipboard a minute
  later. The clipboard on Linux and macOS was not tried. A history of the clipboard that the
  system keeps is not emptied, and a server that ends within the minute, other than by its
  Stop button, leaves the token on the clipboard.
- **`OFF` on the toolbar is new, and the session's choice of word:** tabs are authorized and no
  agent that may use them is connected. Before, the badge said `ON` for that.
- **A server that hangs is shown as gone within a minute,** by the extension. Its agent is not
  told: a tool call to a server that hangs gets no answer, as before. Seen once with a real
  server whose process was stopped: 60 seconds until the badge said `OFF`, 3 seconds until it
  said `ON` after the server ran again. Not tried: a hang while a command runs, and a machine
  that sleeps and wakes.
- **The panel on a screen lower than itself was drawn, not seen.** The part between its header
  and its controls scrolls there. From about six tabs the controls of the panel as it was
  merged fell out of the window; that is mended on `aftercare` and is so on `main` until it is
  merged.
- **The server's panel was seen on two systems.** Windows 11 with Java 21 and 26: the window,
  its icon on the taskbar, and every control pressed in the real window. Ubuntu 26.04 in the
  Linux subsystem of Windows with Java 21: the framed window with the whole panel, and the
  server ending in order; its buttons were not pressed there. Not run: macOS, any other Linux
  desktop, a scaled screen, a screen reader.
- **The panel's window has no frame on Windows only.** On Linux the frameless see-through
  window was there for the system and drew nothing; the owner saw it first, as an icon on the
  taskbar and nothing else. No test finds that: a drawing of the panel is right when the
  window is not. The runbook says what to look at by hand ("Look at the server's panel").
- **CI does not run the panel.** Its runner has no display, so the six tests of the window are
  skipped there (shown on this machine with `-Djava.awt.headless=true`: 6 skipped, the others
  pass). The jar's native part for Linux has run only in the Linux subsystem.
- **A server that is switched off in its panel looks to the popup like one that does not run:**
  it says *Disconnected: is the MCP server running?*. The extension is refused before any
  pairing and is not told why. Saying so needs a close code of its own, on both sides.
- **The panel's window takes the keyboard when it appears,** as a new window does. No button in
  it has the keyboard then, so a key typed at that moment presses nothing; it still goes to
  the panel and not to where the user was typing.
- **A server with its panel writes lines that are not its own to standard error:** one warning
  of JavaFX at the start, on Java 21 and 26; and on Java 26 four lines of Java's, that a method
  JavaFX uses for drawing is to be removed in a future release. With a log level of `off` they
  still come. Nothing goes to standard output. What the panel does on a Java without that
  method is not known; such a Java was not at hand.
- **When its first port is taken, a server prints a stack trace** of the socket library before
  it takes the next port. Seen while trying the panel; it is so on `main` too (the logging
  library that prints it was there before) and was not looked into.
- **The notice sits where a page may have a button of its own.** It is fixed to the bottom right
  corner, as the pill was. A click on it goes through to the page everywhere but on Pause; a
  button of the page that lies under Pause cannot be clicked while the bar is there, and what
  is under bar and pills is not seen. As two panes it covers less than as one box, about a
  third less with three pills. Not solved: it cannot be moved or put aside, short of switching
  it off under Settings.
- **The new step for the notice has passed once on GitHub's runner**, in run #13. It has two
  places where a slow machine could differ: it must catch the notice while it fades, a window
  of one second, and it compares pictures by the share of dark pixels in the corner, with
  limits (0.05 and 0.02) whose measured values were not written down. One pass does not show
  that it always will.
- **One thing has three names.** The popup's setting reads "Indicator in the page", the
  documentation says notice, and the code says indicator (`tabgoblin-notice`, `indicator.png`,
  the `indicator` setting). The setting's line in the popup, "Shows the agent at work. Has a
  pause button.", is still true and says less than the notice does. Not changed: it is wording
  for the owner, and a change to it changes two of the popup's pictures.
- **A session that is only paused has no notice any more**, and "Agent idle" is what the bar
  says between two commands. Both are choices made while building, not asked for; see WP-11 in the history of
  `TODO.md`.
- **The one-box form is not in git.** It was built first and never committed; the two-pane form
  took its place in the working tree. If the owner wants it back, it has to be made again: bar
  and pills inside one drawn box, the goblin at the bottom left.
- **The notice's motion was looked at in still pictures only:** every state, a pill and the
  whole notice half way through fading, four frames of it arriving, and one state with less
  motion asked for. The goblin's blink and its pulsing glow were not watched in a tab. Not tried: a
  screen reader, a page that is zoomed, a page written from right to left, and the system's
  high-contrast colours.
- **Disconnect holds for one run of an agent's server.** The agent is refused by an id that its
  server makes when it starts; started again, it is connected again, without a tab.
  [security-model.md](../security-model.md#agent-identity-and-authentication) says so.
- **The tree's `chrome-extension/dist` was built on 2026-11-22 at 15:47,** by the owner, and
  has everything of `by-hand-panel`. One thing came after: an answer names the session its
  command ran in, without which a call that names no session is in no tab's metrics.
- **The jar in `java-server/target` was built on 2026-11-22 at 15:47,** by the owner, from
  `by-hand-panel` as it was then. It has not what came after: the card's name Metrics, the
  log's line for every call, the click on a tab, and the one server. The session's own TabGoblin server runs from that jar, so the suites that
  need a jar were run in a copy of the tree, with a jar built there. Build it (`mvn -B -f
  java-server/pom.xml package`) with no server running from it, and restart an agent to get
  the new server.
- **The session's entry for its own server in Claude Code has `--panel`** (local settings of
  this project, changed on 2026-11-22 so that the owner can watch the agent's server). Its
  window was there after the owner's Reconnect at 15:59. The session's tools have been gone
  since about 16:20, when its server was ended; they come back with a Reconnect.
- **The panel's code has run in CI since run #21,** and in the release's run of 2026-11-23,
  where *Java server* passed in 1m 19s. The job's log was not opened: how many of the panel's
  tests were skipped there, on a machine without a display, was not read. On this machine,
  without a display, it is six.
- **The last runs:** the release's run #1 passed in all its jobs on 2026-11-23; CI #22 was
  cancelled by it (above); CI #21 (`2b2bc56`, the merge of `agent-skills`) passed. Before the
  runs that did not start, #14 (`3aa4d5f`) and #13 (`2c26e0b`) passed, #11 (`3071781`) passed,
  and #12 (`5274b04`, the merge of `disconnect-revokes`) failed in one step end to end, 92 of
  93. The step that failed in #12 has passed in every run since; that does not show that a
  fault of timing is gone for good.
- **Why run #12 failed is concluded, not shown.** The step asked the suite's driver where the
  tab was right after the agent's tools had said that it had left its site, and the driver
  still named the page before. The two tool results in front of it passed, so the extension
  had seen the move. It never failed on this machine, and it passed in run #13 without the
  fix and in run #14 with it. The fix waits for the address in the three places that ask this
  way.
- **Every commit still carries the owner's mail address**, a new one too: it comes from the
  owner's git settings. See WP-14, "What remains".
- **Which of two causes failed the end-to-end job in run #8 is not known.** Both give the
  message in its log; both are fixed. See the validation log.
- **One test of the server failed once for a reason that was not looked into further:**
  `closesConnectionThatFloodsMessages` got close code 1006 where it expects 4429, in one of 13
  runs on two cores, the one that ran while the end-to-end suite ran beside it. It is not one of
  the CI failures and nothing was changed for it. A guess, not shown: the test keeps sending
  while the server closes, and a connection closed with messages unread can lose its reason.
- **A session can read CI**, through TabGoblin itself: a tab on `github.com` that the owner
  authorized with Explore, then the run's page and its jobs. `gh` is still not logged in on this
  machine.
- **The browser suites have run only in Chrome on Windows.** The Mac shortcut path in
  `editor.ts` is untested. The two unit suites have also run on Linux, in a container, on
  2026-11-21 (runbook: "Reproduce a CI job"), not since: Docker was not running.
- **No hover.** CSS `:hover` cannot be set without the debugger, so a hover tool was decided
  against on 2026-11-21; the limit is recorded in the root `README.md`.
- **Not tried:** real products built on the tested editor libraries, and IntelliJ's own agent.

## Handoff

- **Last verification:** 2026-11-22, on `agent-skills`, in a copy of the tree with a jar built
  there: the server's 136 tests and the 8 of the conformance check, the extension's 161 with
  type-check and build, and the suite end to end, 95 passed; and the jar's command that
  installs a skill, run against a home folder made for the purpose. Before that, on
  `smoke-fixes`, the same suites with six pictures of a busy page among the checks. By hand: the agent's screenshots measured in the suite's Chrome and in a visible one,
  before and after the fix, and the server's real window read and its new button pressed
  through the accessibility interface. Before that, the same day, the owner's own Chrome and
  agent with the merged build: every tool of Explore on the public repository.
  Details in the [validation log](validation-log.md).
- **Next action:** the owner's push and merge of `wp-24-performance`. Then one of the three
  downloads of release 0.2.0, used on a machine without Java as the installation guide says,
  with the steps and the minutes counted: that is the acceptance of
  WP-15, and the one for macOS has never been used at all. WP-24 is decided and waits for the
  owner's word to start. WP-25 has to be decided and built before the next release, if that
  release is to say what changed. And the rebuild of both parts, which the owner's own Chrome and window
  need for WP-21 and WP-22 as well: the server, after the one that runs from the jar is
  stopped (`mvn -f java-server/pom.xml package`), and the extension
  (`npm --prefix chrome-extension run build`, then a reload in Chrome). And a first try of a
  skill in its agent: the Claude Code one is the nearest, with `--install-skill claude-code`
  and a new session. The first
  CI run with credit is the first to run the panel's code on GitHub. Then the second part of
  WP-18, WP-13's open points, WP-14's remainder (the address, the history), and the decisions
  on WP-12, WP-15 and WP-16. WP-15, an easy install, has its pairing step decided now.
