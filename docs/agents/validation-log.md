# Validation log

Newest first. One entry per session that verified something. Not part of the startup read.
When this passes about ten entries, fold the oldest into one summary line.

## 2026-11-25, on `ccr-6350ba03-tntbzp`: WP-29, the tools as commands of a terminal

In a session that ran in the cloud: a container on Linux with Java 21 and its own Chromium,
which there starts only without its sandbox (a wrapper given as `BCMCP_CHROME`, outside the
repository). The jar was first used by hand: `tools`, a wrong command line, and `status` twice
under one name against a server the first command started, on the same port both times.

| Command | Result |
|---|---|
| `mvn -f java-server/pom.xml verify` | 225 tests, 16 skipped for lack of a display, and the conformance check on the built jar. 14 are new in `CliTest`, 1 in `SetupTest`, 3 in `McpMainTest`, 3 in `SkillsTest`. No test that was there was changed |
| `npm run check` in `chrome-extension` | Passes, with the type-check and the build. No source of the extension was changed |
| `cd e2e && node run.mjs` | 109 passed, 0 failed. Six steps are new, the section "The command line": no MCP client takes part in what they run |
| `node docs/agents/check-links.mjs`, `node docs/agents/check-personal.mjs` | Pass |

The suite was run four times. The first two had faults of the new steps themselves (the
popup's setting was left at "never" by the steps before, and a helper was called with the
wrong words). The third failed in a step that was there before and that no command takes part
in, "an agent whose server restarts gets its sessions back", on a wait in the popup, and the
steps after it timed out on the agent that step had closed; it had passed in the two runs
before with the same server, and passed in the fourth. Why it failed once was not found.

Afterwards, on the owner's word, a skill of its own for the command line for each agent
(`skills/cli`). The 225 tests above are with it. The built jar was then run against a home
folder made for the purpose: `--setup codex --mode cli` put the skill for the command line
there, with `agents/openai.yaml`; `--install-skill codex` put the one for MCP in its place, and
`--install-skill codex --mode cli` the first again, each saying that it replaced. The
end-to-end suite was not run again after that: no skill takes part in it, and the server's
code changed only where a skill is installed. One test of `CliTest` failed once on the way, by
a fault of its own: it took an agent that was just leaving for the new one.

Not run: Windows and macOS; `tabgoblin.cmd` and a download's launcher with a command; the
editor lab; the workflows; the server's window with an agent of the command line in it; a real
agent with the skill's new section. Not measured: how long a first command takes on a slow
machine, beyond the ten seconds it waits for the extension.

## 2026-11-24, on `late-navigation`: a link whose site changes the address late is waited for

A smoke test with the real extension on `main` at `9229490`, with Explore, on a public site:
`browser_collect` with `next` now returned both pages of a list of commits, 70 of them, in
1.2 seconds, where it had returned one. Status with diagnostics, snapshot, extract with `find`
and with `kind=tables`, a click on an expand control, hover and navigation worked; a click on
a button and a navigation to another site were refused. Two things were off, and are mended
here: the collection pressed the link to the next page twice for one page, since the page
before changed a little by itself and that was taken for the next one; and `browser_click` on
a link said `navigated: false` while the tab went on. Both for one reason: what follows a
click was looked at once, a quarter of a second after it. After a click on a link the address
now has up to two seconds to change.

| Command | Result |
|---|---|
| `npm run check` in `chrome-extension`, in a copy | 213 tests, type-check and build. One is new: an address that changes 700 ms after the click, a control that shows and hides answering as quickly as before, and a link that leads nowhere. The worker's file takes about 20 seconds longer, for the tests that click a link that leads nowhere |
| `cd e2e && node run.mjs`, in a copy | 103 passed, 0 failed. New in the step on collecting: a click on a link of the list that swaps its pages in late says the new address |
| `node docs/agents/check-links.mjs`, `node docs/agents/check-personal.mjs` | Pass |

Not run: the server's tests (no Java source changed) and the editor lab. Not seen: either
mended point on the site where it was found, since the browser there ran the extension as it
was built before. Not tried in the smoke test: `browser_request_access`, and the fallback
ranges of WP-28, as the server there is started with `--port`.

## 2026-11-24, on `port-copy-and-0.2.1`: a port in the server's window is copied by a click, and version 0.2.1

