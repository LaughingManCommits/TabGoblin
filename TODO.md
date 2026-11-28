# TODO

What is still open, and nothing else. Cleared on 2026-11-27: what was done, decided or overtaken
was taken out. The full entries of every work package, WP-1 to WP-32, are in git history
(`git log -p -- TODO.md`); lasting decisions are in the pages that own them (`security-model.md`,
`architecture.md`, `development.md`). Numbers are not reused; new work gets the next one, WP-34.

## Not started

### WP-12: A goblin that acts out what the agent does

Filed 2026-11-21. The goblin's face is in the notice's bar and shows the state (works, asks,
paused), and the panel's sprites play a mood for what the server knows (`PanelModel.mood`). What
is not there: the goblin acting out each action in the page (looking down for a scroll, pointing
at a click, writing for a fill). Decisions for the owner:

1. Where it is: in the notice's bar (proposal), or beside the element that is acted on, which
   needs its position, must not cover what the user reads, and shows a page script where the
   agent acts.
2. A switch of its own under *Settings* (proposal), or the notice's switch for both.
3. How much drawing: the face alone, acting by its eyes and ears, or a body with arms in parts
   that move.

### WP-16: A page that shows how TabGoblin differs from other tools

Filed 2026-11-22. No other tool has been read up or tried. Decisions for the owner: which products
and how many; by name (proposal) or by way of working; read only, or the nearest two or three
also tried on the demo sites; Mermaid or drawn pictures; how much goes into the README; and how
the page is kept true (proposal: it carries the date it was last read, and is read again before
a release).

### WP-24: A performance test between the extension and the server

