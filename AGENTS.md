# Agent guide

Read this file and [docs/agents/state.md](docs/agents/state.md) at the start of a session. Load
anything else only when the task map below sends you there.

## Purpose

TabGoblin is a browser bridge for AI agents: it lets agents on the user's machine read and
operate the Chrome tabs the user authorizes, without giving them cookies, tokens or the ability
to run code. An agent reaches it through a CLI or through MCP, which are two interfaces to the
same tools and rules. Two parts:

- `java-server/`: the local server, with both interfaces (Java 25, official MCP Java SDK, stdio). Entry point
  `McpMain.java`. It offers fourteen generic `browser_*` tools and knows no website. There is one
  server process for all agents (`Hub.java`); the process an agent starts passes its messages
  on to it (`Link.java`). An agent without MCP runs the same tools as commands of the same
  program (`Cli.java`), one process for each call, through the same link.
- `chrome-extension/`: a Manifest V3 extension (TypeScript). `background.ts` holds sessions and
  enforces the rules; `content.ts` does the work in the page; the popup is the user's control.

They talk over a WebSocket on 127.0.0.1, paired with a token. Users are people who run an agent in
an IDE or CLI and want it to work in their logged-in browser. The picture and vocabulary are in
[docs/architecture.md](docs/architecture.md).

## Constraints

These decide what a change may look like. This is the short form; where a linked page says more
or says it differently, the linked page is right.

- **Security boundaries are fixed.** No cookies, headers, storage, tokens, raw HTTP, debugger,
  script evaluation or general HTTP requests, ever. Manifest permissions are exactly `activeTab`,
  `scripting`, `storage`, `alarms`; the end-to-end suite asserts it. Authorization is per exact
  origin and checked before every command. If a feature cannot be made safe, disable it; never
  loosen a rule. Owner: [docs/security-model.md](docs/security-model.md).
- **Website-agnostic and library-agnostic.** No selector, hostname, product name, library name or
  library class name in product code. `chrome-extension/test/agnostic.test.ts` enforces part of
  this. Library names belong in `e2e/editors` and in the docs only.
- **Nothing is retried; success is never assumed.** A command is sent once. Unknown outcomes are
  reported as unknown.
- **Only allowlisted information leaves the page.** A new output field needs a reason and a test
  that passwords, hidden inputs and scripts stay out.
- **Rules and DOM code are pure.** Rules live in `policy.ts` without `chrome.*` or DOM; `snapshot`,
  `extract`, `interact`, `editor`, `submit` and `notice` take a document and run under jsdom.
- **Legacy names stay.** The jar and server name `browser-context-mcp`, package `browsercontext`,
  `~/.browser-context-mcp` and `BCMCP_*` are kept for existing setups.
- **Agents read the tools' text output.** Changing a tool's result text is a public contract
  change: update [docs/tool-reference.md](docs/tool-reference.md) and run the end-to-end suite.