Asked for by the owner. On Windows 11 with a display, in a copy of the tree.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify` | 196 tests, 0 skipped, and the 8 of the conformance check on the built jar, which holds the version to the build's. One is new, in `PanelTest`: a click on the port puts its number alone on a clipboard of the test's own, asks the server for nothing, and the label says so for a moment. Three of the window's tests named the line under the title as one label; it is two now |
| `npm run check` in `chrome-extension` | 212 tests, type-check and build |
| `cd e2e && node run.mjs` | 103 passed, 0 failed, on the second run. The first had 11 failures: the step in which an agent's server starts again waited 30 seconds in vain, and the steps after it failed with it. The same build passed when run again; the cause was not found |
| `PanelPictures`, the pictures opened: one agent, and two agents | The port stands where it stood, in the line under the title and as an agent's chip; the foot says 0.2.1 |
| `git grep -n "0\.2\.0" -- ":!*package-lock.json"` | Only what speaks of the first release: the backlog, the records, the installation guide, and the runbook's example of a tag |
| `node docs/agents/check-links.mjs`, `node docs/agents/check-personal.mjs` | Pass |

Not run: the editor lab. Not seen: the click in the real window on a desktop, on any system;
what the pointer and the line under the port look like on hovering, which no picture shows.
The port is not reached by the keyboard.

## 2026-11-24, on `collect-late-page`: a list in pages that is swapped in late is collected whole

Found in a smoke test with the real extension, with Explore, on a public site's list of commits:
`browser_collect` with `next` came back after 312 ms with one page and "the last step showed
nothing new", while the tab went on to the second page. The site fetches the next list first
and changes the address and the list only then; a quarter of a second after the click the page
still showed the one before. Mended: a page that still shows the one before is read again for
up to three seconds, and once more when it has come to rest. The link is pressed once a page.

| Command | Result |
|---|---|
| `npm run check` in `chrome-extension`, in a copy | 209 tests, type-check and build. One part of a test is new: a page that comes two readings late |
| `cd e2e && node run.mjs`, in a copy | 103 passed, 0 failed. New in the step on collecting: `results.html?soft=1` swaps its list in 0.9 s after the click, and all twelve comments are collected once each. A first run had 12 failures, from a pattern mistyped in the new lines of the suite; the run after it is the one counted |
| `node docs/agents/check-links.mjs`, `node docs/agents/check-personal.mjs` | Pass |

The same smoke test, on `main` at `9030038` with Explore: status with diagnostics, snapshot
(in view, with diff), extract with `find` as a pattern and with `kind=tables`, a click on an
expand control, hover, scroll and navigation on the site worked; a click on a button and a
navigation to another site were refused.

Not run: the server's tests (no Java source changed) and the editor lab. Not seen: the mended
collect on the site where the fault was found, since the browser there ran the extension as it
was built before. Not mended: a plain click on such a link reports `navigated: false` for the
same reason; a snapshot after it shows the new page.

## 2026-11-24, on `wp-28-fallback-ports`: WP-28, a server where the system keeps the usual ports back

The owner said to mend the fault on the backlog. In the session's container, on Linux.

| Command | Result |
|---|---|
| `mvn -f java-server/pom.xml verify` | 203 tests with the conformance check's, 15 skipped (the window's, without a display). Nine are new: `PortsTest` (the user's own port is the only one; the first range that can be used is taken; a range that is free or that programs hold is not taken for one that is kept back; a server takes the next range and an agent's process finds it there; nothing changes where the first range is given out; no second server; no range, no server; what the status says) and one in `McpMainTest` (when a port counts as the user's own) |
| `npm run check` in `chrome-extension` | 212 tests, with the type-check and the build. Three are new: which ranges are looked at, that the ranges are far apart, and that a first port the user set is the only range the worker tries |
| `cd e2e && node run.mjs` | 103 passed, 0 failed. Its servers are started with `--port`, so it holds that a named port works as before and tries no fallback |
| By hand, the built jar started as an agent's program starts it, without a port | The server listened on 47821 and the status named that port: nothing changed where the usual range is given out |
| `node docs/agents/check-links.mjs`, `node docs/agents/check-personal.mjs` | all links resolve; nothing personal found |

**Not run, and it is what the work is for: a machine whose system keeps the first range back.**
None can be made in the container. The tests say "kept back" of a range by a function put in
its place. Whether listening and connecting fail on Windows for a reserved port as
`Ports.usable` takes them to is not seen. Not run either: the server's window; Windows and
macOS at all; the extension in a browser against a server on the second range.

Added the same day, from a second session on Windows 11 with a display, at `1dcbc2c`, in a
copy: `mvn verify` failed in one of the new tests, `PortsTest`
`aRangeThatIsFreeOrThatProgramsHoldIsNotTakenForOneTheSystemKeepsBack`, and so built no jar.
A fault of the test, not of `Ports`: its held sockets queued one connection and took none, the
first question whether a port answers filled that queue, and Windows refuses a further
connection where Linux lets it wait. With a queue of ten: 195 tests, 0 skipped, and the 8 of
the conformance check; `npm run check` 212; end to end 103 passed, 0 failed. The usual range
is kept back on that machine, but its server is started with `--port`, so no fallback was seen
there either. Not run: the editor lab.

## 2026-11-24, on `claude/tabgoblin-security-features-ncxa9m`: the documentation rewritten

Asked for by the owner: the documentation reviewed against the implementation and rewritten for
developers and for a security review. No product code was changed; one test is new.

| Command | Result |
|---|---|
| `cd e2e && node run.mjs`, at `70e3026`, before the rewrite | 103 passed, 0 failed. This is the run the entry below says was started after its commit |
| `mvn -f java-server/pom.xml test` | 186 tests, 15 skipped (the window's tests, without a display). Two are new, `ToolReferenceTest`: every tool of the server has its heading in `docs/mcp-reference.md` and no other tool has one, and every argument of a tool's schema is named in that tool's section |
| `node docs/agents/check-links.mjs`, `node docs/agents/check-personal.mjs` | 245 links, all resolve; nothing personal found |
| The nine diagrams of `README.md`, `docs/architecture.md` and `docs/corporate-assessment.md`, drawn with mermaid 11.4.1 in a headless browser | All nine are drawn. One did not parse at first, for a semicolon in a message, and was mended. Two were opened and looked at |

Checked against the source, by two readings apart from the writing: every tool's arguments,
defaults, bounds and error codes (the tool reference), and the numbers, names, options, file
names, close codes, popup texts, CI jobs and release steps of the other pages. What was found
wrong and is mended: protocol 2 in three places where it is 3; `auth_ok` without its version
and `attach` without `agent` and `agentProof`; "there is no hover" in the README; four
commands of the server's window where there are five, and 760 pixels where it is 824; sixteen
pictures of the window where there are nineteen, and six tests that need a display where it
is all of `PanelTest`; seven tools with an output schema where there are nine; tabs that come
back "by its name"; `--list-agents` without the revoked names; `browser_wait_for`'s `gone`
and a number of bounds missing from the tool reference; and that links to another origin are
not clicked, also to another site of the same session.

Not run: the extension's tests and the suite end to end after the rewrite, since no file they
read was changed (`e2e/screenshots.mjs` writes into `docs/images` and `docs/examples`, which
are where they were). Not checked: how GitHub draws the diagrams and the pages; the tool
reference's example outputs against `docs/examples`; the measured numbers carried over from
the earlier pages (sizes, the search measurement). `ToolReferenceTest` was not tried against
a reference with an argument taken out.

## 2026-11-24, on `claude/tabgoblin-security-features-ncxa9m` at `acc8167`: Show me, in the notice in the page

Asked for by the owner: a button in the notice that brings the popup back to a question that
waits. In the first session's container.

| Command | Result |
|---|---|
| `npm run check` in `chrome-extension` | 209 tests, with the type-check and the build. Four are new: the button in the asking state and in no other, a click that is not the user's, what a notice says at rest, and the worker's part |
| `cd e2e && node run.mjs` | 103 passed, 0 failed. The new step: a question is put, the popup is closed, a click the page makes up opens nothing, the user's click on the button brings the popup back on the question, nothing was sent by it, and the answer is given in the popup |
| `node notice-pictures.mjs` in `e2e` | 34 pictures; one state is new, the pointer on the button |
| `node docs/agents/check-links.mjs`, `node docs/agents/check-personal.mjs` | all links resolve; nothing personal found |

Looked at: the asking state over a light and a dark page and at the narrow width, and the
working state. The button stands before Pause, in the amber of the state, with its words whole;
Pause is where it was; the status takes two lines beside the two buttons, and the bar is no
higher for it. The other states were not opened again: nothing of theirs was changed, and the
button is not drawn in them.

A run of the suite before this one failed from the step of a restarted server on, with calls
that got no answer. The container had been started anew in the middle of it: its clock said
so. The run above was the next one, and was not disturbed.

Afterwards the owner chose other words for the button, and a glyph: an arrow up and to the
right, where the toolbar is, and the word *Answer*, in the place of *Show me*. `npm run check`:
209 tests. Drawn and looked at over a light and a dark page: the arrow and the word are whole
beside Pause. The first drawing of the arrow had its shaft on the other diagonal and read as a
wedge; that was seen in the picture and set right. A variant with the arrow alone was drawn
beside it for the owner and is not in the tree: the status took two lines there as well, so it
gained no room. The suite end to end was started after the commit; its result is in the
session's report and not here.

Not run: the server's tests, which this did not touch; Windows; the button by hand in the
owner's browser. Not decided, and the owner's: whether the button also shows for a question
that belongs to another tab's session; it does not.

## 2026-11-24, on `claude/tabgoblin-security-features-ncxa9m` at `9b287f0`: a server that has no port says why, and a smoke test

Two sessions. The second, on Windows 11 with a display, found a fault in use and mended what it
says; the first, in its container, ran what the second had left for the mending. What the
second session ran is as it reported it.

**The fault.** The server's window said that it could not listen on any of ports 47821 to
47828 because too many servers were running, and the popup said *Disconnected*. No other
server ran, and nothing listened there. Windows had kept the range 47749 to 47848 back for its
own networking, as Hyper-V, WSL and Docker have it done, out of the dynamic range, which on
that machine begins at 1024. A plain Node program was refused on the same ports and opened
39821. Java says *Address already in use* for a port that is kept back as for one that is held.
The owner runs with `--port 39821` and the same first port in the popup since.

| Where | Command | Result |
|---|---|---|
| Windows, second session | `mvn test`, at `8b7656d` | 184 passed |
| Windows, second session | `PanelPictures` | the window's state without a port was drawn and looked at |
| Container, first session | `xvfb-run -a mvn -B -f java-server/pom.xml verify`, at `9b287f0` | 184 tests, none skipped, and the 8 of the conformance check on the built jar |
| Container, first session | `cd e2e && node run.mjs`, at `9b287f0` | 102 passed, 0 failed |

**By hand, on Windows, with the real extension** at protocol 3 and Explore access on a tab of a
public site. Worked: the status, also with diagnostics, a snapshot, an extract, a click on a
link, a wait, a navigation back, a hover, a scroll, collecting with `find` (4 readings, 1.1
seconds), a screenshot without the notice in it. Refused as they should be: a click on a
button and a fill (`WRITE_NOT_AUTHORIZED`), a navigation to another site
(`NAVIGATION_BLOCKED`). Then, with the owner at the popup: a request for write access, which
the owner allowed, after which the status said read/write; a fill into a search field, which
kept its text; Enter in that search field with `intent=submit`, sent without a question, as a
search is; and a submission with two fields and an expected text, which the owner allowed and
which came back `CONFIRMED` by content, with three pieces of evidence. It made a real issue in
the owner's repository, which is open. A typical call took 22 ms in the extension and the page.
Not seen, since no tool sees the popup: that it came up by itself, and what the request and
the prompt showed. Not tried: a Deny of either question; pause, revoke and disconnect from the
user's side; a navigation that suspends the session.

Not run: the extension's check, which neither commit touched; the live window's log with the
new short line; the editor lab with `BACKGROUND=1`; the workflows.

## 2026-11-24, on `claude/tabgoblin-security-features-ncxa9m`: the server's window names a security policy

After the entry below, whose session saw two things in the window and left them: the policy
stood under a heading that named only blocked sites, with its content under the mouse alone;
and the pictures had no state for it. In the first session's container, which has a virtual
display after all (`xvfb-run`), so the window's tests and its pictures ran there for the first
time.

| Command | Result |
|---|---|
| `xvfb-run -a mvn -B -f java-server/pom.xml verify` | 179 tests, none skipped, the 15 of `PanelTest` among them, and the 8 of the conformance check |
| `PanelPictures`, under `xvfb-run` | nineteen pictures: the seventeen there were, and two new ones |
| `node docs/agents/check-links.mjs`, `node docs/agents/check-personal.mjs` | all links resolve; nothing personal found |

The two new pictures were opened and looked at. `18-policy`: the heading reads *Blocked sites
and security policy*; under it *docs.example.org*, and then *Policy: strict, 1 site allowed, no
screenshots, up to Explore, ends by itself* on two lines, whole, beside **Edit**; the Control
card with Stop and Kill is inside the window. `19-policy-alone`: the same heading, *No site is
blocked*, and *Policy: no screenshots*. Two forms before that were looked at and changed: one
line, which was cut off after *no screens…*, and separators that took a third line.

Not done: the live window on a desktop, and the text under the mouse, which is tested in the
window's model. The extension and the suite end to end were not run again: neither was
touched. `1-connected` was not compared with the documentation's picture: another system draws
its letters differently, and the window without a policy is as it was.

## 2026-11-24, on `claude/tabgoblin-security-features-ncxa9m` at `41248d7`: WP-27 on Windows, and the editor lab

The owner asked for the tests to be run on what the three entries below built. They had run in
a container on Linux without a display, and say so: not on Windows, not the editor lab. This
is the same tree, unchanged, on Windows 11 with a display, in a copy of it; the session's own
server runs from the tree's jar, which was not rebuilt.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify` | 179 tests, none skipped: the 15 that the container skipped for lack of a display ran here, the server's window among them. And the 8 of the conformance check on the built jar |
| `npm run check` in `chrome-extension` | 205 tests, with the type-check and the build |
| `cd e2e && node run.mjs` | 102 passed, 0 failed, in Chrome 157. No server of the copy left running |
| `cd e2e/editors && node run.mjs` | 222 of 225 checks, tab in front, no `SILENT`: as before this work |
| `npm audit --audit-level=high`, as the workflow's new job runs it | `chrome-extension` and `e2e`: no vulnerabilities. `e2e/editors`: five, two of them high, in the editors under test, which that job lists and does not fail for |

