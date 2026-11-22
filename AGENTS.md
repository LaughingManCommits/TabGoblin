# Agent guide

Read this file and [docs/agents/state.md](docs/agents/state.md) at the start of a session. Load
anything else only when the task map below sends you there.

## Purpose

TabGoblin lets AI agents on the user's machine read and operate the Chrome tabs the user
authorizes, without giving them cookies, tokens or the ability to run code. Two parts:

- `java-server/`: a local MCP server (Java 21, official MCP Java SDK, stdio). Entry point
  `McpMain.java`. It offers eleven generic `browser_*` tools and knows no website. There is one
  server process for all agents (`Hub.java`); the process an agent starts passes its messages
  on to it (`Link.java`).
- `chrome-extension/`: a Manifest V3 extension (TypeScript). `background.ts` holds sessions and
  enforces the rules; `content.ts` does the work in the page; the popup is the user's control.

They talk over a WebSocket on 127.0.0.1, paired with a token. Users are people who run an agent in
an IDE or CLI and want it to work in their logged-in browser. The picture and vocabulary are in
[docs/README.md](docs/README.md).

## Constraints

These decide what a change may look like. This is the short form; where a linked page says more
or says it differently, the linked page is right.

- **Security boundaries are fixed.** No cookies, headers, storage, tokens, raw HTTP, debugger,
  script evaluation or general HTTP requests, ever. Manifest permissions are exactly `activeTab`,
  `scripting`, `storage`, `alarms`; the end-to-end suite asserts it. Authorization is per exact
  origin and checked before every command. If a feature cannot be made safe, disable it; never
  loosen a rule. Owner: [docs/security.md](docs/security.md).
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
  change: update [docs/tools.md](docs/tools.md) and run the end-to-end suite.

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

- **Look first.** Search the owner file and `docs/tools.md` for the behaviour before adding it; it
  may exist and only lack a test.
- **If a tool's text output changes**, also update `docs/tools.md` and run the end-to-end suite
  (`e2e/run.mjs`, against the pages in `demo-site/`), whatever the row says. If it changes what
  an agent should do, say it in the three skills as well (`skills/`).
- Java sources are in `java-server/src/main/java/browsercontext/`, tests in the same path under
  `src/test`. Extension paths below are relative to `chrome-extension/`.

