# Validation log

Newest first. One entry per session that verified something. Not part of the startup read.
When this passes about ten entries, fold the oldest into one summary line.

## 2026-11-22, on `one-server`: WP-19, one server for all agents, and a click on a tab

The owner, after a server started by hand had been taken five times for the server the agent
uses: "only one instance of the server may be started", with several agents connected to it and
each with its own tabs; and for its window: a click on a session shows that session's metrics
and log, and no click shows all. Then: "okay do your recommendations". Built in two steps.

**The click, in the window as it was.** Every tab is in the list, three show at a time and the
list scrolls; a click on a tab shows that tab's metrics and log lines, a second click or Escape
shows all. The extension says in each answer in which session a command ran, since a command
may name none. Run in a copy of the tree with a jar built there: the server's 96 tests and the
8 of the conformance check, the extension's 156, end to end 94 of 94. Pressed in a real window
through the accessibility interface, with the suite's Chrome, two tabs and seven real calls:
each tab chosen shows its own calls and its own lines, and the same tab again shows all.

**The one server.** The process an agent's program starts is a pipe to the server, which it
starts as a process of its own if none runs. All of the following on the final sources, in a
copy of the tree with a jar built there.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify` | 109 tests, 17 of them new since `by-hand-panel`, and the 8 of the conformance check on the built jar, which now goes through the pipe and the server it starts; none skipped, none failed. No server was left running six seconds after it |
| `cd chrome-extension && npm run check` | type-check clean, 156 tests, build |
| `cd e2e && npm test` | 94 passed, 0 failed, with the suite's two agents through one server. Two checks are new in it: the server listens for agents on the port after theirs and neither process serves alone, and nothing listens there once the last agent has gone |
| `node docs/agents/check-links.mjs`, `node docs/agents/check-personal.mjs` | all links resolve; nothing personal found |

The suite passed 94 of 94 before its two new checks as well, unchanged: an agent's own log, its
port and its restart are to the suite as they were.

Found by the first run with real processes, and by no test before it: six servers that the
conformance check had started were still running forty minutes later. That check ends each
process at once, and the server took a broken connection for none at all, so that it never
counted its agent as gone. It takes it for the agent's going now. The test for it fails against
the code as it was; after the fix no server was left behind.

The picture tool drew thirteen states. Opened and looked at: a tab clicked, the second tab
clicked, nine tabs, the low screen, no agent, two agents, and an agent clicked. Three things
were mended by looking: the list of tabs did not stay at three rows with nine tabs; an agent's
name was cut short when its row was marked; and the line that said what is chosen pushed the
cards below it down at every click, so it stands in the corner of the card now.

By hand, with real processes on Windows and Java 21, read and pressed through the
accessibility interface:

- Two agents' processes started as agents' programs start them: one server process (`javaw`)
  and two pipes; the first agent opened in 666 ms, which includes the server's start, the
  second in 198 ms. Ports listened on: one for each agent, and the server's own. The first
  agent left: its process ended with code 0 after 9 ms and its output closed for the program
  that had started it; the second went on working. After the last one the server was gone and
  nothing listened.
- The jar run in a console of its own with `--panel`, on ports apart from the owner's: the
  command returned, one server ran that stays without an agent, and its window said that no
  agent is connected. An agent's process started then showed in that
  window by its name, 441 ms after its start. **Stop server**, pressed twice: the agent's
  process ended with code 0 and the line that the user had stopped the server in its log, the
  server was gone, and nothing started it anew.
- Two agents with the suite's Chrome, each with a tab of its own and real calls, one window:
  both agents with their headings, ids and ports; an agent clicked shows its five calls and its
  seven lines and none of the other's; a tab of the other agent clicked shows its two; clicked
  again, everything.

On the owner's word that "typed by hand" is confusing, and to be critical of what the user
reads, the words of the window, the terminal and the help text were gone over afterwards: the
help text is in two parts, what you run and what your agent runs; the window said that no
agent is connected twice, and "no tabs" twice in one card, and says each once now. The three
suites were run once more on that, with the same counts, and the pictures drawn and the changed
ones looked at.

Not tried: Linux and macOS, where the server is started as a process of its own in another
way; an IDE's program that ends every process below it when it closes, which would end the
server with it and leave the taking over to the other agents; Kill in the real window with
agents connected, and the taking over with real processes, which the tests do with a server
that is dropped inside one Java process; the jar run in a terminal while a server already runs,
which the tests do; a process that has to serve its agent alone because another program holds
the server's port, of which the tests cover that it is found out and not the serving; the
owner's own Chrome and Claude Code with this build, which needs both parts built in the tree.
Not run: the editor lab; CI, which has no credit.

## 2026-11-22, on `by-hand-panel`: what a server started by hand says, a disconnected agent's server left alone, and a panel that shows what the agent did

The owner asked for a walk through GitHub with the tools, and then for the fixes of what it
showed. A server started by hand with its panel stood beside the session's own server, which
had no window: the owner authorized a tab for the first, which no agent can use, and watched
its panel for the agent's sessions, times and calls. That panel's log filled with a pairing
and a close every few seconds, after its agent had been disconnected in the popup. Asked for
on the way: the card of the times is to be called Metrics, and the log is to show what the
agent did.

The walk itself, on a tab of `github.com`, some seventy tool calls through the session's own
server, first with the owner's extension as built at 10:03 and then with the one built at
15:47. With Read: outline, sections, scrolling, a wait, two screenshots; a fill, a navigation,
the Tab key and a link refused with the level each needs. With Explore: links followed, pages
read, the Actions page and the list of commits, the way back, a folder opened in the file
tree; another site refused, buttons refused, one screenshot refused while another tab was in
front. No fault of the tools was found. A file in GitHub's file tree could not be opened by a
click with Explore: it is a tree item and no link, so it counts as a control; its address
opens it.

All of the following on the final sources, in a copy of the tree with a jar built there.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify` | 92 tests, 3 of them new, and the 8 of the conformance check on the built jar; none skipped, none failed |
| `cd chrome-extension && npm run check` | type-check clean, 156 tests, 1 of them new, build |
| `cd e2e && npm test` | 94 passed, 0 failed. The step that disconnects an agent now reads the server's log: one disconnect, and no pairing after it, across the next looks at the ports |
| `node docs/agents/check-links.mjs`, `node docs/agents/check-personal.mjs` | all links resolve; nothing personal found |