The server's window with a security policy in force was drawn by its picture tool and looked
at. The tool has no such state: one was added in the copy only, with a blocked site, the
strict profile and a limit to one site. Under *Blocked sites* the line reads
*docs.example.org · security policy in force*, whole, beside **Edit**; the foot says protocol
3. What the line restricts is under the mouse, and that was not looked at.

Not done: the window itself on the desktop; a real agent by hand; the workflows, which run on
GitHub only; the editor lab with the tab in the background. Seen and not changed: the policy
stands under a heading that names blocked sites only, and the picture tool in the repository
still has no state for it.

## Earlier, in one line each

- 2026-11-24, on `claude/tabgoblin-security-features-ncxa9m` (WP-27, workspaces and requests for
  access, in a container on Linux): the server 179 tests, 15 skipped for lack of a display, and
  the 8 of the conformance check; the extension 205; end to end 102 of 102. A clock set back
  had locked an agent out (`RateLimiter`), and was mended.
- 2026-11-24, on `claude/tabgoblin-security-features-ncxa9m` (WP-27, `browser_collect` and
  `browser_hover`, in a container on Linux): the server 176 tests, 15 skipped for lack of a
  display, and the 8 of the conformance check; the extension 200; end to end 101 of 101.
- 2026-11-24, on `claude/tabgoblin-security-features-ncxa9m` (WP-27, security hardening and
  features for developers, its first part, in a container on Linux): the server 174 tests, 15
  skipped for lack of a display, and the 8 of the conformance check; the extension 192; end to
  end 100 of 100 with the container's Chromium.
