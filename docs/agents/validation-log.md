# Validation log

Newest first. One entry per session that verified something. Not part of the startup read.
When this passes about ten entries, fold the oldest into one summary line.

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

## 2026-11-21, on `mcp-standard`, WP-1 complete

Gaps 1, 2 and 4: a cancelled call is not answered, progress for a client that asks, structured
results. All on the final build.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify` | 54 tests; then `McpConformanceIT` on the built jar: 8 tests |
| `cd e2e && npm test` | 87 passed, 0 failed |
| `cd e2e/editors && npm test` (tab in front) | 222 of 225, no `SILENT`, exit 0 |
| `cd e2e/editors && BACKGROUND=1 npm test` | 220 of 225, no `SILENT`, exit 0 |
| `node docs/agents/check-links.mjs` | all resolve |

Failed on the way, and why: the end-to-end step for a cancelled call, once, with 86 of 87. It
still waited for an answer to the call it had cancelled, which the server no longer sends. The
commit that made that change had been checked with the server's tests only. The step and the
test client now do what a client does: stop waiting, and note an answer that comes anyway.

Not run: the extension's tests, which this branch does not touch. Ctrl+C on a running server. A
real client of revision 2026-07-28. The MCP Inspector. CI on GitHub has still not been seen.

## 2026-11-21, on `mcp-standard`, WP-1, first part

The reference pinned, the conformance check, and gaps 5 to 8. On top of `typed-lines`.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify` | 54 tests; then `McpConformanceIT` on the built jar: 6 tests |
| `cd e2e && npm test` | 87 passed, 0 failed, on the final jar |
| `node docs/agents/check-links.mjs` | all resolve |

Seen fail first, as it should: the check that the extension is told when the server ends. Before
the change the extension got close code 1006; after it, 1001.

By hand, on the built jar: `server/discover` is answered with `-32601`; `--show-tokn` prints the
reason and the usage text and exits with 2.

Not run: the extension's tests and the editor lab, which this branch does not touch. Ctrl+C on a
running server. A real client of revision 2026-07-28. The MCP Inspector. CI on GitHub has still
not been seen, and now runs `mvn verify`.

Read, not run: the specification of revision 2026-07-28, through a summary of ten of its pages
and its changelog. Its schema was not read.

## 2026-11-21, on `typed-lines`, WP-3

The prompt cannot be answered by accident; its sentence for a field of a form is corrected.

| What | Result |
|---|---|
| `cd chrome-extension && npm run check` | type-check clean, 120 tests, build |
| `cd e2e && npm test` | 87 passed, 0 failed. The new step answers a prompt the instant it appears, then by Tab and Enter. |
| The prompt for a field of a form, headless: its first moment, afterwards in both colour schemes, and after Tab | 4 pictures looked at: the buttons are dim at first, Allow is still shown first, Tab reaches Deny |
| `node docs/agents/check-links.mjs` | all resolve |

Before the change, in a visible Chrome: Tab and then Enter typed into a prompt that had just come
up allowed the request. That script was not kept; the end-to-end step takes its place.

Not run again: the Java build and the editor lab, which this does not touch.

## Earlier, in one line each

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
