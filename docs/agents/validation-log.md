# Validation log

Newest first. One entry per session that verified something. Not part of the startup read.
When this passes about ten entries, fold the oldest into one summary line.

## 2026-11-21, on `typed-lines`

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
