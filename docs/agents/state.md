# Current state and handoff

Last updated: 2026-11-21. Claims here go stale; check the date, then `git status` and `git log`.

## Where the code is

- `main` = `origin/main` = `1b28c91`: the merge of `folding-panels`, made and pushed by the owner
  on 2026-11-21. Earlier branches are merged.
- Branch `ci-failures`: local, not pushed, not merged. On top of `1b28c91`, two commits: five
  new packages in `TODO.md`, and the fix for the CI failures of the last two pushes (below).

## Active work

| Item | Status | Authoritative source |
|---|---|---|
| Push and merge `ci-failures` | Waiting for the owner, who pushes and merges | git |
| The CI run of that push, the first with the fix | Not run | GitHub |
| WP-10 to WP-14 | Filed on 2026-11-21, none started. Each waits for the owner's decisions. The owner called WP-14, nothing personal in the repository, important | [TODO.md](../../TODO.md) |

## Blockers and unknowns

- **CI failed on the last two pushes to `main`**: run #7 (`5c9f4ab`) in the Java server job, run
  #8 (`1b28c91`) in the Java server job and end to end. The causes are in the
  [validation log](validation-log.md), the fix is on `ci-failures`. Not shown: that the jobs
  pass on GitHub. The Chrome extension job passed in both runs: the fix of `34a81a8`, whose
  result had not been seen, holds there.
- **Which of two causes failed the end-to-end job in run #8 is not known.** Both give the
  message in its log; both are fixed. See the validation log.
- **One test of the server failed once for a reason that was not looked into further:**
  `closesConnectionThatFloodsMessages` got close code 1006 where it expects 4429, in one of 13
  runs on two cores, the one that ran while the end-to-end suite ran beside it. It is not one of
  the CI failures and nothing was changed for it. A guess, not shown: the test keeps sending
  while the server closes, and a connection closed with messages unread can lose its reason.
- **A session can read CI now**, through TabGoblin itself: a tab on `github.com` that the owner
  authorized with Explore, then the run's page and its jobs. `gh` is still not logged in on this
  machine.
- **The jar in `java-server/target` is older than the sources.** The fix was built and tested
  in a copy of the tree, because the session's own TabGoblin server was running from that jar.
  Build it (`mvn -B -f java-server/pom.xml package`) before the suites are run in the tree, and
  restart an agent to get the new server.
- **The browser suites have run only in Chrome on Windows.** The Mac shortcut path in
  `editor.ts` is untested. The two unit suites have also run on Linux, in a container, on
  2026-11-21 (runbook: "Reproduce a CI job"), not with this fix: Docker was not running.
- **No hover.** CSS `:hover` cannot be set without the debugger, so a hover tool was decided
  against on 2026-11-21; the limit is recorded in the root `README.md`.
- **Not tried:** real products built on the tested editor libraries, and IntelliJ's own agent.

## Handoff

- **Last verification:** 2026-11-21, on what `ci-failures` holds, before it was committed: the
  server's suites with `verify`, also held to one and to two cores; the end-to-end suite. Not
  run: the extension's check (only built; nothing in it changed), the editor lab, the Linux
  container. Details in the [validation log](validation-log.md).
- **Next action:** after the owner's push, the result of its CI run, which a session can read
  as described above. Then the owner's decisions on WP-10 to WP-14, WP-14 first.
