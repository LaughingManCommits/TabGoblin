# Validation log

Newest first. One entry per session that verified something. Not part of the startup read.
When this passes about ten entries, fold the oldest into one summary line.

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

## 2026-11-21, on `pairing-race`: the CI failure

The first CI result a session has seen: a screenshot from the owner of the "Chrome extension"
job, cancelled at its 15-minute limit. Its log ends with `✖ finds servers across the port range
and refuses one that speaks another protocol version (27 ms)`, and nothing after it.

Cause. The extension checks the proof in `auth_ok` a moment after the server has sent it. A
message that arrived in that moment was taken for a failed pairing: the connection was closed
and the search for servers stopped. The test's setup waited for the fake servers to call
themselves paired, not for the worker, so a test could start in that moment. The first then
found no agent, and the command of the second was never answered.

Shown against the unfixed source:

- A copy of `background.test.ts` whose setup returns the moment the fake servers call themselves
  paired (run, not kept). Three runs: the first test failed within 7 ms each time
  (`version_mismatch` instead of `connected`, or one agent instead of two); the second never got
  an answer in two of the three. That is the CI log.
- The new test failed: a command sent in the same turn as `auth_ok` was not answered.
- Not shown: the failure with the test file as it was. On Linux in a container it passed once
  alone and four times in the whole run on two cores.

After the fix, all on the final build:

| Command | Result |
|---|---|
| `cd chrome-extension && npm run check` | type-check clean, 131 tests, build |
| the same in a Linux container (`node:24`, two cores; the command is in the runbook) | 131 tests, twice; then `background.test.ts` six more times, 16 of 16 each |
| the copy with the early setup, three runs | its second test is answered within 3 ms each time. Its first still fails: the copy starts too early on purpose. |
| `mvn -B -f java-server/pom.xml verify` | 55 tests; `McpConformanceIT` on the built jar: 8 tests |
| the same in a Linux container (`maven:3.9-eclipse-temurin-21`) | 63 tests, none failed |
| `cd e2e && npm test` | 91 passed, 0 failed |
| `cd e2e/editors && npm test` (tab in front) | 222 of 225, no `SILENT`, exit 0 |
| `cd e2e/editors && BACKGROUND=1 npm test` | 220 of 225, no `SILENT`, exit 0 |
| `node docs/agents/check-links.mjs` | all resolve |

Not shown: that the job passes on GitHub. And the server now sends `auth_ok` before it lets other
threads use the connection: that closes a gap between two threads, which no test can hit on
purpose. The suites show that it breaks nothing, not that the gap was ever hit.

## 2026-11-21, on `automatic-mode`, WP-8