- 2026-11-23, on `easy-install`, WP-15 (a download, a setup command, a release by a tag): server
  151 tests and 8 conformance tests, extension 161, end to end 95 of 95, and 95 of 95 again on
  the download's own runtime. The download for Windows was made and used on Windows 11 in a
  folder with a space in its name (help, setup, the line for Claude Code in two shells, the
  server and its window); the one for Linux in the Linux subsystem without Java (help, setup,
  the server as an agent starts it), where its window was not seen and a server started with
  `--panel` ended with its terminal. The workflows were read as YAML and not run on GitHub.
- 2026-11-23, on `new-token-each-start` (WP-17, a new pairing token at every start, cut back
  the same day to what helps with a pairing; and WP-23, pictures as SVG, dropped by the owner):
  all suites passed on what stands, by that entry's count; its text is in the history.
- 2026-11-22, on `agent-skills` (WP-22, a skill for the tools for each of three agents): the
  server 134 tests, three of them new in `SkillsTest`, which holds the three texts to one
  another, to the server's tools and to the codes the tool reference knows. None of the three
  was loaded in its agent.
- 2026-11-22, on `smoke-fixes` (WP-21, what the first test on the public repository showed):
  the server 131 tests and the 8 of the conformance check, the extension 161, end to end 95 of
  95; the step on the notice takes six pictures of a page kept busy, each measured against the
  page without the notice.
