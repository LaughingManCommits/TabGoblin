# Current state and handoff

Last updated: 2026-11-21. Claims here go stale; check the date, then `git status` and `git log`.

## Where the code is

- `main` = `origin/main` = `a0af46a` (version 0.2.0, licence, CI workflow).
- Branch `editor-compatibility` is not merged into `main`. It holds the editor work, the agnostic
  guard, the reading improvements, the "stopping" guidance and the agent files.
  `origin/editor-compatibility` was at `0591970` on 2026-11-21; later commits are local until the
  owner pushes.

## Active work

| Item | Status | Authoritative source |
|---|---|---|
| Merge `editor-compatibility` into `main` | Waiting for the owner, who merges | git |
| WP-1: follow the MCP standard with the official SDK | Open, not started, no owner | [TODO.md](../../TODO.md) |

## Blockers and unknowns

- **CI has not been seen to run.** The repository is private and `gh` is not logged in on this
  machine, so no session has read a workflow result. The "Editors" job runs for the first time
  when a pull request is opened or the branch is merged.
- **Only Chrome on Windows has run the browser suites.** The Mac shortcut path in `editor.ts` is
  untested. The CI unit jobs are Linux, unverified for the same reason as above.
- **No hover.** CSS `:hover` cannot be set without the debugger, so a hover tool was decided
  against on 2026-11-21; the limit is recorded in the root `README.md`.
- **Not tried:** real products built on the tested editor libraries, and IntelliJ's own agent.

## Handoff

- **Last verification:** 2026-11-21 at `0591970`, all four suites passed locally. Details in the
  [validation log](validation-log.md).
- **Next action, if the owner asks for it:** start WP-1 at task 1 ("Pin the reference") in
  `TODO.md`. It begins with reading the specification revision that SDK 2.2.0 implements, before
  any code changes.
