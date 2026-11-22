# Current state and handoff

Last updated: 2026-11-22. Claims here go stale; check the date, then `git status` and `git log`.

## Where the code is

- `main` = `origin/main` = `42eb02b`: the owner's merge of `server-panel` on 2026-11-22, which
  is WP-13, the server's panel. Earlier branches are merged.
- Branch `docs-pass`, made from it on 2026-11-22: the first part of WP-18, a pass over the
  documentation, committed on the owner's word. The owner pushed the branch
  (`origin/docs-pass`); it is not merged.

## Active work

| Item | Status | Authoritative source |
|---|---|---|
| WP-13, a panel for the server | Merged. Seen on Windows and on Linux in the Linux subsystem of Windows; five points are open for the owner | [TODO.md](../../TODO.md) |
| WP-18, aftercare of the panel, and the documentation gone over | Its first part, the pass over the documentation, is done and committed on `docs-pass`; it waits for the owner's push and merge. Its second part lists what the panel left behind that needs no decision; none of it is started | [TODO.md](../../TODO.md) |
| WP-14, nothing personal in the repository | The files and the check are merged. What remains is the owner's: the address of commits from now on, the history, and four decisions | [TODO.md](../../TODO.md) |
| WP-12, WP-15 | Filed on 2026-11-21, not started. Each waits for the owner's decisions. WP-12, the goblin that acts, has its place now: the goblin's face is in the notice and shows the state, not yet the action. WP-15, an easy install, has WP-14 as its first step; a name of its own on the taskbar for the server's panel belongs to it | [TODO.md](../../TODO.md) |
| WP-16, a page that shows how TabGoblin differs from other tools | Filed on 2026-11-22, not started. No other tool has been read up or tried yet; the products it names are from memory. Waits for the owner's decisions | [TODO.md](../../TODO.md) |
| WP-17, a new token at every start, and nothing connected on an old one | Filed on 2026-11-22, not started. Its first decision is what "the latest token" means when several agents run. It decides the pairing step of WP-15 | [TODO.md](../../TODO.md) |

## Blockers and unknowns

- **The server's panel was seen on two systems.** Windows 11 with Java 21 and 26: the window,
  its icon on the taskbar, and every control pressed in the real window. Ubuntu 26.04 in the
  Linux subsystem of Windows with Java 21: the framed window with the whole panel, and the
  server ending in order; its buttons were not pressed there. Not run: macOS, any other Linux
  desktop, a scaled screen, a screen reader.
- **The panel's window has no frame on Windows only.** On Linux the frameless see-through
  window was there for the system and drew nothing; the owner saw it first, as an icon on the
  taskbar and nothing else. No test finds that: a drawing of the panel is right when the
  window is not. The runbook says what to look at by hand ("Look at the server's panel").
- **CI does not run the panel.** Its runner has no display, so the six tests of the window are
  skipped there (shown on this machine with `-Djava.awt.headless=true`: 6 skipped, the others
  pass). The jar's native part for Linux has run only in the Linux subsystem.
- **A server that is switched off in its panel looks to the popup like one that does not run:**
  it says *Disconnected: is the MCP server running?*. The extension is refused before any
  pairing and is not told why. Saying so needs a close code of its own, on both sides.
- **The panel's window takes the keyboard when it appears,** as a new window does. No button in
  it has the keyboard then, so a key typed at that moment presses nothing; it still goes to
  the panel and not to where the user was typing.
- **A server with its panel writes lines that are not its own to standard error:** one warning
  of JavaFX at the start, on Java 21 and 26; and on Java 26 four lines of Java's, that a method
  JavaFX uses for drawing is to be removed in a future release. With a log level of `off` they
  still come. Nothing goes to standard output. What the panel does on a Java without that
  method is not known; such a Java was not at hand.
- **When its first port is taken, a server prints a stack trace** of the socket library before
  it takes the next port. Seen while trying the panel; it is so on `main` too (the logging
  library that prints it was there before) and was not looked into.
- **The notice sits where a page may have a button of its own.** It is fixed to the bottom right
  corner, as the pill was. A click on it goes through to the page everywhere but on Pause; a
  button of the page that lies under Pause cannot be clicked while the bar is there, and what
  is under bar and pills is not seen. As two panes it covers less than as one box, about a
  third less with three pills. Not solved: it cannot be moved or put aside, short of switching
  it off under Settings.
