# Validation log

Newest first. One entry per session that verified something. Not part of the startup read.
When this passes about ten entries, fold the oldest into one summary line.

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

## 2026-11-21, on `typed-lines`, third commit

The look of the confirmation prompt, checked by eye. No change to what is asked or when.

| What | Result |
|---|---|
| The prompt in the real popup, headless: click, Enter, a long name, a high-impact name, no name; each in the dark and the light theme | 20 pictures looked at; three defects found and fixed (a name cut mid-word, a missing name shown as a quotation, a high-impact prompt that looked routine) |
| `HEADED=1 node screenshots.mjs` | all ten pictures written; the six that changed were looked at one by one. The example outputs came out identical. |
| `cd chrome-extension && npm run check` | type-check clean, 120 tests, build |
| `cd e2e && npm test` | 86 passed, 0 failed |
| `node docs/agents/check-links.mjs` | all resolve |

Not run again: the Java build and the editor lab. Neither is touched by this commit, which changes
the popup, the wording of what has no name, and how a long name is shortened.

## 2026-11-21, on `typed-lines`, second commit

Enter in a text box is a submission; Enter or Space on a control follows the rules of a click.

Passed, all on the final build:

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml package` | 52 tests, jar built |
| `cd chrome-extension && npm run check` | type-check clean, 119 tests, build |
| `cd e2e && npm test` | 86 passed, 0 failed. Three new steps drive the real popup prompt. |
| `cd e2e/editors && npm test` (tab in front) | 222 of 225, no `SILENT`, exit 0 |
| `cd e2e/editors && BACKGROUND=1 npm test` | 220 of 225, no `SILENT`, exit 0 |
| `node docs/agents/check-links.mjs` | all resolve |

Not run: the new tests against the source before the change. That Enter and Space on a button
used to pass without the rules of a click is read from that source, not measured.

Failed: none. Not run: `node live.mjs` (both), `node agent.mjs`, `node screenshots.mjs`. CI on
GitHub has still not been seen.

## 2026-11-21, on `typed-lines`, first commit

A fill never presses Enter, on top of `ba977cd`. Same machine and versions as the entries below.

Passed, all on the final build:

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml package` | 52 tests, jar built |
| `cd chrome-extension && npm run check` | type-check clean, 112 tests, build |
| `cd e2e && npm test` | 83 passed, 0 failed |
| `cd e2e/editors && npm test` (tab in front) | 222 of 225, no `SILENT`, exit 0 |
| `cd e2e/editors && BACKGROUND=1 npm test` | 220 of 225, no `SILENT`, exit 0 |
| `node docs/agents/check-links.mjs` | all resolve |

The two new unit tests were also run against the source before the change. Both failed, as they
should: a typed fill made a message box send its first line.

Run once, not kept: a lab check that types `one`, a line break and `two` with `method: "type"`.
Before the change it failed in Draft.js, Trix and Editor.js, in Editor.js without the tool saying
so. After it, the result equals that of the `lines` check in all fifteen editors, in front and in
the background: fourteen hold the text, and Editor.js reports its one-paragraph-per-block limit.

Failed: none. Not run: `node live.mjs` (both), `node agent.mjs`, `node screenshots.mjs`. CI on
GitHub has still not been seen.

## 2026-11-21, `29fea3e` on `editor-keys`

Key presses in editors, on top of `7090b45`. Same machine and versions as the entry below.

Passed, all on the final build:

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml package` | 52 tests, jar built |
| `cd chrome-extension && npm run check` | type-check clean, 110 tests, build |
| `cd e2e && npm test` | 82 passed, 0 failed |
| `cd e2e/editors && npm test` (tab in front) | 222 of 225, no `SILENT`, exit 0 |
| `cd e2e/editors && BACKGROUND=1 npm test` | 220 of 225, no `SILENT`, exit 0 |
| `node docs/agents/check-links.mjs` | all resolve |

The six new tests in `chrome-extension/test/editor.test.ts` were also run against the source
before the change: five failed, as they should, and so did one existing test, which now sees that
a key used to be typed at the start of an editor.

Failed: none. The cells that do not pass are the limits listed in `docs/editors.md`.

Run once, not kept: two temporary lab checks, a key into an editor that was never focused, and a
text with a line break typed key by key. The second is WP-2 in `TODO.md`.

Not run: `node live.mjs` (both), `node agent.mjs`, `node screenshots.mjs`. CI on GitHub has still
not been seen.

## Earlier, in one line each

- 2026-11-21, `0591970` on `editor-compatibility`: server 52 tests, extension 105, end to end 81
  of 81, editor lab 222 of 225 in front and 219 of 225 in the background with two `SILENT` cells
  (Enter in two editors, known then, fixed since). CI on GitHub not seen.
