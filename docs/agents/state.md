# Current state and handoff

Last updated: 2026-11-21. Claims here go stale; check the date, then `git status` and `git log`.

## Where the code is

- `main` = `origin/main` = `728edfd`: the merge of `mcp-standard`, made by the owner on
  2026-11-21. Earlier branches are merged and gone.
- Branch `confirmations`: not merged. On top of `728edfd`: WP-6 (Enter as a full submission), WP-5
  (a no stands), WP-4 (what the prompt says, and its pictures). The owner pushed it up to `80ea261`
  (WP-6 and WP-5); the commits after that, starting with WP-4, are local.
## Active work

| Item | Status | Authoritative source |
|---|---|---|
| Push and merge `confirmations` | Waiting for the owner, who pushes and merges | git |
| WP-7: an automatic mode for confirmations | Proposed by the owner; four decisions open. Everything it depended on is done. | [TODO.md](../../TODO.md) |

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

- **Last verification:** 2026-11-21, on `confirmations`, all on its final build: the server's
  tests and the conformance check, the extension's tests, the end-to-end suite, and the editor lab
  in front and in the background. Details in the [validation log](validation-log.md).
- **Next action:** the owner's decisions for WP-7 in `TODO.md`. Nothing else is open.
