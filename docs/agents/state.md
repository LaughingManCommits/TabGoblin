# Current state and handoff

Last updated: 2026-11-21. Claims here go stale; check the date, then `git status` and `git log`.

## Where the code is

- `main` = `origin/main` = `5c9f4ab`: the merge of `pairing-race`, made by the owner on
  2026-11-21. It holds the fix for the moment of pairing (the cause of the CI failure described
  below), the declined box, WP-9 and the pass over the look of the popup. Earlier branches are
  merged.
- Branch `folding-panels`: local, not pushed, not merged. On top of `5c9f4ab`: the popup's panels
  fold to one line.

## Active work

| Item | Status | Authoritative source |
|---|---|---|
| Push and merge `folding-panels` | Waiting for the owner, who pushes and merges | git |
| The CI run of the push of `5c9f4ab`, the first with the fix for the pairing | Not seen by a session; the owner can show it | GitHub |

The backlog in [TODO.md](../../TODO.md) is empty.

## Blockers and unknowns

- **One CI result has been seen, and it was a failure.** On 2026-11-21 the owner showed the log
  of the "Chrome extension" job of one run: cancelled at its 15-minute limit, after the first
  test of `background.test.ts` failed and the next one never ended. The cause was found and fixed
  in `34a81a8`, which is in `main` since `5c9f4ab`; see the [validation log](validation-log.md). Not seen: which
  commit that run was for, its other three jobs, and any run since. The repository is private
  and `gh` is not logged in on this machine: a result reaches a session only when the owner
  shows it.
- **The browser suites have run only in Chrome on Windows.** The Mac shortcut path in
  `editor.ts` is untested. The two unit suites have also run on Linux, in a container, on
  2026-11-21 (runbook: "Reproduce a CI job"), not on a CI runner that a session could see.
- **No hover.** CSS `:hover` cannot be set without the debugger, so a hover tool was decided
  against on 2026-11-21; the limit is recorded in the root `README.md`.
- **Not tried:** real products built on the tested editor libraries, and IntelliJ's own agent.

## Handoff

- **Last verification:** 2026-11-21, on `pairing-race`, on its final build: the extension's
  check, the end-to-end suite, the editor lab in front and in the background, and every picture
  of the documentation looked at. The server was last verified with WP-9 and has not changed
  since. Linux, in a container, was last run with WP-9 too. Details in the
  [validation log](validation-log.md).
- **Next action:** after the owner's push, the result of its CI run. Should the extension job
  fail again, its log now names the test and prints the failure: a test that hangs is ended
  after 60 seconds instead of running into the job's limit.
