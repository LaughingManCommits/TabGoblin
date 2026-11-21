# Current state and handoff

Last updated: 2026-11-21. Claims here go stale; check the date, then `git status` and `git log`.

## Where the code is

- `main` = `origin/main` = `87e5a79`: the merge of `automatic-mode` (WP-7 and WP-8), made by the
  owner on 2026-11-21. Earlier branches are merged.
- Branch `pairing-race`: local, not pushed, not merged. On top of `87e5a79`, in this order: a
  message that arrives at the moment of pairing is no longer taken for a failed pairing (the
  cause of the CI failure described below); the popup says what kind of request was declined;
  WP-9 filed; WP-9 built, the report of where the time went.

## Active work

| Item | Status | Authoritative source |
|---|---|---|
| Push and merge `pairing-race`, then look at the CI run of that push | Waiting for the owner, who pushes and merges | git |
| A pass over the look of the popup: alignment, and whether it looks current | Asked for by the owner on 2026-11-21, to follow WP-9 | this page |

The backlog in [TODO.md](../../TODO.md) is empty.

## Blockers and unknowns

- **One CI result has been seen, and it was a failure.** On 2026-11-21 the owner showed the log
  of the "Chrome extension" job of one run: cancelled at its 15-minute limit, after the first
  test of `background.test.ts` failed and the next one never ended. The cause was found and fixed
  on `pairing-race`; see the [validation log](validation-log.md) of that date. Not seen: which
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

- **Last verification:** 2026-11-21, on `pairing-race`, all on its final build: every suite on
  Windows, and the server's and the extension's tests on Linux in a container. Details in the
  [validation log](validation-log.md).
- **Next action:** after the owner's push, the result of its CI run. Should the extension job
  fail again, its log now names the test and prints the failure: a test that hangs is ended
  after 60 seconds instead of running into the job's limit.