The new worker test fails against the worker as it was: a proof went to the disconnected
agent's server again. The picture tool drew ten states. Opened and looked at: the first, which
is the documentation's picture and was taken into `docs/images` with the card's new name, and
the two of a server started by hand, without a tab and with one of its own beside one that is
open to any agent.

By hand, in the real windows on Windows with Java 21, read through the accessibility interface:

- A server started in a console of its own from a jar built in a copy, not connected to a
  browser: the box under the status line, the words of both cards, and the box, the cards'
  words, Copy, Stop, Kill and the version line all inside the window (444 by 804).
- The owner's own server started by hand from the jar the owner built at 15:47, connected: the
  box, *1 tab* for a tab the owner had authorized for any agent, and under it the line that no
  agent can use it. That line was wrong: the session used the tab a moment later, and the
  window then said *No tab is authorized for this server*. Mended after that: the line speaks
  of the server's own tabs, and an open tab is marked *any agent*. The mended form was drawn
  and tested, not seen in a real window.
- The session's own server, after the owner's Reconnect in Claude Code at 15:59, from the same
  jar and with `--panel`: its window named `claude-code`, the tab, the four shares over the
  last six calls, and a log with the start, the connection and the one call that was refused.
  The calls that went through were not in it, which is what the owner had missed; they are
  kept now, tested, and not seen in a real window, which needs the jar built again.
- That Reconnect was the first restart of a real agent's server: the new server, with another
  id, had the tab at once, by the name `claude-code`.

Not tried: an older extension against this server and the other way round, which are as before
by the source and by one half of the worker test; the owner's extension with a disconnected
agent, by hand. Not seen on GitHub: the picture in the two READMEs with its wider edge, which
needs a push. Not run: the editor lab; Linux and macOS; CI, which has no credit.

## 2026-11-22, on `restart-keeps-tabs`: a server that is started again has its tabs at once

The owner: a server stopped with a session and started again did not show the session in its
panel, while the popup showed it as connected. The cause is in two places. A server makes a new
id at each start, and its tabs come back to it by its agent's name alone; it learned that name
only with the agent's first tool call, and a server started by hand never had one. And the
extension handed a tab over only with the first command that used it.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify`, in a copy of the tree | 89 tests, one of them new; `McpConformanceIT` on the built jar: 8 tests |
| `npm run check` in `chrome-extension`, in the copy | type-check clean, 155 tests, one of them new, build |
| the new worker test against `background.ts` as it was | fails: the popup says of the restarted agent's tab that its agent is not connected |
| `cd e2e && npm test`, in the copy, on the final sources | 94 passed, 0 failed. The step for a restarted server now waits, before the agent calls any tool, until the popup names the agent as the tab's and the badge says `ON` |
| `node docs/agents/check-links.mjs` | 148 links, all resolve |
| `node docs/agents/check-personal.mjs` | nothing personal found |

By hand, the owner's case, with the real extension in Chrome as the suite drives it and the real
panel read and pressed through the accessibility interface: a server started in a console of
its own with `--panel`, a tab authorized for it, Stop pressed twice in the panel, the server
started again the same way.

- Before the stop: the popup lists the agent and the tab's agent as *Started by hand*, the
  badge says `ON`, the panel says `1 tab` and lists it.
- After the stop: the popup says *Disconnected* and marks the tab's agent as not connected;
  the badge says `OFF`.
- After the start, with Java 21 after 3.7 seconds and with Java 26 after 3.0: the popup says
  *1 agent connected* and names *Started by hand* as the tab's agent; the badge says `ON`; the
  panel of the new server, which has another id, says `1 tab` and lists it.
- A run before the hand-over was added showed the tab under the old server's id in the popup,
  though the new server could use it. That is why the extension now makes the tab the new
  server's own the moment it is back.

Not tried: a real IDE's agent that starts its server again (the suite's client stands in for
it); two agents of the same name, of which one is started again; Linux and macOS. Not run: the
editor lab; CI, which has no credit.

## 2026-11-22, on `aftercare`: commands at hand, the pairing token copied, a panel that keeps its controls, an extension that shows what is so

Four things the owner asked for after the documentation pass was merged, and one fault found on
the way. The jar and the suites that need it were run in a copy of the tree: a build of the jar
in the tree by the session was refused by its safety rules, and the jar there is still the one
of 2026-11-21.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify`, in the copy | 88 tests; `McpConformanceIT` on the built jar: 8 tests |
| `mvn -B -f java-server/pom.xml test`, in the tree | 88 tests |
| `npm run check` in `chrome-extension`, in the copy | type-check clean, 154 tests, build. The first try stopped at the type-check: a new test did not pass it, though it ran |
| the new worker test against `background.ts` as it was | fails: "timed out waiting for the silent server to be taken for gone" |
| `cd e2e && npm test`, in the copy | 94 passed, 0 failed. Its last step is longer: with both servers ended the badge goes from `ON` to `OFF` and the popup says *Disconnected* |
| `node docs/agents/check-links.mjs` | 147 links, all resolve |
| `node docs/agents/check-personal.mjs` | nothing personal found |

