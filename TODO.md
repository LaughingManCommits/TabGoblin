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
merge"); built the same day on branch `one-port`, from `main` at `0d54694`. Open until the owner
has merged it and the acceptance by hand below has been done.

**Why.** Each agent had a WebSocket port of its own to the extension, eight for a server, and
the agents' processes reached the server on the ninth. That was from before there was one server
for all agents. Everything intricate about ports followed from it: the fallback ranges of eight,
the extension looking at 24 ports, the limit of eight agents, a command-line agent holding a port
for ten minutes, the `servers` folder with what a server writes of itself, and the question which
server the browser is at. With one port, one server for a machine is what the operating system
enforces: a second process finds the port taken and joins.

**What it is.** The server listens on one port (default 47821, then 37821, then 27821 where the
system keeps one back; `--port` and the popup's *Port* name one port). The extension opens one
WebSocket to it and pairs once; the agents travel inside that connection, each named by its id
(`agents` from the server, `agent` on every command and event, `agents_refused` from the
extension for those the user disconnected). The agents' processes reach the server over the same
port, as WebSocket connections on the path `/link`, one message a frame. Protocol version 1,
counted anew from this release; a peer of the release before (which said 3) is refused with the
word to update both. The status says the server's port and no port of the agent's; the window
and the popup list agents without ports. Described in
[architecture.md](docs/architecture.md#processes-and-ports) and the
[protocol reference](docs/development.md#protocol-reference).

**Acceptance.** The three suites and the end-to-end suite pass (done, see the validation log);
the suite has two agents through one server, a command-line agent beside an MCP agent, an agent
leaving, the server ending after its last agent, a chosen port set in both places, and a server
of another protocol version refused. Seen with real processes: a program that holds the usual
port makes each agent's process serve its agent alone and say why (taken, not kept back: a held
port is never stepped over, only one the system keeps back is, `Ports.usable`), and the processes
end in order. The window's and the popup's pictures are drawn anew and looked at. Not yet done:
Kill and Stop in the window on Windows, and a port the system keeps back with the fallback
taken, which only a Windows machine with such a range shows.

## Small faults, found and not mended

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
  `BrowserService.java`).

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
- **Reserved ports (WP-28):** never run on a machine whose system keeps the port back; the
  fallback to 37821 and 27821 is held by tests with a stand-in for the system.
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
  - WP-28: which ports (47821, 37821, 27821), and that the next is tried only when the system
    keeps the one before back; a port another program holds is not stepped over.
  - `OFF` on the toolbar badge when no agent is there to act.
  - The popup's setting is called "Indicator in the page" where the documentation says notice.
- **Not built:** a build without the MCP SDK; progress while a command waits; a skill installed
  into one project; a second, machine-wide settings file that the user's own cannot loosen.
