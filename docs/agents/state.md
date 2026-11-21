# Current state and handoff

Last updated: 2026-11-21. Claims here go stale; check the date, then `git status` and `git log`.

## Where the code is

- `main` = `origin/main` = `ba977cd`: the merge of `editor-keys`, made by the owner on 2026-11-21.
  Earlier that day the owner merged `editor-compatibility`. Both branches are finished.
- Branch `typed-lines`: local, not pushed, not merged. Three commits on top of `ba977cd`: a fill
  never presses Enter, and Enter in a text box is a submission that the user allows in the popup.
  A third commit gives that prompt its final look and regenerates the pictures in `docs/images`.

## Active work

| Item | Status | Authoritative source |
|---|---|---|
| Push and merge `typed-lines` | Waiting for the owner, who pushes and merges | git |
| WP-3: consent that cannot be given by accident | Open, not started. First. | [TODO.md](../../TODO.md) |
| WP-4: a prompt that says what is asked | Open, not started. Its task 1 at once. | [TODO.md](../../TODO.md) |
| WP-5: requests one at a time, and not again after a no | Open, not started | [TODO.md](../../TODO.md) |
| WP-6: Enter as a full submission, with tighter exceptions | Open, not started | [TODO.md](../../TODO.md) |
| WP-7: an automatic mode for confirmations | Proposed by the owner; four decisions open | [TODO.md](../../TODO.md) |
| WP-1: follow the MCP standard with the official SDK | Open, not started, no owner | [TODO.md](../../TODO.md) |

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

- **Last verification:** 2026-11-21. All four suites passed locally at the second commit of
  `typed-lines`, the editor lab in front and in the background. After the third commit, which
  changes the popup, only the extension's tests and the end-to-end suite were run again. Details
  in the [validation log](validation-log.md).
- **Next action:** WP-3 in `TODO.md` (consent given by accident from the keyboard), and task 1 of
  WP-4 (a wrong sentence in the prompt for a field of a form). WP-7 waits for the owner's
  decisions, which are listed in it.
- **After that, if the owner asks for it:** start WP-1 at task 1 ("Pin the reference") in
  `TODO.md`. It begins with reading the specification revision that SDK 2.2.0 implements, before
  any code changes.
