# Current state and handoff

Last updated: 2026-11-21. Claims here go stale; check the date, then `git status` and `git log`.

## Where the code is

- `origin/main` = `9ea4734`: the merge of `ci-failures`, made and pushed by the owner on
  2026-11-21. It holds five new packages in `TODO.md` and the fix for the CI failures of the two
  pushes before it. Earlier branches are merged.
- Local `main` is one commit ahead of it, not pushed: this page and one line of the validation
  log, set right after that push. Committed on `main` on the owner's word of 2026-11-21, for
  this change only; the working rule stands.

## Active work

| Item | Status | Authoritative source |
|---|---|---|
| WP-10 to WP-14 | Filed on 2026-11-21, none started. Each waits for the owner's decisions. The owner called WP-14, nothing personal in the repository, important | [TODO.md](../../TODO.md) |

## Blockers and unknowns

- **CI passes on `main`.** Run #9 (`9ea4734`) passed in all four jobs, read on GitHub on
  2026-11-21. The two runs before it had failed: #7 (`5c9f4ab`) in the Java server job, #8
  (`1b28c91`) in the Java server job and end to end; causes and fix are in the
  [validation log](validation-log.md). One passing run does not show that a fault of timing is
  gone for good: it had passed in run #7 end to end, too.
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

- **Last verification:** 2026-11-21. Locally, on what `ci-failures` held before it was
  committed: the server's suites with `verify`, also held to one and to two cores, and the
  end-to-end suite; not the extension's check (only built; nothing in it changed), the editor
  lab or the Linux container. On GitHub: run #9, all four jobs. Details in the
  [validation log](validation-log.md).
- **Next action:** the owner's decisions on WP-10 to WP-14, WP-14 first.
