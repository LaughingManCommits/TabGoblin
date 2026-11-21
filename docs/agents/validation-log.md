# Validation log

Newest first. One entry per session that verified something. Not part of the startup read.
When this passes about ten entries, fold the oldest into one summary line.

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
