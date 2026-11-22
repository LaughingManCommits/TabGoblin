# Current state and handoff

Last updated: 2026-11-22. Claims here go stale; check the date, then `git status` and `git log`.

## Where the code is

- `main` = `origin/main` = `3071781`: the owner's merge of `nothing-personal` on 2026-11-22. It
  holds WP-14's files and check, and WP-15 to WP-17 as filed. Earlier branches are merged.
- Branch `disconnect-revokes`, made from it on 2026-11-22: one commit, made on the owner's word,
  with WP-10. Not pushed and not merged.

## Active work

| Item | Status | Authoritative source |
|---|---|---|
| WP-10, Disconnect ends the agent's sessions | Built and committed on `disconnect-revokes`; not merged | [TODO.md](../../TODO.md) for how it differs from its filing; the rule in [security.md](../security.md#agents) |
| WP-14, nothing personal in the repository | The files and the check are merged. What remains is the owner's: the address of commits from now on, the history, and four decisions | [TODO.md](../../TODO.md) |
| WP-11 to WP-13, WP-15 | Filed on 2026-11-21, none started. Each waits for the owner's decisions. WP-15, an easy install, has WP-14 as its first step | [TODO.md](../../TODO.md) |
| WP-16, a page that shows how TabGoblin differs from other tools | Filed on 2026-11-22, not started. No other tool has been read up or tried yet; the products it names are from memory. Waits for the owner's decisions | [TODO.md](../../TODO.md) |
| WP-17, a new token at every start, and nothing connected on an old one | Filed on 2026-11-22, not started. Its first decision is what "the latest token" means when several agents run. It decides the pairing step of WP-15 | [TODO.md](../../TODO.md) |

## Blockers and unknowns

- **Disconnect holds for one run of an agent's server.** The agent is refused by an id that its
  server makes when it starts; started again, it is connected again, without a tab. WP-10 did
  not change that, and [security.md](../security.md#agents) says so. WP-17 would.
- **The tree's `chrome-extension/dist` is of WP-10.** An extension that is loaded from it takes
  the change up when it is reloaded in `chrome://extensions`.
- **The jar in `java-server/target` is older than the sources.** The session's own TabGoblin
  server runs from that jar, so the suites that need a jar were run in a copy of the tree, with
  a jar built there. Build it (`mvn -B -f java-server/pom.xml package`) before the suites are
  run in the tree, and restart an agent to get the new server.
- **Whether CI passed for `3071781` has not been looked at.** That push was the first to run the
  fifth job, "Nothing personal". Its two commands passed on Windows on 2026-11-22; they had not
  run on Linux, where the job runs (Docker was not running, and the Ubuntu in WSL has no Node).
  The run before it that a session saw is #9 (`9ea4734`), which passed in the four jobs it had;
  the two before that had failed, and causes and fix are in the
  [validation log](validation-log.md). One passing run does not show that a fault of timing is
  gone for good.
- **Every commit still carries the owner's mail address**, a new one too: it comes from the
  owner's git settings. See WP-14, "What remains".
- **Which of two causes failed the end-to-end job in run #8 is not known.** Both give the
  message in its log; both are fixed. See the validation log.
- **One test of the server failed once for a reason that was not looked into further:**
  `closesConnectionThatFloodsMessages` got close code 1006 where it expects 4429, in one of 13
  runs on two cores, the one that ran while the end-to-end suite ran beside it. It is not one of
  the CI failures and nothing was changed for it. A guess, not shown: the test keeps sending
  while the server closes, and a connection closed with messages unread can lose its reason.
- **A session can read CI**, through TabGoblin itself: a tab on `github.com` that the owner
  authorized with Explore, then the run's page and its jobs. `gh` is still not logged in on this
  machine.
- **The browser suites have run only in Chrome on Windows.** The Mac shortcut path in
  `editor.ts` is untested. The two unit suites have also run on Linux, in a container, on
  2026-11-21 (runbook: "Reproduce a CI job"), not since: Docker was not running.
- **No hover.** CSS `:hover` cannot be set without the debugger, so a hover tool was decided
  against on 2026-11-21; the limit is recorded in the root `README.md`.
- **Not tried:** real products built on the tested editor libraries, and IntelliJ's own agent.

## Handoff

- **Last verification:** 2026-11-22, on `disconnect-revokes`: the extension's check in the tree
  (139 tests), the suite end to end in a copy of the tree (93 passed), and the three pictures
  that show the Agents panel, each opened. Not run: the server's suites and the editor lab;
  nothing they cover changed. Details in the [validation log](validation-log.md).
- **Next action:** the owner's push and merge of `disconnect-revokes`. To try it: reload the
  extension in `chrome://extensions`. Then WP-14's remainder (the address, the history), and
  the decisions on WP-11 to WP-13 and WP-15 to WP-17.
