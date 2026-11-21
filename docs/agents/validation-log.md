# Validation log

Newest first. One entry per session that verified something. Not part of the startup read.
When this passes about ten entries, fold the oldest into one summary line.

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

## 2026-11-21, `0591970` on `editor-compatibility`

Working tree: clean except for untracked `TODO.md` and the agent files being added. Windows 11,
JDK 26 (the build targets release 21), Maven 3.8.1, Node 24.15.0, Chrome 157.

Passed:

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml package` | 52 tests, jar built |
| `cd chrome-extension && npm run check` | type-check clean, 105 tests, build |
| `cd chrome-extension && node --test test/agnostic.test.ts` | 2 tests |
| `mvn -B -f java-server/pom.xml test -Dtest=PairingTest` | passed |
| `cd e2e && npm test` | 81 passed, 0 failed |
| `cd e2e/editors && npm test` (tab in front) | 222 of 225, no `SILENT`; the three `fail` cells are the Editor.js limits in `docs/editors.md` |
| `node docs/agents/check-links.mjs` | all relative links and anchors resolve |

Exit 1, as documented:

- `BACKGROUND=1 npm test` in `e2e/editors`: 219 of 225. Two `SILENT` cells, Enter in Trix and in
  Editor.js, which `docs/editors.md` lists as known (footnote ³). Same cells as before `f5c6b82`.

Inspected, not run:

- `.github/workflows/ci.yml`. Its commands were read and match the runbook; no run on GitHub has
  been seen.
- `node live.mjs` (both), `node agent.mjs`, `node screenshots.mjs`, `node make-icons.mjs`.
