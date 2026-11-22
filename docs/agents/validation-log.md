# Validation log

Newest first. One entry per session that verified something. Not part of the startup read.
When this passes about ten entries, fold the oldest into one summary line.

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

## 2026-11-21, on `ci-failures`: the CI failures of runs #7 and #8

Read on GitHub by a session, through TabGoblin: five runs, of which #1, #3 and #4 passed.

- Run #7 (`5c9f4ab`, the merge of `pairing-race`): the Java server job failed, four tests of
  `BrowserServiceTest`. The other three jobs passed.
- Run #8 (`1b28c91`, the merge of `folding-panels`): the Java server job failed, three tests of
  `BrowserServiceTest`, one of them the same as in #7; and end to end, 91 passed and 2 failed:
  "a second agent connects on its own port and is listed" (`Cannot read properties of undefined
  (reading 'dataset')`) and, for want of that agent's id, "the user can disconnect one agent".

Causes.

1. **The server.** Since `34a81a8` it sent `auth_ok` before it took the connection for its
   paired one. An extension that held `auth_ok` could find a tool call refused with
   `NOT_CONNECTED`. The tests' setup returns the moment `auth_ok` arrives: that is the failure
   of the Java server job, in other tests each time.
2. **The agent's name could be lost, in two ways.** Given between the building of `auth_ok` and
   the marking of the connection, it was neither in the answer nor sent behind it. And passing
   it on stopped with an exception at a connection that a newer one had just replaced, before
   the newer one was told. The popup then lists the agent by its id for good.
3. **The end-to-end step.** It read the names in the popup right after the count of agents. An
   agent names itself with its first tool call; when the extension has found its server before
   that, the popup lists it by its id until its next refresh, 700 ms at most.

Which of 2 and 3 failed the step in run #8 is not known; both give its message.

Shown against the unfixed source:

- Two new tests of `WebSocketBridgeTest` pair 200 times each: a command right behind the
  pairing must reach the extension that paired, and a name given during a pairing must arrive.
  Against the server's sources of `main`, seven runs (one free, three held to one core, three
  to two): at least one of the two failed in every run, the name in six, the command in four.
- End to end with the second agent's first tool call held back five seconds, the step as it
  was, and the server already fixed: 91 passed, 2 failed, the two steps and messages of run #8.
- Not shown: the failures of `BrowserServiceTest` themselves. They passed in every local run.