**A simple command, and a page of commands.** The user guide's section on the panel opens with
the command that starts a server with its window by hand. `docs/cheatsheet.md` is new: the
important commands on one line each, written so that a line works in PowerShell, Command Prompt
and bash, with the page that explains each part under its table. The options and variables
were read in `McpMain.java`. Tried from the repository's root for the form that needs no change
of folder: `npm --prefix chrome-extension run typecheck` and `node --test
chrome-extension/test/panels.test.ts`. The other rows in that form were not run. The owner ran
the panel's command on the old jar and got `Unknown option: --panel`, as the user guide says;
the cheat sheet has a line for it.

**The pairing token, copied.** A button in the panel puts the token on the clipboard. By hand,
in the real window on Windows, server run from the tree's classes with a token file of the
test's own, the button pressed through the accessibility interface: the clipboard then held
the token of the file; the window showed it nowhere; the log said `pairing token copied to the
clipboard in the panel` and had nothing of the token, nor had standard output; 66 seconds later
the clipboard was empty. The text the clipboard had held before was put back. Not tried: the
clipboard on Linux and macOS; Stop within the minute, which is tested with a clipboard of the
test's own.

**The panel's controls.** Found by drawing the panel with nine tabs: the list pushed the switch
and both buttons out of the window. It was so since the panel was merged, from about six tabs.
Now three are listed and the rest counted, the window is up to 760 pixels high where the screen
allows, and the part between header and controls scrolls. Looked at in the tool's eight
pictures, among them nine tabs, and the most there is to show at the height of a screen of 768
pixels: in each the header and the whole Control card are inside. Not seen: a real screen that
low.

**The extension shows what is so.** Two things were stale. The badge said `ON` for an
authorized tab whether or not an agent was connected: it says `OFF` now. And the answers to the
heartbeat were never counted, so a server that hangs stayed connected: now two in a row
without an answer take it for gone. By hand, with the real extension in Chrome as the suite
drives it and a real server whose process was stopped as a whole and later let run again
(`NtSuspendProcess`): the badge said `ON`; 60 seconds after the server stopped answering it
said `OFF`, and the popup said *Disconnected: is the MCP server running?* with the tab marked
as its agent's, not connected; 3.0 seconds after the server ran again the badge said `ON`, the
agent's status listed the session and a snapshot worked. The server's log has `extension
disconnected … code=4408` and the new connection. Not tried: a server that hangs while a
command runs; a machine that sleeps.

Pictures: the eight drawings of the panel, six of them opened after the last change;
`docs/images/server-panel.png` is the first, byte for byte.

Not run: the editor lab; the two unit suites on Linux; CI, which has no credit.

## 2026-11-22, on `docs-pass`: the documentation gone over (WP-18, part 1)