Points 1 and 2 of WP-8: the status tool names a session that asks differently, and the popup
names the kind of request that passes. All on the final build of the branch.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify` | 55 tests; `McpConformanceIT` on the built jar: 8 tests |
| `cd chrome-extension && npm run check` | type-check clean, 130 tests, build |
| `cd e2e && npm test` | 91 passed, 0 failed. New in existing steps: the status tool names the session that asks differently, and no longer does once the general setting is chosen again; the popup lists Enter and a click as two things that pass, with one button for both. |
| `cd e2e/editors && npm test` (tab in front) | 222 of 225, no `SILENT`, exit 0 |
| `cd e2e/editors && BACKGROUND=1 npm test` | 220 of 225, no `SILENT`, exit 0 |
| `node screenshots.mjs prompts` | 28 pictures of 14 views. Looked at: a session with two things that pass in both colour schemes, and with one (light). |
| `HEADED=1 node screenshots.mjs` | run twice. `popup-automatic.png` was looked at both times and is the one picture kept. `popup-authorize.png`, `popup-full.png` and `popup-full-light.png` came out different too and were put back unopened: they show the agents' ports, which differ from run to run, and nothing this change touches. |
| `node docs/agents/check-links.mjs` | all resolve |

Failed on the way: no suite. The first picture for the documentation broke "(15 min)" over two
lines; number and unit are now held together. And a log of the editor lab was read that an
earlier run of the day had left under the same name; the numbers above are from this run.

Not tried: nothing new. CI on GitHub: see the entry that follows this one in time.

## 2026-11-21, on `automatic-mode`, after WP-7

Going over WP-7 once more. The prompt now says when an Allow will stand, a control without a
name is never remembered, and what the entry below lists as not tried was tried.

| Command | Result |
|---|---|
| `cd chrome-extension && npm run check` | type-check clean, 130 tests, build |
| `cd e2e && npm test` | 91 passed, 0 failed. New in existing steps: an Allow ends when the tab leaves its site, and the user is asked again after the return; five pass within a minute and the next is asked; the prompt of a session on two sites names the site the tab is on; the line about what an Allow reaches is in the prompt in the automatic mode and not otherwise. |
| `cd e2e/editors && npm test` (tab in front) | 222 of 225, no `SILENT`, exit 0 |
| `cd e2e/editors && BACKGROUND=1 npm test` | 220 of 225, no `SILENT`, exit 0 |
| `node screenshots.mjs prompts` | 26 pictures of 13 views. Looked at: the prompt in the automatic mode in both colour schemes, and the ordinary Enter prompt (dark) next to it. From the run before, now opened: the session in the automatic mode (light), "Do not ask me" (dark), and `docs/images/popup-full-light.png`. |
| `node docs/agents/check-links.mjs` | all resolve |

Failed on the way: two steps in the first run end to end. The new checks read the popup before
its next refresh; they now wait for it.

Not run: the server's suites (nothing in the server changed since the entry below) and
`HEADED=1 node screenshots.mjs` (the documentation's pictures show nothing that changed).

Not tried: a control without a name in the automatic mode in a real browser (rule and worker
tests only). CI on GitHub has still not been seen.

## 2026-11-21, on `automatic-mode`, WP-7

The automatic mode for confirmations. All on the final build of the branch.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify` | 54 tests; `McpConformanceIT` on the built jar: 8 tests |
| `cd chrome-extension && npm run check` | type-check clean, 129 tests, build |
| `cd e2e && npm test` | 91 passed, 0 failed. In a real Chrome: asked the first time, not the second; another control asked about; ended by the popup, by a pause, and by a restart of the worker. |
| `cd e2e/editors && npm test` (tab in front) | 222 of 225, no `SILENT`, exit 0 |
| `cd e2e/editors && BACKGROUND=1 npm test` | 220 of 225, no `SILENT`, exit 0 |
| `node screenshots.mjs prompts` | 24 pictures of 12 views. Looked at: the session in the automatic mode (dark), the setting on every time (dark) and on automatic (light). The other new ones were not opened. |
| `HEADED=1 node screenshots.mjs` | the pictures that changed were looked at one by one, except `popup-full-light.png`, the twin of `popup-full.png` |
| `node docs/agents/check-links.mjs` | all resolve |

Failed on the way: one new worker test, for a reason of its own. It counted entries in the
activity list, which keeps only its newest; it now looks at the newest of the kind.

Not tried: that an Allow ends when the tab leaves the site (the code path is the one that ends
it on a pause, which was tried), and the limit of five a minute in a real browser (rule and
worker tests only). CI on GitHub has still not been seen.

## 2026-11-21, on `confirmations`, WP-4, WP-5 and WP-6

All on the final build of the branch.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify` | 54 tests; `McpConformanceIT` on the built jar: 8 tests |
| `cd chrome-extension && npm run check` | type-check clean, 127 tests, build |
| `cd e2e && npm test` | 90 passed, 0 failed |
| `cd e2e/editors && npm test` (tab in front) | 222 of 225, no `SILENT`, exit 0 |
| `cd e2e/editors && BACKGROUND=1 npm test` | 220 of 225, no `SILENT`, exit 0 |
| `node screenshots.mjs prompts` | 16 pictures of 8 cases; all looked at, twice, with two details changed in between |
| `HEADED=1 node screenshots.mjs` | run twice; of the pictures that changed, all were looked at except `popup-full.png`, the dark twin of `popup-full-light.png` |
| `node docs/agents/check-links.mjs` | all resolve |

Found by the editor lab on the way: with Enter running as a submission, one code editor's Enter
was judged a confirmed submission. Its keyboard input, emptied after every key, had been read as
the field that was cleared. Fixed, with a test. No editor is excused from the question by
accident: all fifteen are asked about.

Not tried: the prompt of a session that spans two websites, with the tab on the second. The site
shown is taken from the tab's address when the user is asked. CI on GitHub has still not been
seen.

## Earlier, in one line each

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
