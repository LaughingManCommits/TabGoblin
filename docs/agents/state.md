# Current state and handoff

Last updated: 2026-11-21. Claims here go stale; check the date, then `git status` and `git log`.

## Where the code is

- `main` = `origin/main` = `ba977cd`: the merge of `editor-keys`, made by the owner on 2026-11-21.
- Branch `typed-lines`: local, not pushed, not merged. On top of `ba977cd`: a fill never presses
  Enter; Enter in a text box is a submission that the user allows in the popup; the prompt's look;
  the prompt cannot be answered by accident (WP-3).
- Branch `mcp-standard`: local, not pushed, on top of `typed-lines`. WP-1, complete. Merge
  `typed-lines` first, then this.
## Active work

| Item | Status | Authoritative source |
|---|---|---|
| Push and merge `typed-lines`, then `mcp-standard` | Waiting for the owner, who pushes and merges | git |
| WP-4: a prompt that says what is asked | Open; its first task is done | [TODO.md](../../TODO.md) |
| WP-5: requests one at a time, and not again after a no | Open, not started | [TODO.md](../../TODO.md) |
| WP-6: Enter as a full submission, with tighter exceptions | Open, not started | [TODO.md](../../TODO.md) |
| WP-7: an automatic mode for confirmations | Proposed by the owner; four decisions open | [TODO.md](../../TODO.md) |

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

- **Last verification:** 2026-11-21, on `mcp-standard`, all on its final build: the server's
  tests, the conformance check on the built jar, the end-to-end suite, and the editor lab in front
  and in the background. The extension's tests were last run on `typed-lines`, which
  `mcp-standard` does not change. Details in the [validation log](validation-log.md).
- **Next action:** WP-4, WP-5 and WP-6 in `TODO.md` are open and need no decision. WP-7 waits for
  the owner's decisions, which are listed in it.