Every page that is not a record was read whole: `README.md`, `AGENTS.md`, `docs/README.md`,
the installation guide, the user guide, the tool reference, the security model, the editors
page, the architecture, the conformance page, the development page and the runbook. Claims
were checked against the source that owns them. No product code changed.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml test`, in the tree | 84 tests, after the change to three test files below |
| `cd chrome-extension && npm test` | 151 tests, none failed: the count the README states |
| `git grep -n "0\.2\.0" -- ":!*package-lock.json"` | names the seven files of the runbook and no other, after the change below; before it, three test files as well |
| `PanelPictures`, then `cmp` with `docs/images/server-panel.png` | six pictures; the first is byte for byte the documentation's picture |
| The jar in the tree, built on 2026-11-21 before the panel, run with `--panel` | `Unknown option: --panel` and the usage text on standard error, exit code 2, nothing on standard output |
| The window asked to close (`WM_CLOSE`, as Alt+F4 sends it), on Windows, server run from the tree's classes | The window is put away and still there; the server runs on and ends with exit code 0 when its input ends |
| `node docs/agents/check-links.mjs` | 133 links, all resolve (91 before the pass) |
| `node docs/agents/check-personal.mjs` | nothing personal found |

Out of date, and set right, each against its source:

- Installation guide: the build's example output named 52 tests (there are 84), and three
  bundle sizes that the built bundles no longer have. Both numbers are gone: the page now says
  what to look for.
- "Fourteen editor libraries" in the editors page, the README (twice) and the development
  page. The lab has fifteen pages: thirteen libraries and two plain controls, as the editors
  page's own table and `FIXTURES` in `e2e/editors/lab.mjs` show. It has been so since the
  page was written.
- Tool reference: `PAGE_ERROR`, `EXTENSION_ERROR` and `ERROR` can be answered and were not in
  the table of codes. Every other code the sources give is in it, and every parameter of every
  tool's definition is named in that tool's section (compared by a script, not by eye).
- Architecture: `Progress.java`, `BrowserException.java` and `pairing.ts` were not in the file
  map.
- Development page: the close codes 1001 and 1009 are used and were not named; `editor` was
  missing from the list of modules that run under jsdom; CI is also started by hand.
- The panel's tests had the product's version written into them, which made the runbook's
  check for a change of version name three files too many. They use a made-up version now,
  and `PanelPictures` reads the real one.
- The popup's *Disconnected* is now also explained by a connection switched off in a server's
  panel, in the two places that explain it.

Said once now, with links from the other pages:

- Installing and pairing: the installation guide. The user guide had the commands, the
  settings and the picture again.
- What the popup's messages mean: the user guide. The installation guide had three of them
  again and now points there.
- The server's panel, which stood at length in four pages: what the user sees in the user
  guide, the rules in the security model, how it is built in the architecture, the commands in
  the runbook. The development page and `AGENTS.md` keep a line each and link.
- Which page owns what: a new section "Documentation" in the development page. `AGENTS.md`
  points to it.

Added, on the owner's question whether the panel needs better documentation. The pages said
what the window shows to someone who has it; they did not say what is needed before that, or
when it puzzles. Now in the user guide: that a jar from before the panel does not start at all
with the option, and so costs the agent its tools (shown above); what each sentence of the line
with the dot means and what to do about it; that several agents give several windows, that a
window takes the keyboard when it appears, and that a request to close it puts it away; two
rows in the troubleshooting table. In `AGENTS.md`: that the panel repeats the popup's colours
and the goblin's shapes by hand. Not tried: the close button of a frame on Linux; that it puts
the window away there too is read in the source.

After the commit of this pass, on the owner's word: the root README's picture, two lines of
plain text, is now the Mermaid diagram of `docs/README.md`, block for block, as every other
diagram in the documentation is one. Both copies carry a comment that says to change both.

Seen on GitHub, through TabGoblin, on the docs index as it is on `main`: GitHub lays its
buttons for zooming over the bottom right corner of a diagram, and where a diagram spans the
column they cover what is there. In this one that was most of the box "Every other tab", the
one the words "no access" point to. Both copies now have an empty place at the right edge,
with a comment that says why. That was checked by drawing the diagram with the Mermaid
library in a headless Chrome, in a frame of GitHub's width with the corner marked that the
buttons took in the picture from GitHub (112 by 105 pixels): before, "Every other tab" lay
under it; now nothing does. Not seen: the corrected diagram on GitHub itself; it is not
pushed. In the architecture page the diagram "Reading a page" is narrower than the column
and clear of the buttons; in "A command, end to end" they cover the lower of the two boxes
"Content script", whose upper one is whole. That was left as it is.

Moved out of the architecture page, where they were told as a story; they are measurements of
2026-11-22, made while the panel was built:

- With the real extension, the connection switched on again in the panel was found by the
  extension by itself after 14.3 seconds.
- A copy of the jar from which the 53 native files for Windows had been taken, run with
  `--panel` on Windows with an empty cache for JavaFX, as a stand-in for a system the jar has
  no native part for: JavaFX printed a trace of its own, the server logged
  `panel not shown reason=RuntimeException`, ran on, and ended with exit code 0 and nothing on
  standard output.

Looked at and left:

- The user guide and the security model both state the rules for submissions, for two
  readers. They point to each other now and were not merged.
- Two sentences in the editors page speak of "the fourteen" editors. What they count could
  not be told without a run of the lab.
- The security model's numbers (sizes, limits, times) were compared with the constants in the
  code and are right. Its table of what is verified by tests was not gone through row by row.
- The conformance page: the SDK's version and the number of tests were compared; the rest was
  not read against the SDK.
- The example outputs in the tool reference were not compared with a run.

CI: run #15, for `main` with the panel, failed in all five jobs after two seconds each, read
on GitHub. The owner says the account's credit for Actions is used up; the logs were not
opened. Nothing of that run speaks about the code.

Not run: the suite end to end and the editor lab; the pass changed three test files of the
server and no other code.

## 2026-11-22, on `server-panel`: WP-13, the server's panel

A window for the server, asked for with `--panel`. Built in JavaFX after a first attempt in
Swing was turned down by the owner. The jar was built and the suites that need it were run in a
copy of the tree, because the session's own server runs from the tree's jar.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify`, in the copy | 84 tests; `McpConformanceIT` on the built jar: 8 tests. The jar is 17,554,410 bytes; the one before this work 7,091,063 |
| `mvn -B -f java-server/pom.xml test`, in the tree | 84 tests. On the way: five runs and four runs in a row without a failure, after two tests had each failed once (below) |
| the same with `-DargLine=-Djava.awt.headless=true`, as on a machine without a display | 83 tests, 6 skipped, none failed; run before the last test was added |
| `cd e2e && npm test`, in the copy | 94 passed, 0 failed, four times, each on the jar of that moment. The last was on a jar whose own classes are those of the final jar; one test was added after it |
| `node docs/agents/check-links.mjs` | 90 links, all resolve |
| `node docs/agents/check-personal.mjs` | nothing personal found |

Two tests failed once each in repeated runs. `aUserDisconnectIsExplainedToTheAgent` waited for
the connection to stop being open, which happens a moment before the server notes the code it
was closed with: it now waits for the code. `itIsReadFromTheRunningServer…` found a session
still listed a moment after its connection had closed: the panel now shows no tabs without a
connection, which is a change to the product and not to the test.

By hand, on Windows 11, with the jar from the copy:

- **The window, on Java 21 and on Java 26:** `panel shown` in the log, nothing on standard
  output, exit code 0 when the input ends. Standard error has one warning of JavaFX on both;
  on Java 26 four more lines of Java about a method that will be removed.
- **Its controls, pressed in the real window** through Windows' accessibility interface, which
  does not move the mouse: the switch off and on (the log says so, the line with the dot and
  the hint change); Stop twice, exit code 0 a third of a second later; Kill twice, exit code 1,
  and `ending at once on the user's word in the panel` as the last line. What the window offers
  a screen reader was read: every label, the two states of the switch, and the log under the
  name of its heading, after it had none.
- **Its icon.** Windows said the window had no icon of its own; the owner had seen Java's on the
  taskbar. The icons were set and silently passed over, because of the form of their pixels.
  After the fix Windows returns a goblin of 32 by 32 for the small and the big icon, and the
  window's button on the taskbar, pictured alone, shows it.
- **The log's view, measured in the real window:** at its last line with 40, 41 and 66 lines;
  unmoved and unwritten while scrolled up and while some of it was marked; at the new last line
  after the view was brought back down.
- **The keyboard:** when the window appears it is with the panel's ground, not with a button.
- **With the real extension,** in Chrome as the suite drives it, with the Java on the path
  (26): after the switch was pressed, `browser_status` and a snapshot said that the user had
  switched the connection off and where, the popup said *Disconnected: is the MCP server
  running?* with the session still listed, and opening the popup did not get the extension
  back in. After it was pressed again the extension was connected by itself after 14.3
  seconds, the session was the agent's again, and a snapshot worked. Stop, pressed twice,
  ended the server with exit code 0 under a real MCP client; no line on standard output was
  anything but protocol.

On Linux, Ubuntu 26.04 in the Linux subsystem of Windows, with a Java 21 runtime fetched for
the purpose and nothing installed:

- The first build's window, without a frame and see-through, was there for the system and drew
  nothing. The owner saw it first: an icon on the taskbar and nothing on the desktop.
- With the system's frame the window draws: six points in its margins had the colour of the
  panel's ground, and the picture taken after that shows the whole panel. The server ended
  with exit code 0. Without a display it logged `panel not shown reason=no_display` and ran.
- Not done there: pressing a button.

Pictures: the six drawings of `PanelPictures`, each opened; the first is
`docs/images/server-panel.png`. The real window was pictured on Windows in four states and on
Linux in one; those are not in git.

What went wrong on the way, and is worth knowing:

- **Three captures of a place on the screen showed other windows of the owner's desktop**
  instead of the panel, because the panel was not in front or drew nothing. They were deleted.
  The tool that took such captures was removed from the tree before any commit, and the
  runbook says not to picture the screen for this. Afterwards a window was pictured only once
  points inside it had been read as the panel's own.
- **A drawing was right where the window was wrong, twice:** the icon, and the window on
  Linux. Neither is found by a test.

Not run: the extension's suite and the editor lab (none of their files changed); the two unit
suites on Linux in a container (Docker was not running); anything on macOS; CI. CI run #14, for
`main` as it is, was read on GitHub as completed successfully; its jobs were not opened.

## 2026-11-22, on `ci-tab-address`: CI for the day's merges, and the step that failed in run #12

Read on GitHub by a session, through TabGoblin, on a tab the owner authorized with Explore:

- Run #11 (`3071781`, the merge of `nothing-personal`): passed. It is the first run with the
  fifth job, "Nothing personal", which had run on Windows only before.
- Run #12 (`5274b04`, the merge of `disconnect-revokes`): failed. Four jobs passed; end to end,
  92 passed and 1 failed: "a redirect out of the site during navigate suspends the session
  too", with "tab is at" and the address of the first demo site. The step for Disconnect, which
  that merge brought, passed.
- Run #13 (`2c26e0b`, the merge of `notice-box`): passed in all five jobs. End to end took 4m
  11s; its steps were not read one by one. It is the first run of the new step for the notice
  on GitHub's runner.

The cause of #12, concluded from its log and the step and not shown. The step lets the agent
navigate to an address that redirects out of the site, and then asserts three things: the
navigation is refused as having left the site, a snapshot is refused because the session is
suspended, and the tab is on the other site. The first two passed, so the extension had seen
the tab leave. The third asks the suite's driver, whose `url()` is what the browser last told
it; asked right after the tools' answers, it still named the page before. Two more steps ask
the same way: the click that leaves the site, and the move between the sites of a session.

The fix is in the suite alone: the three places wait, for up to five seconds, until the driver
names the address that is expected, and say the address it has if that does not come.

| Command | Result |
|---|---|
| `cd e2e && npm test`, in a copy of the tree with a jar built there | 94 passed, 0 failed, the three steps among them |
| `node docs/agents/check-links.mjs` | 79 links, all resolve |
| `node docs/agents/check-personal.mjs` | nothing personal found |

Not shown: the failure itself. It never came up on this machine, in any of the day's runs, and
run #13 passed on GitHub with the step as it was. So the run above shows that the fix breaks
nothing, not that it mends the step. Not run: the unit suites and the editor lab; no product
code and none of their files changed.

## 2026-11-22, on `notice-box`: WP-11, the notice in the page: a bar, and pills of what ended

On the final sources, which are the two-pane form with the goblin bare. The extension's check ran
in the tree. What needs the jar ran in a copy of the tree, with a jar built there, because the
session's own server runs from the tree's jar. The copy held the product sources and the suite
of the tree, compared file by file, and was removed afterwards.