| Task | Start in | Owner of the behaviour | Check |
|---|---|---|---|
| Change what a tool accepts or returns | `BrowserService.java` (arguments), `McpMain.java` (definition, description) | The operation itself is in the extension, see next rows | `BrowserServiceTest`, then end to end; update `docs/tools.md` |
| Add a tool | [Adding a tool](docs/development.md#adding-a-tool) | `policy.ts`, `interact.ts`, `content.ts`, `background.ts`, `BrowserService.java`, `McpMain.java` | A test at each level: rule, DOM, routing, end to end (a step in `e2e/run.mjs`, a target in `demo-site/`). Then update `docs/tools.md`, the table in `docs/security.md` if a property is newly tested, the server instructions in `McpMain.java`, and the tool count ("eleven") here, in `README.md`, `docs/README.md` and `docs/tools.md` |
| Change what is allowed (access levels, origins, clicks, navigation) | `chrome-extension/src/policy.ts` | `policy.ts` only (`REQUIRED` maps each action to its level; `checkClick` limits what Explore may click; `checkKey` decides about Enter and Space, from what `describeKeyTarget` in `interact.ts` reports); `background.ts` calls it. The levels are described for users in [user-guide.md](docs/user-guide.md#access-levels) | `test/policy.test.ts`, `test/background.test.ts`, end to end; keep the user guide and the server instructions in `McpMain.java` in step |
| Change blocked sites: what an entry blocks, the settings file, what is said to whom | `BlockedSites.java` (the file, the rule), `chrome-extension/src/policy.ts` (`blockedBy`, `checkBlocked`) | The two rules must give the same answers: both are held to `java-server/src/test/resources/browsercontext/blocked-sites-cases.json`. `BrowserService.java` `refuseIfBlocked` refuses before anything is sent; `background.ts` `gate` refuses at the moment of a command; `WebSocketBridge.java` tells the extension the list (`policy`); `popup.ts` and `PanelModel.java` say it to the user. A list that cannot be read blocks everything. The rules are in [security.md](docs/security.md#blocked-sites) | `BlockedSitesTest`, `BrowserServiceTest`, `test/policy.test.ts`, `test/background.test.ts`, end to end; the window's pictures if what it says changed |
| Change what the skills tell an agent | `skills/claude-code`, `skills/codex`, `skills/copilot`: a `tabgoblin/SKILL.md` in each | Three texts, kept the same by hand from "Start with the status" on; above that each has its agent's own head. The tool reference owns what a tool takes and returns; a skill says what to do with it. Where each agent wants its skill is in [skills/README.md](skills/README.md) | `SkillsTest` (the same in all three, the server's eleven tools and no other, only codes the tool reference knows); the link check |
| Change what a snapshot or extract shows | `snapshot.ts`, `extract.ts` | Same | `test/snapshot.test.ts`, `test/extract.test.ts`, `test/reading.test.ts` |
| Change click, fill, keys, scroll, wait | `interact.ts`; all tools reach the page through `content.ts` | `interact.ts` | `test/interact.test.ts`, end to end |
| Change text entry into rich-text or code editors | `editor.ts` (entry), `snapshot.ts` `editorSurface` (recognition) | `editor.ts` | `test/editor.test.ts`, `test/agnostic.test.ts`, then the editor lab in front **and** with `BACKGROUND=1`; update the table in `docs/editors.md` |
| Change submissions, or when the user is asked about them | `submit.ts` (signals, what a prompt shows of the content), `background.ts` (flow, asking), `policy.ts` (`checkKey`, `needsAsking`, `checkAsk`: what is a submission, and whether it is put to the user), `popup.ts` (the prompt), `BrowserService.java` (ids) | Same | `test/submit.test.ts`, `BrowserServiceTest`, end to end |
| Change sessions, pairing or the connection | `background.ts`, `pairing.ts`, `protocol.ts`; `WebSocketBridge.java`, `ExtensionConnection.java`, `Pairing.java`, `Protocol.java` | Both sides must agree; the protocol is described in [development.md](docs/development.md#protocol-reference) | `PairingTest` and `pairing.test.ts` share a test vector; `WebSocketBridgeTest`, `test/protocol.test.ts`, end to end |
| Change what the toolbar badge says, or when a server counts as gone | `chrome-extension/src/policy.ts`: `badgeFor`, `serverGone` | `policy.ts`; `background.ts` calls them (`refreshBadge`, and the heartbeat in `connectPort`). What is shown has to say what is so now | `test/policy.test.ts`, `test/background.test.ts` (a fake server that hangs), end to end (its last step reads the badge) |
| Change the popup | `popup.html`, `popup.ts`, `popup.css`; `panels.ts` for which panels fold and what a folded one says | Same; requests go to `background.ts`. The server's panel repeats the popup's colours by hand (`panel.css`) and the goblin's shapes (`Panel.java`): a change to either look goes there too | End to end drives the real popup and reads the prompt's text; for its look, `node screenshots.mjs prompts` and your eyes; regenerate the documentation's pictures if they changed |
| Change the notice in the page | `notice.ts` (what it shows at a moment, the drawing, and when what was taken out of the page is out of the picture: `whenDrawn`), `background.ts` `setNotice` (when a state or a line is sent), `policy.ts` `endedLine` (a line's words); `content.ts` holds it | Same; what goes to the page is a state and the activity list's fixed words, and the flow is in [architecture.md](docs/architecture.md#the-notice-in-the-page) | `test/notice.test.ts`, `test/background.test.ts` (what the page is told), end to end (it reads the closed box through the debugging interface); for its look, `node notice-pictures.mjs` in `e2e` and your eyes on every state; then `HEADED=1 node screenshots.mjs` for `indicator.png` |
| Change the server's panel (the window of `--panel`) | `PanelModel.java` (what it shows), `Panel.java` and `panel.css` (the window and its look), `McpMain.java` `showPanel` (what a command does), `WebSocketBridge.java` `setHeld` (the switch) | Same; the rules it must keep are in [security.md](docs/security.md#the-servers-panel), how it is built in [architecture.md](docs/architecture.md#the-servers-panel) | `PanelModelTest`, `PanelTest` (needs a display), `LogTest`, `WebSocketBridgeTest`; then the pictures and the real window by hand, on every system it is to work on (runbook: "Look at the server's panel") |
| Change how the one server and the agents' processes find, prove and leave each other | `Link.java` (the process an agent starts), `Hub.java` (the server), `Agent.java` (one agent inside it), `McpMain.java` (`main`, `startServer`, `showWindow`), `Pairing.java` (the two proofs) | Same. What it has to keep is in [architecture.md](docs/architecture.md#processes-and-ports) and [how a server ends](docs/architecture.md#how-a-server-ends): nothing is sent twice, a stop is told apart from a loss, and no agent learns of another | `HubTest`, `mvn verify` (the conformance check starts the jar as an agent does), end to end (two agents through one server), and by hand with real processes: one server for two agents, an agent leaving, the server's process ended |
| Change MCP behaviour of the server (lifecycle, cancellation, tool metadata) | `McpMain.java`, `StdinTap.java` | [docs/mcp-conformance.md](docs/mcp-conformance.md) says which revision it is measured against and what is done by hand | `StdinTapTest`, `mvn verify` (runs `McpConformanceIT` on the built jar), end to end |
| Change build wiring or CI | `java-server/pom.xml`, `chrome-extension/build.mjs`, `.github/workflows/ci.yml` | Same | Run the job's commands locally (runbook: "Reproduce a CI job") |
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
3. A lasting decision goes into the page that owns it (`security.md`, `architecture.md`,
   `development.md`), not into `state.md`.
4. Check each claim you changed against its source: a command against `package.json`, `pom.xml` or
   `ci.yml`; a path against the tree; a count against a run.
5. Check links with the command in the runbook ("Check the documentation links"), and the files
   with the one under "Check that nothing personal is in the files". There is no other freshness
   check and no changelog; git history is the record of changes.

There is no index or search tooling. Use repository search; add tooling only for a retrieval
problem that has actually occurred.