Filed and decided 2026-11-23; the owner said not to start yet. A script beside the end-to-end
suite that runs every tool many times on pages of growing size and writes down the times (by
`Timings`' split), the bytes, memory and starts; then a reading of the three slowest things
before any code is changed. Run by hand on one machine; what is fast enough is named after the
first numbers.

### WP-25: Release notes that say what changed

Filed 2026-11-23, to come with a release. The release workflow already adds GitHub's list of
pull requests merged since the release before (`--generate-notes`, from `release/notes.md`).
What is not there is a changelog in the user's words. Decisions for the owner: one file with a
section per version (proposal) or none in the repository; written with each package as it is
merged (proposal) or once at the version change; whether a release without it is refused
(proposal: yes); what a section holds. The first such notes must say that every name became
`tabgoblin` (WP-32): a setup from before has to be run again, and `~/.tabgoblin` is a new folder.

### WP-26: Access that ends by itself when it is not used

Filed 2026-11-23. A line of the security policy can already set it, off by default (WP-27). What
is open is whether it becomes a default, and its six decisions: what idle means (proposal: no
command in the session); how long, and whether on from the start (proposal: on, one hour,
*never* to choose); ended or paused (proposal: ended, as a revoke); one setting for all
(proposal) or a choice at each authorization; a word before it ends, or none; and what the agent
is told (proposal: the code for an expired authorization).

### WP-33: One port for the server, one connection for the browser

Filed 2026-11-28, on the owner's word ("go, one port, drop the servers folder, new branch after
merge"). Decided: one port for everything; the `servers` folder goes; built on a branch from
`main` after pull request 15 is merged.

**Why.** Each agent has a WebSocket port of its own to the extension, eight for a server, and the
agents' processes reach the server on the ninth. That is from before there was one server for all
agents. Everything intricate about ports follows from it: the fallback ranges of eight, the
extension looking at 24 ports, the limit of eight agents, a command-line agent holding a port for
ten minutes, the `servers` folder with what a server writes of itself, and the question which
server the browser is at. With one port, one server for a machine is what the operating system
enforces: a second process finds the port taken and joins.

**What it is.**

1. The server listens on one port (default 47821, then 37821, then 27821 where the system keeps
   one back; `--port` and the popup's *First port* name one port). The extension opens one
   WebSocket to it and pairs once, with the proofs as they are. The agents' processes reach the
   server over the same port, as WebSocket connections on the path `/link`, carrying the link's
   messages (`hello`, `attach`, `attached`, `refused`, the MCP stream or the command line's
   three) as text frames, one message a frame; the Java library has the client side
   (`org.java_websocket.client.WebSocketClient`). The extension's path is `/`, and its `Origin`
   is checked as now; a connection on `/link` carries no origin.
2. The agents travel inside the one connection. The server tells the extension its agents
   (`agents`: id, name, whether it has a key) when it pairs and when one comes or goes; every
   command carries the agent's id; every event and answer the agent it is for. The extension
   keeps per agent what it keeps now (sessions by id, the rate limit, the ids seen); what is the
   server's (blocked sites, the policy) is kept once. The server is proven once by the token; the
   agents' ids are what the server says of agents it has proven by their keys, as the extension
   already took them from `auth_ok`.
3. An agent the user disconnected is refused by the extension by its id (`canUse`, as now), and
   the server is told (`agent_refused`), so that agent's tools say what they say now
   (`CLOSE_USER_DISCONNECTED` becomes a per-agent state, not a close code).
4. Protocol version 4; a peer of 3 is refused, with the message that both have to be of one
   release.
5. The status says the server's port (`Listening on: ws://127.0.0.1:47821`) and no port of the
   agent's; the `Ports:` note names one port where a fallback was taken; the window and the
   popup list agents without ports.

**What goes.** `RunningServers`, `Ports`, `Fit`, `Elsewhere`, `setup_port`, `settings` and
`origin` in the link's `attach`, `cameFrom`, `serveAlone`, the per-agent `WebSocketBridge`
(one bridge for the server), `Agent.open`'s hunt for a free port, `PORT_RANGE`, `FIRST_PORTS`,
`rangesToScan`, `PORTS_OF_A_SERVER`, the scan in `background.ts`, the eight-agent limit, the
ten-minute hold of a command-line agent's port (`commandIdle` stays for the agent, not a port),
the popup's `:port` beside an agent, the window's port rows, and the architecture page's
"Processes and ports" from the ranges on.

**What stays.** The fallback list, as three single ports (the extension looks at each while no
server is connected). A user-chosen port set in two places; when they differ the status says so
plainly ("the browser is not connected to this server; the popup's First port has to be X").
Pairing, the proofs, the token, the agents' keys, the lockout, the rate limits, the policy
message, the heartbeat and `serverGone`, the panel, the switch in the window.

**Where.** Server: `WebSocketBridge` (one per hub, path routing, agent ids on messages),
`ExtensionConnection` (per agent view over the one connection), `Agent` (no bridge of its own),
`Hub` and `Link` (WebSocket frames in place of lines; `Hub` no longer a `ServerSocket`),
`McpMain` (`openWhereThePortsAre` for one port), `PanelModel`, `BrowserService` (status lines,
`Unpaired` simplified: the browser is at this server or not), `Protocol`. Extension:
`background.ts` (`connectPort` becomes `connect`, `clients` becomes one server with agents,
`onCommand` by agent id), `protocol.ts`, `policy.ts` (ports out), `popup.ts`. Tests: the
extension's `background.test.ts` (the fake server speaks the new frames), `policy.test.ts`,
`protocol.test.ts`; the server's `WebSocketBridgeTest`, `HubTest`, `AgentPortsTest` (goes),
`PortsTest` (goes), `RunningServersTest` (goes), `McpMainTest`, `PanelModelTest`; the end-to-end
suite's assertions on ports (`on port`, `wsPort + 8`, `freeRange`, "a port of its own") and the
window's section. Docs: `architecture.md` (processes and ports, the connection), `development.md`
(protocol reference, version 4), `tool-reference.md` (the status), `security-model.md` (agent
identity: what the extension takes from the server), `installation.md` (troubleshooting row on
ports), `developer-guide.md` (settings), the six skills if a status line they quote changes.

**Acceptance.** The three suites and the end-to-end suite pass; by hand with real processes: two
agents through one server over one port, a command-line agent beside an MCP agent, an agent
leaving, the server ending after its last agent, Kill and Stop in the window, a user-chosen port
set in both places, the default port kept back (simulated by a program holding it) and the
fallback taken, and the extension of this release refusing a server of the one before.

**Risks.** The biggest change to the protocol since version 3; extension and server must be
updated together (as already required). The link over WebSocket frames instead of lines touches
`Link`'s reconnection and the command line's three messages. The eight-agent limit's removal
changes what the window shows with many agents. Two to three sessions.

## Small faults, found and not mended

- `Ports.note` says the ranges are `47821-47829` and `37821-37829`; each range is eight ports
  (`PORT_RANGE`), so they end at …28. `docs/tool-reference.md` quotes the text: mend both.
- The server's window says every agent is turned away while the settings file cannot be read;
  in fact agents are let in and every site is refused (`PanelModel.Blocked`).
- Every command's process logs the blocked sites and the policy on its standard error
  (`Cli.java` reads the file through `BlockedSites.source`).
- The popup says *Disconnected: is the MCP server running?* to an agent of either interface
  (`popup.ts`).
- Three texts in code still say MCP first: the server's `--help` ("TabGoblin MCP server"), the
  first line of `tabgoblin tools`, and a command's `--help`. `McpMainTest` holds the first word
  for word.
- `release/bundle.sh` does not look at an `app.classpath` line of `TabGoblin.cfg`.
- The download's documentation links to pages it does not hold (`docs/agents/`, `TODO.md`,
  `art/`).
- Read from the source in November and not rechecked since: a tool call right after the
  connection was switched off in the window may wait ten seconds (`awaitExtension` in
  `BrowserService.java`); a server that cannot take its first port prints the socket library's
  stack trace to the agent's log before it takes the next.

## Not tried

- **Downloads.** Nobody has used a published release download. The macOS download has never
  been used. The Windows download with the JavaFX native files in the runtime (#12) has not been
  made on Windows nor scanned: delete `%USERPROFILE%\.openjfx`, open `TabGoblin.exe`, check that
  the folder does not come back, scan. The fresh-machine walk (a person with Chrome and an agent,
  following the installation page to a connected status, steps and minutes counted) has not been
  done.
- **The release workflow** has not run on GitHub; whether `main` refuses its push is not known.
  First a run of *Release* on `main` with *publish* off, then with it on.
- **Linux:** a server started in a terminal with `--panel` ended when the terminal was closed,
  in one try. The panel's title is not bold and its frame shows the system's icon. A program in
  a folder shows no icon.
- **macOS and other Linux desktops:** the panel never looked at; the copy button's clipboard
  never tried.
- **Codex and Copilot:** their setup lines never run; none of the six skills loaded in its agent;
  how the server is added to them could not be read from their documentation.
- **The command line on Windows and macOS** beyond reading and Explore: Write, `submit`,
  `tabgoblin.cmd`, quoting JSON (`--args-file` and `--args -` are there for it).
- **Reserved ports (WP-28):** never run on a machine whose system keeps the ports back.
- A screenshot of a tab whose window is covered or minimized.
- The SBOM and the dependency scan in the workflows were read, not run.
- The Mermaid diagrams on GitHub's own renderer.

## For the owner

- **Not signed.** No download is code-signed; Windows and macOS may warn, and macOS refuses an
  unsigned program. Signing takes certificates that cost money every year.
- **The history (WP-14).** Commits carry the name and address of the owner's git settings, and
  older messages carry session links. Taking them out means rewriting history and a force push
  (proposal: before wider publicity, if at all). Also: whether `LICENSE` keeps the holder's name;
  whether the personal-information check reads commit messages; whether `TODO.md` and
  `docs/agents` stay public.
- **The repository's settings on GitHub:** no branch protection or ruleset on `main`;
  Dependabot and private vulnerability reporting off.
- **The panel's tests in CI** need a display; a virtual one on the Linux runner was not tried.
  The cost of JavaFX (about 10 MB in the jar, its warning lines on standard error) stands unless
  the owner says otherwise.
- **Choices a session made, to keep or change:**
  - A command line agent is kept ten minutes without a command (`TABGOBLIN_COMMAND_IDLE_SECONDS`).
  - A command under a key that an MCP agent holds is refused (`AGENT_IN_USE`), not let into that
    agent.
  - Setup writes nothing but the skill, so the agent is told the command's path by the user.
  - WP-27: the strict profile's values (eight hours, thirty minutes); redaction cannot be
    switched off; a frame under 8 pixels a side does not hold a picture back; search runs on an
    automaton of its own, with a subset of the syntax.
  - WP-28: which first ports, and that the others are tried only when the first range has
    nobody.
  - `OFF` on the toolbar badge when no agent is there to act.
  - The popup's setting is called "Indicator in the page" where the documentation says notice.
- **Not built:** a build without the MCP SDK; progress while a command waits; a skill installed
  into one project; a second, machine-wide settings file that the user's own cannot loosen.