| Command | Result |
|---|---|
| `cd chrome-extension && npm run check`, in the tree | type-check clean, 151 tests, build. Twelve are new: ten of the notice (what it shows at a moment, the drawing under jsdom, the goblin), one of a line's words, one of what the worker tells a page |
| `cd e2e && npm test`, in the copy | 94 passed, 0 failed. It is the fifth full run, and the third to pass: one on each form the look went through (see below). One step is new: two commands that ended have a pill each, the newer one last; one that failed says how; the pills stay while the next command runs; the notice fades and leaves the page; neither a snapshot nor the text has any of it; and the agent's screenshot is compared with two of the suite's own, one with the notice in it and one without. Two steps are extended: the bar says what runs, and a real click on Pause is answered in the notice |
| `cd e2e && node notice-pictures.mjs` | 31 pictures, drawn by `notice.ts` in a plain page. Opened with the goblin bare: the bar with two pills (light), the user being asked (dark), paused (light), idle with one pill (dark). Opened in the two-pane form before that, with the goblin on its tile: three pills with a refused one (light), the longest pill (dark, and in the narrow window), a pill half way through fading (dark), the whole notice half way through fading (light). Opened in the one-box form only: Pause under the pointer, two frames of the arrival, and the fading pill with less motion asked for, where it was plain |
| `HEADED=1 node screenshots.mjs`, in the copy | `indicator.png` made anew: a capture of the real notice in a real tab, at double size, opened, and copied into the tree. Four more came out different and none was copied. `popup-folded.png` was opened beside the tree's: it lists the two agents in the other order, which follows from which server got the first port in that run. `popup-authorize.png`, `popup-full.png` and `popup-full-light.png` show the agents with their ports; two of them were opened in an earlier run of the day and differed in the ports alone, and in this run they were not opened. The other eight, and the seven examples, were the same byte for byte |
| `node docs/agents/check-links.mjs` | 81 links, all resolve |
| `node docs/agents/check-personal.mjs` | nothing personal found |

What the look went through, each step judged from pictures:

1. A plain box, built from the description alone. Its pictures showed the dot of the row out of
   line with the marks above it, pills that did not read as pills, a mark for "Paused by you"
   too small to see, a box that was hard to tell from a dark page, a width that jumped from 153
   to 323 pixels, and a Pause that did not say whose it is.
2. The owner's word then: "modern, fun and something that fits the theme of our app". The box
   got the popup's colours and round marks, and the goblin beside the row. Its pictures showed a
   text for the user being asked that broke over two lines; it was shortened to "Answer needed
   in the popup".
3. The owner's word on its size: "i wonder if we should split it 2 planes?". The two-pane form
   was drawn from a copy of the source and set beside the box, same state, light and dark. With
   three pills the box is 272 by 120 pixels; bar and pills together, measured in the pictures,
   cover about a third less, and the bar stays 42 pixels high where the box grew. That is what
   is built. The one-box form was never committed.
4. The owner's word on the goblin: "the little goblin should be have no background and
   border". It stood on a dark tile with a ring around it, and the ring pulsed for the state.
   Now it stands bare on the bar, larger, and its own outline glows: green in pulses while the
   agent works, amber when the user is asked.

Failed on the way, end to end:

- First run, 93 of 94. The new step found the session paused. The step before it resumed in the
  popup while the popup still showed the old state, and so resumed nothing; the step after it
  used to want the session paused, which hid that. The step now waits for the popup.
- Second run, 83 of 94. The new step passed and eleven after it failed: it had opened a tab to
  measure the pictures in, and a new tab takes the popup away. The first of them left the
  session paused, and the others followed from that. The step measures in the page that is open
  anyway.
- In the picture script: a pill pictured 150 ms after it arrived was invisible instead of half
  faded, because its arrival was still running. The script waits for the arrival, as a real pill
  has long arrived when it fades. And the documentation's picture first held a pill left by the
  step before; the script now waits until the notice is gone.

Not run: the server's suites (no Java source changed, and the tree's jar was not rebuilt), the
editor lab (nothing in `editor.ts` or `snapshot.ts` changed) and the Linux container. Not seen:
the goblin's blink and its pulsing glow in motion, in a tab. Not tried: a screen reader, a
zoomed page, a page written from right to left, the system's high-contrast colours, and a page
with a button of its own under the bar. Read from the source as it was and not run on it: what
the old pill did after a pause.

## 2026-11-22, on `disconnect-revokes`: WP-10, Disconnect ends the agent's sessions

On the final sources. The extension's check ran in the tree. What needs the jar ran in a copy of
the tree, with a jar built there, because the session's own server runs from the tree's jar. The
copy held the product sources and the suite of the tree, compared file by file, and was removed
afterwards.