- 2026-11-22, on `blocked-sites` (WP-20, sites that no agent may work on): the server 126
  tests, 17 of them new, and the 8, the extension 160, end to end 95 of 95 with a new step: a
  second tab on the demo site under `localhost`, the site written into the settings file while
  the server runs, and the tools refused there with `SITE_BLOCKED`.
- 2026-11-22, on `one-server` (WP-19, one server for all agents, and a click on a tab): the
  server 109 tests, 17 of them new, and the 8 of the conformance check through the pipe and the
  server it starts; the extension 156; end to end 94 of 94 with both agents through one server,
  and nothing left listening after the last had gone. Not run with real processes by hand: the
  taking over when the server's process ends, and a process that serves its agent alone.
- 2026-11-22, on `by-hand-panel` (what a server started by hand says, a disconnected agent's
  server left alone, a panel that shows what the agent did): the server 92 tests and the 8, the
  extension 156, end to end 94 of 94; the step that disconnects an agent reads the server's log
  for one disconnect and no pairing after it.
- 2026-11-22, on `restart-keeps-tabs` (a server that is started again has its tabs at once): the
  server 89 tests and the 8, the extension 155, end to end 94 of 94 in a copy of the tree. That
  was by the agent's name; WP-27 replaced it with the agent's key.
- 2026-11-22, on `aftercare` (commands at hand, the pairing token copied, a panel that keeps
  its controls, an extension that shows what is so): the server 88 tests and the 8, the
  extension 154, end to end 94 of 94. The first try of the extension's check stopped at the
  type-check, on a test that ran and did not pass it.