The full list of conventions is in
[docs/development.md](docs/development.md#conventions).

Working rules for this repository:

- The owner pushes and merges. Commit when asked; do not push unless asked.
- The owner also merges and removes branches while a session is running. Look at `git status -sb`
  right before a commit, and never commit on `main`: make a branch first. A check in the same
  command line as the commit is printed, not read: twice a commit landed on `main` that way. Let
  the commit refuse instead: `test "$(git branch --show-current)" != main && git commit …`.
- Nothing personal goes into a file or a commit message: no home directory, no mail address
  outside the example domains, no link to your session (no `Claude-Session:` line; the
  `Co-Authored-By:` line stays). Run the check in the runbook ("Check that nothing personal is in
  the files") before a commit; it reads the files, not your commit message.
- Open every generated screenshot and check it shows what you claim before using it.
- Documentation is plain and factual: what was measured, what was not, where it stops.

## Task map

Commands are in the [runbook](docs/agents/runbook.md). Run the focused test first, then
`npm run check` or `mvn package` before you finish; if a server is running from the tree's jar,
build in a copy (runbook: "Common problems"). Three rules apply to every row:

- **Look first.** Search the owner file and `docs/tool-reference.md` for the behaviour before adding it; it
  may exist and only lack a test.
- **If a tool's text output changes**, also update `docs/tool-reference.md` and run the end-to-end suite
  (`e2e/run.mjs`, against the pages in `demo-site/`), whatever the row says. If it changes what
  an agent should do, say it in the three skills for MCP as well (`skills/mcp/`), and in the three for the
  command line (`skills/cli/`).
- Java sources are in `java-server/src/main/java/browsercontext/`, tests in the same path under
  `src/test`. Extension paths below are relative to `chrome-extension/`.

| Task | Start in | Owner of the behaviour | Check |
|---|---|---|---|
| Change what a tool accepts or returns | `BrowserService.java` (arguments), `McpMain.java` (definition, description) | The operation itself is in the extension, see next rows | `BrowserServiceTest`, `ToolReferenceTest`, then end to end; update `docs/tool-reference.md` |
| Change the command line: how a command and its arguments are read, what it prints, its exit codes, how long its agent is kept | `Cli.java` (reading, the one tool call, the answer), `Hub.java` `serveCommand`, `identify`, `letIdleGo` (the agent between commands), `Link.java` `forCommand`, `McpMain.java` `commandLink` | `Cli.java` defines nothing: commands and arguments are `McpMain.toolSpecs`, and a call is an MCP tool call to the one server. It must stay so: no rule, no tool and no second way to the server there. The commands of one key are one agent; a key that an MCP agent holds is refused. Described in [cli.md](docs/cli.md), the identity in [security-model.md](docs/security-model.md#agent-identity-and-authentication) | `CliTest`, `HubTest`, `McpMainTest`, `SetupTest`, end to end (the section "The command line"); the skills in `skills/cli` say what an agent does with it, and `SkillsTest` holds every option they name to the commands |
| Add a tool | [Adding a tool](docs/development.md#adding-a-tool) | `policy.ts`, `interact.ts`, `content.ts`, `background.ts`, `BrowserService.java`, `McpMain.java` | A test at each level: rule, DOM, routing, end to end (a step in `e2e/run.mjs`, a target in `demo-site/`). Then update `docs/tool-reference.md`, the table in `docs/security-model.md` if a property is newly tested, the server instructions in `McpMain.java`, and the tool count ("fourteen") here, in `README.md` and `docs/tool-reference.md`; `ToolReferenceTest` fails until the tool and each of its arguments is in the reference |
| Change what is allowed (access levels, origins, clicks, navigation) | `chrome-extension/src/policy.ts` | `policy.ts` only (`REQUIRED` maps each action to its level; `checkClick` limits what Explore may click; `checkKey` decides about Enter and Space, from what `describeKeyTarget` in `interact.ts` reports); `background.ts` calls it. The levels are described for users in [developer-guide.md](docs/developer-guide.md#access-levels) | `test/policy.test.ts`, `test/background.test.ts`, end to end; keep the developer guide and the server instructions in `McpMain.java` in step |
| Change blocked sites: what an entry blocks, the settings file, what is said to whom | `BlockedSites.java` (the file, the rule), `chrome-extension/src/policy.ts` (`blockedBy`, `checkBlocked`) | The two rules must give the same answers: both are held to `java-server/src/test/resources/browsercontext/blocked-sites-cases.json`. `BrowserService.java` `refuseIfBlocked` refuses before anything is sent; `background.ts` `gate` refuses at the moment of a command; `WebSocketBridge.java` tells the extension the list (`policy`); `popup.ts` and `PanelModel.java` say it to the user. A list that cannot be read blocks everything. The rules are in [security-model.md](docs/security-model.md#blocked-sites) | `BlockedSitesTest`, `BrowserServiceTest`, `test/policy.test.ts`, `test/background.test.ts`, end to end; the window's pictures if what it says changed |
| Change the security policy: what the settings file can restrict, the strict profile, what is said to whom | `BlockedSites.java` (`Limits`, the file's keys), `chrome-extension/src/policy.ts` (`Limits`, `checkLimits`, `endsAt`, `askUnder`, the strict branch of `checkClick`) | Both sides enforce it, as with blocked sites: `BrowserService.java` `refuseIfBlocked` before anything is sent, `background.ts` `gate` and `recheck` at the moment of a command; `WebSocketBridge.java` tells the extension (`policy`). An entry only ever takes something away, and a value that cannot be read blocks everything. The rules are in [security-model.md](docs/security-model.md#the-security-policy) | `BlockedSitesTest`, `BrowserServiceTest`, `test/policy.test.ts`, `test/protocol.test.ts`, `test/background.test.ts`, end to end |
| Change who an agent is: its key, its id, revoking | `AgentKeys.java`, `Hub.java` `identify`, `Link.java` `attach`, `McpMain.java` (`--agent` and the three commands) | The extension knows an agent by the id the server proved and by nothing else (`canUse` in `policy.ts`): no session passes to another id, and a name decides nothing. The rules, and where they stop, are in [security-model.md](docs/security-model.md#agent-identity-and-authentication) | `AgentKeysTest`, `HubTest`, `McpMainTest`, `test/policy.test.ts`, `test/background.test.ts`, end to end (an agent without a key under the owner's name) |
| Change what is taken out before it leaves the page | `chrome-extension/src/redact.ts`; `content.ts` applies it to what a snapshot and an extract say, `background.ts` to addresses | By shape, never by website. [security-model.md](docs/security-model.md#sensitive-information-handling) says what it catches and that it has holes | `test/redact.test.ts`, end to end |
| Change requests for access, or workspaces | `chrome-extension/src/policy.ts` (`checkAccessRequest`, `workspaceName`), `background.ts` (`requestAccess`, and `answerRequest`, `setWorkspace` and the three workspace requests in `handlePopup`), `popup.ts` (`renderRequests`, the workspace's heading), `BrowserService.java` `requestAccess` | Same. Neither grants anything: a level is the user's Allow in the popup, a tab their click on that tab, and a workspace is a name. The rules are in [security-model.md](docs/security-model.md#workspaces-and-requests-for-access) | `test/policy.test.ts`, `test/background.test.ts`, `BrowserServiceTest`, end to end (it drives the real popup) |
| Change what the skills tell an agent | `skills/mcp/claude-code`, `skills/mcp/codex`, `skills/mcp/copilot`: a `tabgoblin/SKILL.md` in each, for the MCP tools; and the same three under `skills/cli`, for the commands of the command line (`--mode cli`) | Two times three texts, each three kept the same by hand from "Start with the status" on; above that each has its agent's own head. What changes for an agent changes in both kinds: one speaks of tools, the other of commands, and neither sends an agent to the other way. The tool reference owns what a tool takes and returns; a skill says what to do with it. Where each agent wants its skill is in [skills/README.md](skills/README.md), and in `Skills.java`, which puts one there on `--install-skill`: a new file of a skill has to be named there, and the build takes the folder into the jar (`pom.xml`) | `SkillsTest` (the same in all three, the server's fourteen tools and no other, only codes the tool reference knows, the jar's files are the repository's, a skill that is there is not overwritten); the link check |
| Change what a snapshot or extract shows | `snapshot.ts`, `extract.ts`; `search.ts` for `find` in an extract, which runs patterns on an automaton of its own so that none can hang the page | Same | `test/snapshot.test.ts`, `test/extract.test.ts`, `test/search.test.ts`, `test/reading.test.ts` |
| Change click, hover, fill, keys, scroll, wait | `interact.ts`; all tools reach the page through `content.ts` | `interact.ts` | `test/interact.test.ts`, end to end |
| Change collecting over scrolls or pages | `collect.ts` (what of a further reading is new), `background.ts` `collect` (the loop and its limits), `content.ts` (`collect_read`, `collect_next`), `BrowserService.java` (the limits an agent may ask for) | Same. Every step is a page operation an agent has anyway, under the same checks; nothing is retried, and the result says why it stopped | `test/collect.test.ts`, `test/background.test.ts`, `BrowserServiceTest`, end to end (`demo-site/site-a/feed.html`, `results.html`) |
| Change text entry into rich-text or code editors | `editor.ts` (entry), `snapshot.ts` `editorSurface` (recognition) | `editor.ts` | `test/editor.test.ts`, `test/agnostic.test.ts`, then the editor lab in front **and** with `BACKGROUND=1`; update the table in `docs/editors.md` |
| Change submissions, or when the user is asked about them | `submit.ts` (signals, what a prompt shows of the content), `background.ts` (flow, asking), `policy.ts` (`checkKey`, `needsAsking`, `checkAsk`: what is a submission, and whether it is put to the user), `popup.ts` (the prompt), `BrowserService.java` (ids) | Same | `test/submit.test.ts`, `BrowserServiceTest`, end to end |
| Change sessions, pairing or the connection | `background.ts`, `pairing.ts`, `protocol.ts`; `WebSocketBridge.java`, `ExtensionConnection.java`, `Pairing.java`, `Protocol.java` | Both sides must agree; the protocol is described in [development.md](docs/development.md#protocol-reference). What a tool says when no browser is paired is in `BrowserService` `pairingHelp`; the server's window comes up when one came with another token (`Hub.unpaired`), which is why the end-to-end suite starts its servers with `--no-panel` | `PairingTest` and `pairing.test.ts` share a test vector; `WebSocketBridgeTest`, `test/protocol.test.ts`, end to end |
| Change what the toolbar badge says, or when a server counts as gone | `chrome-extension/src/policy.ts`: `badgeFor`, `serverGone` | `policy.ts`; `background.ts` calls them (`refreshBadge`, and the heartbeat in `connectPort`). What is shown has to say what is so now | `test/policy.test.ts`, `test/background.test.ts` (a fake server that hangs), end to end (its last step reads the badge) |
| Change the popup | `popup.html`, `popup.ts`, `popup.css`; `panels.ts` for which panels fold and what a folded one says | Same; requests go to `background.ts`. The server's panel repeats the popup's colours by hand (`panel.css`): a change to that look goes there too | End to end drives the real popup and reads the prompt's text; for its look, `node screenshots.mjs prompts` and your eyes; regenerate the documentation's pictures if they changed |
| Change the goblin: its icons, its sprites, an animation, or when the panel plays which | `art/goblin.ts` (the drawing), `art/mascot.ts` (writes the pictures: run `node art/mascot.ts`), `PanelModel.java` `mood` (which animation, from what the server knows), `Panel.java` `Mascot` (playing it), `notice.ts` `goblinParts` (the face in the page) | `art/goblin.ts` draws; nothing else does. The look and the rules are in [development.md](docs/development.md#the-goblin) | `test/mascot.test.ts` (the files are what the script draws), `test/notice.test.ts`, `PanelModelTest`, `PanelTest` (needs a display); then the panel's pictures, `HEADED=1 node screenshots.mjs` for the popup and the notice, and your eyes on `docs/images/mascot.png` |
| Change the notice in the page | `notice.ts` (what it shows at a moment, the drawing, and when what was taken out of the page is out of the picture: `whenDrawn`), `background.ts` `setNotice` (when a state or a line is sent), `policy.ts` `endedLine` (a line's words); `content.ts` holds it | Same; what goes to the page is a state and the activity list's fixed words, and the flow is in [architecture.md](docs/architecture.md#the-notice-in-the-page), how it is drawn in [development.md](docs/development.md#the-notice-in-the-page) | `test/notice.test.ts`, `test/background.test.ts` (what the page is told), end to end (it reads the closed box through the debugging interface); for its look, `node notice-pictures.mjs` in `e2e` and your eyes on every state; then `HEADED=1 node screenshots.mjs` for `indicator.png` |
| Change the server's panel (the window of `--panel`) | `PanelModel.java` (what it shows), `Panel.java` and `panel.css` (the window and its look), `McpMain.java` `showPanel` (what a command does), `WebSocketBridge.java` `setHeld` (the switch) | Same; the rules it must keep are in [security-model.md](docs/security-model.md#the-servers-panel), how it is built in [development.md](docs/development.md#the-servers-panel) | `PanelModelTest`, `PanelTest` (needs a display), `LogTest`, `WebSocketBridgeTest`; then the pictures and the real window by hand, on every system it is to work on (runbook: "Look at the server's panel") |
| Change how the one server and the agents' processes find, prove and leave each other | `Link.java` (the process an agent starts), `Hub.java` (the server), `Agent.java` (one agent inside it), `McpMain.java` (`main`, `startServer`, `showWindow`, `openWhereThePortsAre`), `Pairing.java` (the two proofs), `Ports.java` (the list of first ports for a machine whose system keeps ports back; `FIRST_PORTS` and `rangesToScan` in `policy.ts` have to say the same) | Same. What it has to keep is in [architecture.md](docs/architecture.md#processes-and-ports) and [how a server ends](docs/architecture.md#how-a-server-ends): nothing is sent twice, a stop is told apart from a loss, and no agent learns of another | `HubTest`, `PortsTest`, `test/policy.test.ts`, `mvn verify` (the conformance check starts the jar as an agent does), end to end (two agents through one server), and by hand with real processes: one server for two agents, an agent leaving, the server's process ended |
| Change MCP behaviour of the server (lifecycle, cancellation, tool metadata) | `McpMain.java`, `StdinTap.java` | [docs/mcp-conformance.md](docs/mcp-conformance.md) says which revision it is measured against and what is done by hand | `StdinTapTest`, `mvn verify` (runs `McpConformanceIT` on the built jar), end to end |
| Change build wiring or CI | `java-server/pom.xml`, `chrome-extension/build.mjs`, `.github/workflows/ci.yml` | Same | Run the job's commands locally (runbook: "Reproduce a CI job") |
| Change the download, setup, or how a release is made | `release/bundle.sh` (what a download holds), `release/tabgoblin` and `tabgoblin.cmd` (the command in it), `Setup.java` (what `--setup` does and says), `.github/workflows/release.yml` | Same. Setup runs no other program and writes nothing but the skill: an agent is told about the server by its own command, which the user runs. A release is the owner's, by a tag. What a user does with a download is in [installation.md](docs/installation.md#from-a-download); the workflow in [development.md](docs/development.md#releases) | `SetupTest`, `McpMainTest`; then make the download and use it, in a folder with a space in its name (runbook: "Make a release"). The workflow itself runs on GitHub only: start it by hand there, which publishes nothing |
| Edit documentation | `docs/`, root `README.md` | Each fact has one page and the others link to it; which page owns what is in [development.md](docs/development.md#documentation) | Check the links and that nothing personal got in; regenerate pictures only with their scripts (runbook: "Regenerate screenshots and examples", "Look at the server's panel") and open each one |
| Change the version | Runbook: "Change the version" | Seven files carry it | `grep` shows one version; all suites |
| Something slow or hanging | First `browser_status` with `diagnostics: true`: it says whether the time went to the agent, the server, the extension and the page, or the user (`Timings.java`). Then `ExtensionConnection.java` (deadlines), `background.ts` (settle, queues) | Same | `SHOW_STDERR=1 npm test` in `e2e` prints the servers' logs; `SHOW_TIMES=1` prints the timing report of that run |

For a task not listed: search `chrome-extension/src` and `java-server/src/main` for the tool's
action name (`click`, `fill`, `submit`, ...); it appears in `policy.ts` `ACTIONS`, in
`background.ts` `runCommand` and in `BrowserService.java`. The file map is in
[docs/architecture.md](docs/architecture.md#where-things-are), and the sequence of one command
through all parts is in the same page under "A command, end to end".

## Memory

Each fact has one home. Link to it; do not copy it.

| What | Where | Read |
|---|---|---|
| Startup path, constraints, task map | this file | every session |
| Active work, blockers, handoff | [docs/agents/state.md](docs/agents/state.md) | every session |
| Backlog and work packages | [TODO.md](TODO.md) | when picking up planned work |
| Commands and recovery | [docs/agents/runbook.md](docs/agents/runbook.md) | when you need to run something |
| Validation history | [docs/agents/validation-log.md](docs/agents/validation-log.md) | only when a past result matters |
| Product behaviour and decisions | `docs/*.md`; which page owns what is in [development.md](docs/development.md#documentation) | per the task map |

At the end of a session that changed something:

1. Update `state.md`: what changed, blockers, the next action. Date it. Remove what is resolved.
2. Add one entry to `validation-log.md`: revision, what passed, what failed, what was not run.
   When it passes about ten entries, fold the oldest into one summary line.
3. A lasting decision goes into the page that owns it (`security-model.md`, `architecture.md`,
   `development.md`), not into `state.md`.
4. Check each claim you changed against its source: a command against `package.json`, `pom.xml` or
   `ci.yml`; a path against the tree; a count against a run.
5. Check links with the command in the runbook ("Check the documentation links"), and the files
   with the one under "Check that nothing personal is in the files". There is no other freshness
   check and no changelog; git history is the record of changes.

There is no index or search tooling. Use repository search; add tooling only for a retrieval
problem that has actually occurred.