| Command | Result |
|---|---|
| `cd chrome-extension && npm run check`, in the tree | type-check clean, 139 tests, build |
| `cd e2e && npm test`, in the copy | 93 passed, 0 failed. The step for Disconnect is a new one in place of the old: each agent's row says how many tabs it has, and the button's hint that it ends them; after Disconnect the agent's session is gone from the popup and the list says why, the other agent keeps its tabs and does not see that site; allowed again, the agent is connected, has no session, and its old session id is refused; the user's click on the tab gives it a new session. |
| `FULL=1 node screenshots.mjs prompts`, in the copy | 64 pictures. Looked at: the whole popup with the setting on every time (dark) and with two things that pass (light), for the agent's row: name, "1 tab", port, button. |
| `HEADED=1 node screenshots.mjs`, in the copy | Three pictures came out different from the tree's, the three that show the Agents panel. All three were opened and then copied into the tree: `popup-authorize.png` ("no tabs" beside each agent), `popup-full.png` and `popup-full-light.png` ("1 tab"). The other ten, and the seven examples, were the same byte for byte. |
| `node docs/agents/check-links.mjs` | 79 links, all resolve |
| `node docs/agents/check-personal.mjs` | nothing personal found |

Shown against the source as it was, with a copy of the worker tests that ends in one test which
prints what it gets (run on both sources, not kept): an agent has a tab and is disconnected; a
second server connects under the same name and asks for a snapshot in that session. Before: `ok`,
with the page, and the session then carried the second agent's id. After: `UNKNOWN_SESSION`, and
no session left.

Failed on the way: one assertion of the new worker test. It took the last entry of the activity
list for the newest; the list keeps what still runs behind what is finished. The test was
corrected; the worker was not touched for it.

On arrival the checkout was on `main`: the owner had merged `nothing-personal` and removed the
branch. `git status -sb` showed it before the first change, and the branch was made first.

Not run: the server's suites (no Java source changed, and the tree's jar was not rebuilt), the
editor lab (nothing in `editor.ts` or `snapshot.ts` changed) and the Linux container. Not tried:
an agent's name too long for its row beside the count (it is cut with an ellipsis, and the whole
name is in its hint; no picture has one), the button's hint by eye (the suite reads its text),
and a Disconnect while a real model is at work.

## 2026-11-22, on `nothing-personal`: WP-14, the files and the check

No product code changed. What changed: four examples in the documentation, a check with its
tests and its job in CI, and the pages that name them.

| Command | Result |
|---|---|
| `node --test docs/agents/check-personal.test.mjs` | 5 tests, none failed |
| `node docs/agents/check-personal.mjs` | 121 files read, 17 binary files not read, nothing personal found; exit 0 |
| the same, with a home directory planted in a new file and at the end of a tracked one | 2 findings, each with its file and line and without the text; exit 1. With both taken out again: exit 0 |
| `node docs/agents/check-links.mjs` | 73 links, all resolve |

Looked at: all thirteen pictures in `docs/images`. Eleven show the popup, one the notice in a
demo page beside a sign-in form with its password as dots, one Chrome's extensions page with
TabGoblin alone. In them: loopback addresses, ports, the names the two test agents give
themselves, the extension's id and version. No folder, account, name or other extension. A
script that was not kept listed the chunks of the seventeen tracked PNG files: a header, picture
data and an end in each, and no text.

Searched again, with `git grep` and `git log`: the tracked files, the messages of the 61
commits, and every line a commit ever added, for home directories, mail addresses, the user's
and the machine's name, and links to sessions. Found: what `TODO.md` lists under WP-14, "What
is still there", and nothing else.

Failed on the way: nothing in the check. One command that planted the home directory broke on
its quoting before it wrote anything; the script was then run from a file, as the runbook says.

Not run: the server's suites, the extension's check, end to end and the editor lab; nothing
they cover changed. The new job has not run on GitHub, and its commands not on Linux: Docker
was not running and the Ubuntu in WSL has no Node. Not done, and the owner's: the history, and
the address that commits carry.

Also in this session, in a second commit: WP-16 and WP-17 filed in `TODO.md`, none started. For
WP-16, what the documentation has today was read, and no other tool. For WP-17, how the token
is made, kept, found and rotated was read from the source; nothing was run.

## Earlier, in one line each

- 2026-11-21, on `ci-failures` (the CI failures of runs #7 and #8, read on GitHub through
  TabGoblin): the server sent `auth_ok` before it took the connection for its paired one, so a
  tool call right behind the pairing could be refused; an agent's name given during a pairing
  could be lost; and an end-to-end step read the names in the popup too early. Shown against
  the unfixed source by two tests that pair 200 times each, which failed in every one of seven
  runs, and by the suite with the second agent's first call held back. After the fix: server
  64 tests and 8 conformance tests, also held to one and two cores; end to end 93 of 93. Which
  of two causes failed the step in run #8 is not known. Not shown: the failures of
  `BrowserServiceTest` themselves, which passed in every local run.
- 2026-11-21, on `folding-panels` (Sessions, Activity, Agents and Settings fold to one line
  each): extension 136 tests; end to end 93 of 93, with a step that folds all four and finds
  them folded when the popup opens again; editor lab 222 and 220 of 225, no `SILENT`; eleven
  of the documentation's pictures, one new, all opened. Found by the suite: a key on its way
  to the page folded a panel the instant a prompt appeared; the rest of the popup takes no key
  or click for that moment now. The commit was first made on `main` and moved; the rule in
  `AGENTS.md` that makes the commit refuse comes from that. Not run: the server's suites, the
  Linux container. Not tried: folding with the keyboard by hand, a screen reader.
- 2026-11-21, on `pairing-race`, the look of the popup (a pass for alignment: headings and
  their actions on one baseline, settings with a heading, a session's chips under its address
  where they do not fit beside it): extension 132 tests; end to end 92 of 92; editor lab 222
  and 220 of 225, no `SILENT`, run before the last change; ten of the documentation's pictures
  changed, all opened. One run of the picture script timed out waiting for the agents and
  passed when run again. Not looked at: an address too long for its line, another zoom level.