- 2026-11-22, on `docs-pass` (WP-18, part 1, the documentation gone over): the server 84 tests,
  the extension 151, 133 links resolving where there were 91; six pictures of the panel, the
  first byte for byte the documentation's. The installation guide had named 52 tests, and the
  panel's tests had the version written into them.
- 2026-11-22, on `server-panel` (WP-13, the server's panel): a window for the server in JavaFX,
  after one in Swing was turned down by the owner. Server 84 tests and the 8 of the conformance
  check; end to end 94 of 94, four times. By hand on Windows 11: the window on Java 21 and on
  Java 26, its controls pressed through the accessibility interface, its icon, the log's view,
  and the switch with the real extension. In Ubuntu under the Linux subsystem the window drew
  once it had the system's frame; a see-through one had been there and drawn nothing, which the
  owner saw first. Three captures of a place on the screen showed other windows of the owner's
  desktop and were deleted; the screen has not been pictured for this since.
- 2026-11-22, on `ci-tab-address` (CI for the day's merges, and the step that failed in run
  #12): read on GitHub through TabGoblin, runs #11 and #13 passed and #12 failed in one
  end-to-end step, which asked the suite's driver for the tab's address right after the tools'
  answers and got the page before. Three steps that ask that way now wait up to five seconds
  for the address. The suite passed with them, 94 of 94; the failure itself never came up on
  this machine, so the run shows that the fix breaks nothing, not that it mends the step.
- 2026-11-22, on `notice-box` (WP-11, the notice in the page: a bar, and pills of what ended):
  the extension's check passed with 151 tests, twelve of them new, and the suite end to end with
  94, in the third of five full runs to pass. The notice was drawn in 31 states and looked at,
  and went through three forms on the owner's word: a plain box, the popup's colours with the
  goblin, then two panes, which cover about a third less. `indicator.png` was made anew from a
  capture of the real notice in a real tab.
- 2026-11-22, on `disconnect-revokes` (WP-10, Disconnect ends the agent's sessions): the
  extension's check passed with 139 tests and the suite end to end with 93, in a copy of the
  tree. Shown against the source as it was: an agent with a tab is disconnected and a second
  server of the same name asks for a snapshot in that session; before, `ok` with the page;
  after, `UNKNOWN_SESSION` and no session left. The popup was pictured in 64 states and the
  three pictures of the Agents panel in `docs/images` were renewed. Not run: the server's
  suites, since no Java source changed, and the editor lab.
- 2026-11-22, on `nothing-personal` (WP-14, the files and the check): no product code changed;
  four examples in the documentation, and a check that reads the files for home directories,
  mail addresses outside the example domains and links to sessions, with 5 tests and a job in
  CI. It read 121 files and found nothing; with a home directory planted in two places it gave
  2 findings, each with file and line and without the text. All thirteen pictures in
  `docs/images` were opened and held nothing personal. The history and the address of commits
  were left to the owner. Not run: the suites, since nothing they cover changed; the new job on
  GitHub.
- 2026-11-21, on `ci-failures` (the CI failures of runs #7 and #8, read on GitHub through
  TabGoblin): the server sent `auth_ok` before it took the connection for its paired one, so a
  tool call right behind the pairing could be refused; an agent's name given during a pairing
  could be lost; and an end-to-end step read the names in the popup too early. Shown against
  the unfixed source by two tests that pair 200 times each, which failed in every one of seven
  runs, and by the suite with the second agent's first call held back. After the fix: server
  64 tests and 8 conformance tests, also held to one and two cores; end to end 93 of 93. Which
  of two causes failed the step in run #8 is not known. Not shown: the failures of
  `BrowserServiceTest` themselves, which passed in every local run.
- 2026-11-21, on `folding-panels` (Sessions, Activity, Agents and Settings fold to one line
  each): extension 136 tests; end to end 93 of 93, with a step that folds all four and finds
  them folded when the popup opens again; editor lab 222 and 220 of 225, no `SILENT`; eleven
  of the documentation's pictures, one new, all opened. Found by the suite: a key on its way
  to the page folded a panel the instant a prompt appeared; the rest of the popup takes no key
  or click for that moment now. The commit was first made on `main` and moved; the rule in
  `AGENTS.md` that makes the commit refuse comes from that. Not run: the server's suites, the
  Linux container. Not tried: folding with the keyboard by hand, a screen reader.
- 2026-11-21, on `pairing-race`, the look of the popup (a pass for alignment: headings and
  their actions on one baseline, settings with a heading, a session's chips under its address
  where they do not fit beside it): extension 132 tests; end to end 92 of 92; editor lab 222
  and 220 of 225, no `SILENT`, run before the last change; ten of the documentation's pictures
  changed, all opened. One run of the picture script timed out waiting for the agents and
  passed when run again. Not looked at: an address too long for its line, another zoom level.
- 2026-11-21, on `pairing-race`, WP-9 (the status tool says where the time of the last calls
  went): server 62 tests and 8 conformance tests, 70 in a Linux container; extension 132, also
  in a container; end to end 92 of 92, with a step that lets the user wait 1.5 s and reads the
  report; editor lab 222 of 225 in front and 220 of 225 in the background, no `SILENT`. Two
  worker tests failed in the first run over a command id used twice. Not shown: the report with
  a real agent and model, and an older extension against this server.
- 2026-11-21, on `pairing-race`, the box that names what the user declined ("You declined
  Enter in “Comment”"): extension 131 tests, also in a Linux container; end to end 91 of 91,
  the box read for a declined click and a declined Enter; editor lab 222 of 225 in front and
  220 of 225 in the background, no `SILENT`; 28 pictures of the prompt, the declined box
  looked at in both colour schemes. The server's suites were not run.
- 2026-11-21, on `pairing-race`, the first CI failure a session saw (the "Chrome extension"
  job, cancelled at its 15-minute limit): a message that arrived while the extension still
  checked the proof in `auth_ok` was taken for a failed pairing. Shown against the unfixed
  source with a copy of the worker's test that starts early and with a new test; not shown with
  the test file as it was. After the fix: extension 131 tests, twice more in a Linux container;
  server 55 tests and 8 conformance tests, 63 in a container; end to end 91 of 91; editor lab
  222 of 225 in front and 220 of 225 in the background, no `SILENT`. Not shown then: the job
  passing on GitHub.
- 2026-11-21, on `automatic-mode`, WP-8 (the status tool names a session that asks differently;
  the popup names the kind of request that passes): server 55 tests and 8 conformance tests,
  extension 130, end to end 91 of 91, editor lab 222 of 225 in front and 220 of 225 in the
  background, no `SILENT`; 28 pictures of the prompt, three looked at. Three of the
  documentation's pictures came out different in the agents' ports and were put back unopened.
- 2026-11-21, on `automatic-mode`, after WP-7 (the prompt says when an Allow will stand; a
  control without a name is never remembered): extension 130 tests, end to end 91 of 91, editor
  lab 222 of 225 in front and 220 of 225 in the background, no `SILENT`; 26 pictures of the
  prompt, five looked at. The server's suites were not run. Not tried: a control without a name
  in the automatic mode in a real browser. CI on GitHub not seen.
- 2026-11-21, on `automatic-mode`, WP-7 (the automatic mode for confirmations): server 54 tests
  and 8 conformance tests, extension 129, end to end 91 of 91, editor lab 222 of 225 in front and
  220 of 225 in the background, no `SILENT`; 24 pictures of 12 views, not all of them opened. Not
  tried then, and tried in the entry after it: an Allow that ends when the tab leaves the site,
  and the limit of five a minute in a real browser. CI on GitHub not seen.
- 2026-11-21, on `confirmations`, WP-4, WP-5 and WP-6: server 54 tests and 8 conformance tests,
  extension 127, end to end 90 of 90, editor lab 222 of 225 in front and 220 of 225 in the
  background, no `SILENT`; 16 pictures of the prompt looked at. Found by the lab and fixed: one
  code editor's Enter was judged a confirmed submission. CI on GitHub not seen.
- 2026-11-21, on `mcp-standard`, WP-1 complete (a cancelled call is not answered, progress,
  structured results): server 54 tests and 8 conformance tests, end to end 87 of 87, editor lab
  222 of 225 in front and 220 of 225 in the background, no `SILENT`. The extension's tests were
  not run; Ctrl+C on a running server, a real client and the MCP Inspector were not tried.
- 2026-11-21, on `mcp-standard`, WP-1, first part (the conformance check): server 54 tests and 6
  conformance tests, end to end 87 of 87. By hand: `server/discover` answered with `-32601`, a
  mistyped option exits with 2. The extension's tests and the editor lab were not run.
- 2026-11-21, on `typed-lines`, WP-3 (a prompt that cannot be answered by accident): extension
  120 tests, end to end 87 of 87, four pictures of the prompt looked at.
- 2026-11-21, on `typed-lines`, third commit (the look of the confirmation prompt): 20 pictures of
  the prompt looked at, three defects fixed; extension 120 tests, end to end 86 of 86. The server
  and the editor lab were not run again.
- 2026-11-21, on `typed-lines`, second commit (Enter in a text box is a submission): server 52
  tests, extension 119, end to end 86 of 86, editor lab 222 of 225 in front and 220 of 225 in the
  background, no `SILENT`. CI on GitHub not seen.
- 2026-11-21, on `typed-lines`, first commit (a fill never presses Enter): server 52 tests,
  extension 112, end to end 83 of 83, editor lab 222 of 225 in front and 220 of 225 in the
  background, no `SILENT`. CI on GitHub not seen.
- 2026-11-21, `29fea3e` on `editor-keys`: server 52 tests, extension 110, end to end 82 of 82,
  editor lab 222 of 225 in front and 220 of 225 in the background, no `SILENT`. CI on GitHub not
  seen.
- 2026-11-21, `0591970` on `editor-compatibility`: server 52 tests, extension 105, end to end 81
  of 81, editor lab 222 of 225 in front and 219 of 225 in the background with two `SILENT` cells
  (Enter in two editors, known then, fixed since). CI on GitHub not seen.
