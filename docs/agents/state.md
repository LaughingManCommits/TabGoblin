# Current state and handoff

Last updated: 2026-11-22. Claims here go stale; check the date, then `git status` and `git log`.

## Where the code is

- `main` = `origin/main` = `b676396`, pushed by the owner on 2026-11-21. Earlier branches are
  merged.
- Branch `nothing-personal`, made from it on 2026-11-22: one commit, made on the owner's word,
  with WP-14's files and check, and WP-15 as it was filed in `TODO.md` the day before. Not
  pushed and not merged.

## Active work

| Item | Status | Authoritative source |
|---|---|---|
| WP-14, nothing personal in the repository | The files and the check are done, on `nothing-personal`. What remains is the owner's: the address of commits from now on, the history, and four decisions | [TODO.md](../../TODO.md) |
| WP-10 to WP-13, WP-15 | Filed on 2026-11-21, none started. Each waits for the owner's decisions. WP-15, an easy install, has WP-14 as its first step | [TODO.md](../../TODO.md) |

## Blockers and unknowns

- **CI has a fifth job that has never run:** "Nothing personal". Its two commands passed on
  Windows on 2026-11-22. They have not run on Linux, where the job runs (Docker was not running,
  and the Ubuntu in WSL has no Node), nor on GitHub: a push to a branch runs nothing.
- **Every commit still carries the owner's mail address**, a new one too: it comes from the
  owner's git settings. See WP-14, "What remains".
- **CI passes on `main`.** Run #9 (`9ea4734`) passed in all four jobs it had then, read on
  GitHub on 2026-11-21. The two runs before it had failed: #7 (`5c9f4ab`) in the Java server
  job, #8 (`1b28c91`) in the Java server job and end to end; causes and fix are in the
  [validation log](validation-log.md). One passing run does not show that a fault of timing is
  gone for good: it had passed in run #7 end to end, too. Whether CI ran for `b676396` has not
  been looked at.
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
- **The jar in `java-server/target` is older than the sources.** The fix for the CI failures
  was built and tested in a copy of the tree, because the session's own TabGoblin server was
  running from that jar. Build it (`mvn -B -f java-server/pom.xml package`) before the suites
  are run in the tree, and restart an agent to get the new server.
- **The browser suites have run only in Chrome on Windows.** The Mac shortcut path in
  `editor.ts` is untested. The two unit suites have also run on Linux, in a container, on
  2026-11-21 (runbook: "Reproduce a CI job"), not with the fix for the CI failures: Docker was
  not running.
- **No hover.** CSS `:hover` cannot be set without the debugger, so a hover tool was decided
  against on 2026-11-21; the limit is recorded in the root `README.md`.
- **Not tried:** real products built on the tested editor libraries, and IntelliJ's own agent.

## Handoff

- **Last verification:** 2026-11-22, on `nothing-personal`: the new check and its tests, the
  check against a planted home directory, and the link check. No product code changed and no
  product suite was run; the last runs of those are of 2026-11-21. Details in the
  [validation log](validation-log.md).
- **Next action:** the owner's push and merge of `nothing-personal`, which runs the new job for
  the first time. Then WP-14's remainder (the address, the history), and the decisions on WP-10
  to WP-13 and WP-15.
