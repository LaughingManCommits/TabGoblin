# Current state and handoff

Last updated: 2026-11-24. Claims here go stale; check the date, then `git status` and `git log`.

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
  new names (`docs/security-model.md`, `docs/developer-guide.md`, `docs/mcp-reference.md`),
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
- A branch `svg-pictures` was made, pushed and deleted by the owner on 2026-11-23 (WP-23, see
  the backlog's overview). Nothing of it is in `main`.

## Active work

| Item | Status | Authoritative source |
|---|---|---|
| WP-28, ports that the system keeps back | Filed on 2026-11-24, not started. The message is mended and merged; a way around a reserved range is proposed, and four decisions wait for the owner | [TODO.md](../../TODO.md) |
| WP-27, security hardening and features for developers | Built on 2026-11-24 for all eleven of its backlog items, and waits for the owner's review. Pushed to its branch on the owner's word; not merged, and not to be merged to `main` by a session. An agent is known by a key of its own (`--agent`), and no tab passes by a name; a security policy in the settings file, with a strict profile; every step that touches the page checked again; an approval bound to the content shown; redaction; no picture with a frame of another site in view; protocol version 3; search and regions in `browser_extract`; waiting for a change; three new tools, `browser_collect`, `browser_hover` and `browser_request_access`, which makes fourteen; workspaces; a record on disk; SBOM and a dependency scan in the workflows. Seven decisions the session took are listed for the owner. Left: what its entry lists under "Left, and why", none of it started work | [TODO.md](../../TODO.md) |
| WP-13, a panel for the server | Merged. Seen on Windows and on Linux in the Linux subsystem of Windows; five points are open for the owner | [TODO.md](../../TODO.md) |
| WP-18, aftercare of the panel, and the documentation gone over | Its first part, the pass over the documentation, is merged. Its third part, what the owner asked for after that, is merged, but for its last items, which are committed on `by-hand-panel` and wait for the owner's push and merge: what a server started by hand says of itself, a disconnected agent's server left alone, the panel's Metrics and its log of every call, and the READMEs' picture. Its second part lists what the panel left behind that needs no decision; none of it is started | [TODO.md](../../TODO.md) |
| WP-14, nothing personal in the repository | The files and the check are merged. What remains is the owner's: the address of commits from now on, the history, and four decisions | [TODO.md](../../TODO.md) |
| WP-15, an easy install | Merged on 2026-11-23. Built that day on the owner's word. A download for each system with the Java runtime, the jar and the extension in one folder; `--setup <agent>`, which installs the skill and prints the agent's own line for the server, the extension's folder and how to pair; and a workflow that makes a release when a version tag is pushed. The owner decided the same day that there will be no Chrome Web Store, ever. Release 0.2.0, the first, was published by the owner's tag on 2026-11-23; nobody has used one of its downloads yet | [TODO.md](../../TODO.md) |
| WP-24, a performance test between the extension and the server | Filed on 2026-11-23 on the owner's word, and not to be started yet. A script beside the suite that runs every tool many times on pages of known sizes and writes down times, where they went, bytes, memory and starts; then a reading of the three slowest things before any code is changed. Decided by the owner the same day: single calls on pages of growing size first; the script counts the bytes; by hand on one machine; what is fast enough is named after the first numbers. It waits for the owner's word to start | [TODO.md](../../TODO.md) |
| WP-25, release notes that say what changed | Filed on 2026-11-23 on the owner's word, to come with the next release and not before. A changelog for users, a section for each version, which the release puts at the top of its notes and without which it does not publish; today the notes are the same for every release but for the version. Five decisions wait for the owner | [TODO.md](../../TODO.md) |
| WP-26, access that ends by itself when it is not used | Filed on 2026-11-23 on the owner's word ("we should have auto revoke of access after idle"), not started. Today an authorization lasts until revoked, or one or eight hours from when it was given, whether it is used or not; nothing records when a session was last used. Six decisions wait for the owner, the first being what idle means | [TODO.md](../../TODO.md) |
| WP-12, a goblin that acts out what the agent does | Filed on 2026-11-21, not started. It waits for the owner's decisions. It has its place now: the goblin's face is in the notice and shows the state, not yet the action | [TODO.md](../../TODO.md) |
| WP-16, a page that shows how TabGoblin differs from other tools | Filed on 2026-11-22, not started. No other tool has been read up or tried yet; the products it names are from memory. Waits for the owner's decisions | [TODO.md](../../TODO.md) |
| WP-19, one server, and every agent connected to it | Merged on 2026-11-22. Built on the owner's word ("okay do your recommendations"). The server is a process of its own that an agent's process starts; every agent's process passes its messages on to it. What was built, and how it differs from the proposal, is in its entry |
| WP-22, skills for agents that use TabGoblin | Merged. Built on 2026-11-22 on the owner's word. Three skills, as the owner chose, the same from their second section on; where each agent wants its skill is in `skills/README.md`. None has been loaded in its agent yet | [TODO.md](../../TODO.md) |
| WP-21, what the first test on the public repository showed | Merged. Built on 2026-11-22 on the owner's word ("do the fixes please"). The notice is out of the picture before a screenshot is taken, also on a busy page; the window's metrics have a typical time per call beside each share, and a long pause counts as a minute; a log that is held says so and has a button to its newest line. What is open is in its entry | [TODO.md](../../TODO.md) |
| WP-20, blocked sites | Merged on 2026-11-22. Built on the owner's word. A line `blocked.sites` in `tabgoblin.properties` beside the pairing token; a domain blocks itself and its subdomains; the server refuses with `SITE_BLOCKED` before anything is sent, the extension refuses too, the popup offers no authorization there, and the server's window names what is blocked and opens the file with **Edit**. A file that cannot be read refuses every site. What building it showed is in its entry; **Edit** goes beyond what was first decided, and the owner kept it | [TODO.md](../../TODO.md) |
| WP-17, a new token at every start, and nothing connected on an old one | Built on 2026-11-23 and cut back the same day, on the owner's word ("lets only have the parts that are usefull and remove the rest"); both merged. The token is made once and kept, as before. What stays: the agent is told what is missing and where the token is; the server's window comes up by itself when the browser came with a token that is not the server's, with the step and a button at its top; the popup says what to do | [TODO.md](../../TODO.md) |

## Blockers and unknowns

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
  own list there, and the owner's own list is `tabgoblin.properties` in `.browser-context-mcp`
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
  documentation says notice, and the code says indicator (`bcmcp-indicator`, `indicator.png`,
  the `indicator` setting). The setting's line in the popup, "Shows the agent at work. Has a
  pause button.", is still true and says less than the notice does. Not changed: it is wording
  for the owner, and a change to it changes two of the popup's pictures.
- **A session that is only paused has no notice any more**, and "Agent idle" is what the bar
  says between two commands. Both are choices made while building, not asked for; see WP-11 in
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
