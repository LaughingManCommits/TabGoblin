# Current state and handoff

Last updated: 2026-11-21. Claims here go stale; check the date, then `git status` and `git log`.

## Where the code is

- `main` = `origin/main` = `654e955`: the merge of `confirmations`, made by the owner on
  2026-11-21. Earlier branches are merged and gone.
- Branch `automatic-mode`: on the remote up to `cd624c0` (WP-7, pushed by the owner), not
  merged. One commit on top of it is local only: what going over WP-7 once more turned up.

## Active work

| Item | Status | Authoritative source |
|---|---|---|
| Push the last commit of `automatic-mode`, then merge the branch | Waiting for the owner, who pushes and merges | git |
| WP-8: three small things left from the automatic mode | Waiting for the owner's word on each | [TODO.md](../../TODO.md) |

## Blockers and unknowns

- **No CI result has been read.** The two pushes to `main` on 2026-11-21 should each have started
  all four jobs, the "Editors" job for the first time. The repository is private and `gh` is not
  logged in on this machine, so no session has seen how they ended.
- **Only Chrome on Windows has run the browser suites.** The Mac shortcut path in `editor.ts` is
  untested. The CI unit jobs are Linux, unverified for the same reason as above.
- **No hover.** CSS `:hover` cannot be set without the debugger, so a hover tool was decided
  against on 2026-11-21; the limit is recorded in the root `README.md`.
- **Not tried:** real products built on the tested editor libraries, and IntelliJ's own agent.

## Handoff

- **Last verification:** 2026-11-21, on `automatic-mode`, on its final build: the extension's
  tests, the end-to-end suite, and the editor lab in front and in the background. The server was
  verified one commit earlier and has not changed since. Details in the
  [validation log](validation-log.md).
- **Next action:** WP-8, once the owner has said which of its three points to do. What was never
  checked is listed under "Blockers and unknowns" above; reading a CI result is the first of
  them.