After the fix. The server takes the connection and sends `auth_ok` as one step for its other
threads; the name is passed on under the same lock, and a connection that has just closed no
longer stops it; the step waits for the name. Built and run in a copy of the tree, because the
session's own server was running from the tree's jar.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify` | 64 tests; `McpConformanceIT` on the built jar: 8 tests |
| `mvn -B -f java-server/pom.xml test`, held to one core (twice) and to two (three times) | 64 tests each time |
| `WebSocketBridgeTest` on the final sources, held to two cores (six times) and to one (three times), with the end-to-end suite running beside it | 28 tests in eight runs; in one, `closesConnectionThatFloodsMessages` got close code 1006 instead of 4429 |
| `cd e2e && npm test`, with the five seconds held back | 93 passed, 0 failed |
| `cd e2e && npm test`, as it is | 93 passed, 0 failed |
| `node docs/agents/check-links.mjs` | all resolve |

Found on the way, in tests that CI has not failed in: four tests asked `connectBlocking` whether
a connection had opened that the server closes right after; it says no when the close came
first, which it did in both runs on two cores. They now ask for the close code only. And the
flood test in the table above, which was left as it is; the state page has it.

Not run: `npm run check` of the extension (nothing in it changed; it was built for the suite),
the editor lab, the pictures, and the Linux container (Docker was not running).

On GitHub, after the owner's push: run #9 (`9ea4734`, the merge of `ci-failures`) passed in all
four jobs: Java server, Chrome extension, End to end, Editors.

Also in this session: WP-10 to WP-14 filed in `TODO.md`, none started. For WP-14 the tracked
files and the history were searched for personal information; what was found is in the package.

## 2026-11-21, on `folding-panels`: panels that fold

Sessions, Activity, Agents and Settings fold to one line each, which says what is inside. All on
the final build of the branch.

| Command | Result |
|---|---|
| `cd chrome-extension && npm run check` | type-check clean, 136 tests, build |
| `cd e2e && npm test` | 93 passed, 0 failed. The new step folds all four, reads each line, opens the popup again and finds them folded, and unfolds them. |
| `cd e2e/editors && npm test` (tab in front) | 222 of 225, no `SILENT`, exit 0 |
| `cd e2e/editors && BACKGROUND=1 npm test` | 220 of 225, no `SILENT`, exit 0 |
| `FULL=1 node screenshots.mjs prompts` | looked at: all four folded (dark), two folded (light). Without `FULL`: 32 pictures. |
| `HEADED=1 node screenshots.mjs` | eleven pictures, one of them new (`popup-folded.png`); all eleven opened after the last run |
| `node docs/agents/check-links.mjs` | all resolve |

Found by the suite, and a fault of the feature, not of the test: a step presses Tab and Enter
the instant a prompt appears, for keys that were on their way to the page. With the answers held
for that moment, Tab went on to the heading of Sessions and Enter folded it; three later steps
then could not find the Authorize button. For that moment the rest of the popup now takes no key
or click. The step checks that no panel is folded afterwards.

Failed on the way, besides that: the new step assumed two agents where one is connected, and
left the panels folded when it failed; it now unfolds them whatever happens. A worker test asked
for a wait of exactly 0 ms where 1 ms is in order. The first picture of the folded popup caught
the arrows turning and the pointer on a heading; the script now waits and moves the pointer.

And the commit was first made on `main`. The owner had merged `pairing-race` meanwhile; the
command that committed printed the branch first, and nobody read it. The commit was moved to
`folding-panels` and local `main` set back to the remote's. The working rule in `AGENTS.md` now
says how to make the commit refuse.

Not run: the server's suites (nothing in the server changed) and the Linux container (Docker
was not running after a restart of the machine). Not tried: folding with the keyboard by hand,
and a screen reader on the folded headings; the suite reads `aria-expanded` only.

## 2026-11-21, on `pairing-race`: the look of the popup

A pass for alignment, asked for by the owner. What changed: a heading and the action beside it
share a baseline; the settings have a heading, and each setting its name, its control and one
line of explanation; the "Submissions" choice of a session is one control as wide as the row
above it; a no that stands is shown under that control, like what passes; the links in those two
boxes have no button face; a session's chips go under its address where they do not fit beside
it, instead of cutting the address.

| Command | Result |
|---|---|
| `FULL=1 node screenshots.mjs prompts` | each view at its whole length and double size. Looked at before the change: a click prompt (dark), two things that pass (light), a high-impact prompt (light). After it: two things that pass (dark), the declined box (light), the prompt in the automatic mode (dark). |
| `HEADED=1 node screenshots.mjs` | ten pictures changed; all ten were opened after the last change. The suspended session shows its whole address, with the chips under it. |
| `cd chrome-extension && npm run check` | type-check clean, 132 tests, build |
| `cd e2e && npm test` | 92 passed, 0 failed, on the final build |
| `cd e2e/editors && npm test`, and with `BACKGROUND=1` | 222 and 220 of 225, no `SILENT`. Run before the last change, which moved the chips of a session. |
| `node screenshots.mjs prompts` | 28 pictures as before; with `FULL=1`, 28 more |
| `node docs/agents/check-links.mjs` | all resolve |

Failed on the way: one run of the picture script, started right after another, timed out waiting
for the two agents to connect. The next run passed; the cause was not looked for.

Not looked at: an address too long for its line (it is cut with an ellipsis, by the rule; no
picture has one), and the popup at another zoom level or font size. Not run: the server's
suites and the Linux container; nothing they cover changed.

## 2026-11-21, on `pairing-race`: WP-9, where the time went

The status tool says, when asked for diagnostics, where the time of the last tool calls went.
All on the final build of the branch.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify` | 62 tests; `McpConformanceIT` on the built jar: 8 tests |
| the same in a Linux container | 70 tests, none failed |
| `cd chrome-extension && npm run check` | type-check clean, 132 tests, build |
| the same in a Linux container (two cores) | 132 tests |
| `cd e2e && SHOW_TIMES=1 npm test` | 92 passed, 0 failed. The new step lets the user wait 1.5 s before answering a prompt and reads the report: 1.6 s under the user, 5 ms under the extension and the page for that call. The example in `docs/tools.md` is from this run. |
| `cd e2e/editors && npm test` (tab in front) | 222 of 225, no `SILENT`, exit 0 |
| `cd e2e/editors && BACKGROUND=1 npm test` | 220 of 225, no `SILENT`, exit 0 |
| `node docs/agents/check-links.mjs` | all resolve |

Failed on the way: two worker tests in the first run. New assertions used a command id that a
later test uses too, and that test's command was refused as a duplicate. They have their own ids
now.

Not shown: the report with a real agent and model. In the suites the agent is a script, so the
time between calls is milliseconds. Not shown either: an older extension against this server
(the note about calls without times is tested with a fake extension only).

## 2026-11-21, on `pairing-race`: the declined box

The popup names the kind of request the user declined ("You declined Enter in “Comment”"), as
it does for what passes. All on the final build of the branch.

| Command | Result |
|---|---|
| `cd chrome-extension && npm run check` | type-check clean, 131 tests, build |
| the same in a Linux container (two cores) | 131 tests |
| `cd e2e && npm test` | 91 passed, 0 failed. The box is read for a declined click and, new in an existing step, for a declined Enter. |
| `cd e2e/editors && npm test` (tab in front) | 222 of 225, no `SILENT`, exit 0 |
| `cd e2e/editors && BACKGROUND=1 npm test` | 220 of 225, no `SILENT`, exit 0 |
| `node screenshots.mjs prompts` | 28 pictures of 14 views. Looked at: the declined box in both colour schemes. |
| `HEADED=1 node screenshots.mjs` | `popup-declined.png` looked at and kept. The three pictures that show the agents' ports came out different again and were put back unopened. |
| `node docs/agents/check-links.mjs` | all resolve |

Not run: the server's suites; nothing in the server changed since the entry below.

## Earlier, in one line each

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