- 2026-11-21, on `pairing-race`, WP-9 (the status tool says where the time of the last calls
  went): server 62 tests and 8 conformance tests, 70 in a Linux container; extension 132, also
  in a container; end to end 92 of 92, with a step that lets the user wait 1.5 s and reads the
  report; editor lab 222 of 225 in front and 220 of 225 in the background, no `SILENT`. Two
  worker tests failed in the first run over a command id used twice. Not shown: the report with
  a real agent and model, and an older extension against this server.
- 2026-11-21, on `pairing-race`, the box that names what the user declined ("You declined
  Enter in “Comment”"): extension 131 tests, also in a Linux container; end to end 91 of 91,
  the box read for a declined click and a declined Enter; editor lab 222 of 225 in front and
  220 of 225 in the background, no `SILENT`; 28 pictures of the prompt, the declined box
  looked at in both colour schemes. The server's suites were not run.
- 2026-11-21, on `pairing-race`, the first CI failure a session saw (the "Chrome extension"
  job, cancelled at its 15-minute limit): a message that arrived while the extension still
  checked the proof in `auth_ok` was taken for a failed pairing. Shown against the unfixed
  source with a copy of the worker's test that starts early and with a new test; not shown with
  the test file as it was. After the fix: extension 131 tests, twice more in a Linux container;
  server 55 tests and 8 conformance tests, 63 in a container; end to end 91 of 91; editor lab
  222 of 225 in front and 220 of 225 in the background, no `SILENT`. Not shown then: the job
  passing on GitHub.
- 2026-11-21, on `automatic-mode`, WP-8 (the status tool names a session that asks differently;
  the popup names the kind of request that passes): server 55 tests and 8 conformance tests,
  extension 130, end to end 91 of 91, editor lab 222 of 225 in front and 220 of 225 in the
  background, no `SILENT`; 28 pictures of the prompt, three looked at. Three of the
  documentation's pictures came out different in the agents' ports and were put back unopened.
- 2026-11-21, on `automatic-mode`, after WP-7 (the prompt says when an Allow will stand; a
  control without a name is never remembered): extension 130 tests, end to end 91 of 91, editor
  lab 222 of 225 in front and 220 of 225 in the background, no `SILENT`; 26 pictures of the
  prompt, five looked at. The server's suites were not run. Not tried: a control without a name
  in the automatic mode in a real browser. CI on GitHub not seen.
- 2026-11-21, on `automatic-mode`, WP-7 (the automatic mode for confirmations): server 54 tests
  and 8 conformance tests, extension 129, end to end 91 of 91, editor lab 222 of 225 in front and
  220 of 225 in the background, no `SILENT`; 24 pictures of 12 views, not all of them opened. Not
  tried then, and tried in the entry after it: an Allow that ends when the tab leaves the site,
  and the limit of five a minute in a real browser. CI on GitHub not seen.
- 2026-11-21, on `confirmations`, WP-4, WP-5 and WP-6: server 54 tests and 8 conformance tests,
  extension 127, end to end 90 of 90, editor lab 222 of 225 in front and 220 of 225 in the
  background, no `SILENT`; 16 pictures of the prompt looked at. Found by the lab and fixed: one
  code editor's Enter was judged a confirmed submission. CI on GitHub not seen.
- 2026-11-21, on `mcp-standard`, WP-1 complete (a cancelled call is not answered, progress,
  structured results): server 54 tests and 8 conformance tests, end to end 87 of 87, editor lab
  222 of 225 in front and 220 of 225 in the background, no `SILENT`. The extension's tests were
  not run; Ctrl+C on a running server, a real client and the MCP Inspector were not tried.
- 2026-11-21, on `mcp-standard`, WP-1, first part (the conformance check): server 54 tests and 6
  conformance tests, end to end 87 of 87. By hand: `server/discover` answered with `-32601`, a
  mistyped option exits with 2. The extension's tests and the editor lab were not run.
- 2026-11-21, on `typed-lines`, WP-3 (a prompt that cannot be answered by accident): extension
  120 tests, end to end 87 of 87, four pictures of the prompt looked at.
- 2026-11-21, on `typed-lines`, third commit (the look of the confirmation prompt): 20 pictures of
  the prompt looked at, three defects fixed; extension 120 tests, end to end 86 of 86. The server
  and the editor lab were not run again.
- 2026-11-21, on `typed-lines`, second commit (Enter in a text box is a submission): server 52
  tests, extension 119, end to end 86 of 86, editor lab 222 of 225 in front and 220 of 225 in the
  background, no `SILENT`. CI on GitHub not seen.
- 2026-11-21, on `typed-lines`, first commit (a fill never presses Enter): server 52 tests,
  extension 112, end to end 83 of 83, editor lab 222 of 225 in front and 220 of 225 in the
  background, no `SILENT`. CI on GitHub not seen.
- 2026-11-21, `29fea3e` on `editor-keys`: server 52 tests, extension 110, end to end 82 of 82,
  editor lab 222 of 225 in front and 220 of 225 in the background, no `SILENT`. CI on GitHub not
  seen.
- 2026-11-21, `0591970` on `editor-compatibility`: server 52 tests, extension 105, end to end 81
  of 81, editor lab 222 of 225 in front and 219 of 225 in the background with two `SILENT` cells
  (Enter in two editors, known then, fixed since). CI on GitHub not seen.