- **The new step for the notice has passed once on GitHub's runner**, in run #13. It has two
  places where a slow machine could differ: it must catch the notice while it fades, a window
  of one second, and it compares pictures by the share of dark pixels in the corner, with
  limits (0.05 and 0.02) whose measured values were not written down. One pass does not show
  that it always will.
- **One thing has three names.** The popup's setting reads "Indicator in the page", the
  documentation says notice, and the code says indicator (`bcmcp-indicator`, `indicator.png`,
  the `indicator` setting). The setting's line in the popup, "Shows the agent at work. Has a
  pause button.", is still true and says less than the notice does. Not changed: it is wording
  for the owner, and a change to it changes two of the popup's pictures.
- **A session that is only paused has no notice any more**, and "Agent idle" is what the bar
  says between two commands. Both are choices made while building, not asked for; see WP-11 in
  `TODO.md`.
- **The one-box form is not in git.** It was built first and never committed; the two-pane form
  took its place in the working tree. If the owner wants it back, it has to be made again: bar
  and pills inside one drawn box, the goblin at the bottom left.
- **The notice's motion was looked at in still pictures only:** every state, a pill and the
  whole notice half way through fading, four frames of it arriving, and one state with less
  motion asked for. The goblin's blink and its pulsing glow were not watched in a tab. Not tried: a
  screen reader, a page that is zoomed, a page written from right to left, and the system's
  high-contrast colours.
- **Disconnect holds for one run of an agent's server.** The agent is refused by an id that its
  server makes when it starts; started again, it is connected again, without a tab.
  [security.md](../security.md#agents) says so. WP-17 would change it.
- **The tree's `chrome-extension/dist` is of WP-11.** An extension that is loaded from it takes
  the change up when it is reloaded in `chrome://extensions`.
- **The jar in `java-server/target` is older than the sources,** and has no panel. The
  session's own TabGoblin server runs from that jar, so the suites that need a jar were run in
  a copy of the tree, with a jar built there. Build it (`mvn -B -f java-server/pom.xml
  package`) before the suites are run in the tree or the panel is asked for, and restart an
  agent to get the new server.
- **The panel's code has not run in CI.** Run #15 (`42eb02b`, the merge of `server-panel`)
  failed, read on GitHub on 2026-11-22: all five jobs ended after two seconds. The owner says
  the account's credit for Actions is used up; the jobs' logs were not opened. So nothing of
  the run speaks about the code, and CI will say nothing until there is credit again. What
  the Linux job will show when it runs is known from this machine only: six tests of the
  panel's window skipped, the others passing.
- **The last run that ran passed:** #14 (`3aa4d5f`, the merge of `ci-tab-address`), read from
  the list of runs; its jobs were not opened. It is the first run with the fix to the suite's
  three steps. Before it, #13 (`2c26e0b`) passed in all five jobs, #11 (`3071781`) passed, and
  #12 (`5274b04`, the merge of `disconnect-revokes`) failed in one step end to end, 92 of 93.
  One passing run does not show that a fault of timing is gone for good.
- **Why run #12 failed is concluded, not shown.** The step asked the suite's driver where the
  tab was right after the agent's tools had said that it had left its site, and the driver
  still named the page before. The two tool results in front of it passed, so the extension
  had seen the move. It never failed on this machine, and it passed in run #13 without the
  fix and in run #14 with it. The fix waits for the address in the three places that ask this
  way.
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

- **Last verification:** 2026-11-22, on `docs-pass`: the documentation read whole and checked
  against the source; the server's 84 tests and the extension's 151 in the tree; the link
  check and the personal check. For the panel itself, earlier that day: the two suites of the
  server and the suite end to end in a copy of the tree, and the real window by hand. Details
  in the [validation log](validation-log.md).
- **Next action:** the owner's merge of `docs-pass`. The first
  CI run with credit is the first to run the panel's code on GitHub. Then the second part of
  WP-18, WP-13's open points, WP-14's remainder (the address, the history), and the decisions
  on WP-12 and WP-15 to WP-17. Of those WP-17, a new token at every start, was recommended as
  the next to build.
