# Current state and handoff

Last updated: 2026-11-21. Claims here go stale; check the date, then `git status` and `git log`.

## Where the code is

- `main` = `origin/main` = `7090b45`: the merge of `editor-compatibility`, made by the owner on
  2026-11-21. That branch is gone, locally and on the remote.
- Branch `editor-keys`: local, not pushed, not merged. It starts at `29fea3e` (key presses in
  editors) on top of `7090b45`.

## Active work

| Item | Status | Authoritative source |
|---|---|---|
| Push and merge `editor-keys` | Waiting for the owner, who pushes and merges | git |
| WP-1: follow the MCP standard with the official SDK | Open, not started, no owner | [TODO.md](../../TODO.md) |
| WP-2: text with line breaks, typed key by key | Open, found 2026-11-21, no owner | [TODO.md](../../TODO.md) |

## Blockers and unknowns

- **No CI result has been read.** The push of `7090b45` to `main` on 2026-11-21 should have
  started all four jobs, the "Editors" job for the first time. The repository is private and
  `gh` is not logged in on this machine, so no session has seen how they ended.
- **Only Chrome on Windows has run the browser suites.** The Mac shortcut path in `editor.ts` is
  untested. The CI unit jobs are Linux, unverified for the same reason as above.
- **No hover.** CSS `:hover` cannot be set without the debugger, so a hover tool was decided
  against on 2026-11-21; the limit is recorded in the root `README.md`.
- **Not tried:** real products built on the tested editor libraries, and IntelliJ's own agent.

## Handoff

- **Last verification:** 2026-11-21, all four suites passed locally on the code of the last commit,
  the editor lab in front and in the background. Details in the
  [validation log](validation-log.md).
- **Next action, if the owner asks for it:** start WP-1 at task 1 ("Pin the reference") in
  `TODO.md`. It begins with reading the specification revision that SDK 2.2.0 implements, before
  any code changes.
