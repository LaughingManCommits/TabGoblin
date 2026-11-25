# Validation log

Newest first. One entry per session that verified something. Not part of the startup read.
When this passes about ten entries, fold the oldest into one summary line.

## 2026-11-25, working tree from `52143a5`: panel controls, CLI skills and MCP test-client exit handling

On Windows with JDK 21, the four focused server suites passed 67 tests. Maven packaged the final jar in a copy with all 218 server tests passing and none skipped. The panel test copied a custom first port with no agents present using a test clipboard. The 19 panel pictures were rendered and inspected. Documentation links and the personal-information checks passed. The extension and browser end-to-end suites were not run.

With collapsible sections added, the focused suites passed 68 tests. On Windows, Maven packaged the jar with 219 tests passing and none skipped. The JavaFX test folded each section, refreshed the view and reopened it. All 19 panel pictures were inspected and the guide picture was refreshed. Other platforms and the browser suites were not exercised for this change.

The three CLI skills now carry the custom first port through browser commands and include a failed-build investigation. All 9 SkillsTest checks passed, followed by all 219 server tests during packaging. Each CLI skill in the built jar matched its source byte for byte. Documentation link and personal-information checks passed. The browser suites were not rerun for the skill edits.

The MCP test client's three child-process regression tests failed against the previous client and passed with the fix. The Windows Chrome end-to-end suite passed 109 of 109, including cancellation, agent restart and session recovery, with server diagnostics enabled. The extension type-check, all 213 tests and the build passed. The original intermittent popup timeout did not occur in this run. The Java server suite was not repeated for these harness edits.

After moving the first-port control to the header, 68 focused tests and all 219 server tests passed on Windows. The header copy test covered a custom port before connection. The 19 panel renders were inspected and the guide picture refreshed. Browser suites were not rerun for this display change.

After a review of the branch, on `smoke-tests` from `8f47982`: the MCP test client settles what waits when the child's output is closed, not at its exit, leaves a failed write to that, and a call that a step has not awaited yet fails there and not the run. Its 6 tests passed, three of them new. The panel's factories for a list of agents name the link port they take, and the tests that gave them an agent's port give the link port and assert the first port. On Windows with JDK 21, `mvn test` in the tree passed 219 server tests with none skipped. The personal-information check passed. Not run: the browser end-to-end suite, which uses this client, and a build of the jar.

The command line by hand, the same day, on Windows 11 with JDK 21: the jar of the tree, the owner's server on a port given with `--port`, the owner's Chrome with the real extension, and a tab on a public site that the owner authorized with Explore for an agent of the command line. Passed: `tools`, `tools --json` (14 tools), `--help` of a command; `status`, `request-access`, `snapshot`, `extract` with `--outline` and with `--find`, `scroll`, `screenshot --out` (the picture opened and looked at), `wait-for`, `hover`, a click on a link by the tool's own name with `--session`, `press-key`, `navigate --history back`, `collect` with `--args-file`, `extract` with `--args -` and the name from `BCMCP_AGENT`. Refused as they should be: no `--agent`, an unknown argument and a missing one (exit 2); `fill` and Enter under Explore, another origin, a stale ref, an unknown session, a wait that ran out (exit 1). Every answer was one line of JSON. **One fault:** `navigate --url` to another page of that site answered `no-change` with the address before and `redirected: true`, twice of three times, while the tab had gone where it was sent. Not tried: Write, `submit`, exit codes 3 and 4, `tabgoblin.cmd`, and an agent with the skill.

The end-to-end suite then passed with the changed test client, 109 of 109, in Chrome on Windows against the tree's jar. After the mend of `navigate` (a load that has to come is waited for, where the tab was taken to have stayed after a second and a half): the extension's check passed, 214 tests with the type-check and the build, one test new, a site that answers after two seconds; and the suite passed 110 of 110, one step new, a demo page that is sent after two and a half seconds. Links and the personal-information check passed. Not done: the new step run against the code before the mend; the mend seen on the public site where the fault was found, which needs the owner's Chrome to load the extension again; and an address that gives no page, which now answers after 20 seconds.

Seen on that site after the owner loaded the extension again: `navigate --url` to two other pages answered `new-document` with the new address, one of them after 2.6 seconds, where it had said `no-change`. The address the tab was already at still answered `no-change` after a second and a half: asked for again it is loaded again, and that was not waited for. Mended as well, with a case in the unit test; the extension's check passed, 214 tests. That last mend has not been seen on the site. The suite passed with it, 110 of 110.

Whose a tab is, said to the user, after the owner found that a tab given to *Any agent* was closed to the agent of the command line once another agent had used it: the popup's row reads `Owner: <agent>`, or that the tab has no owner yet, and in the server's window a tab's row has `owner: <agent>` where several agents are connected. No tool's text changed. The server's 219 tests and the extension's 214 passed. The window's 19 pictures were drawn and the one with two agents looked at; the 13 pictures of the documentation were made anew with a visible Chrome and each opened. The end-to-end suite then passed with the popup's new words, 110 of 110.

## 2026-11-25, on `ccr-6350ba03-tntbzp` from `cf9bbca`: a last review of the documentation, and the reference renamed

Narrow in scope. The reference is `docs/tool-reference.md`; the old name is a pointer.

| Command | Result |
|---|---|
| `mvn -q test -Dtest='SkillsTest,ToolReferenceTest'` in `java-server` | 11 tests pass, reading the reference by its new name |
| `node docs/agents/check-links.mjs`, `node docs/agents/check-personal.mjs` | Pass |
| Every `tabgoblin` command line of the documentation, given to the built jar with `--help` | 22 understood. The one that was not is a message of a diagram, with a remark in brackets behind the command |
| Every option the documentation gives the program itself (`--setup`, `--mode`, …) | Each is one that `McpMain.Options` reads |
| `node docs/assets/diagrams/build.mjs` | Writes the four files as they are committed: no difference |

The four SVG diagrams were shown in the container's Chromium at the width of GitHub's text
column, on GitHub's white and on its dark ground with the system set to match, and all eight
pictures were opened: nothing is cut off, no label is crossed by a line, and the text is
readable in both. Not seen on GitHub itself, nor in IntelliJ.

Not run: the rest of the server's tests, the extension's, the end-to-end suite. No source of
the product was changed; two tests had the reference's path changed.

## 2026-11-25, on `ccr-6350ba03-tntbzp` from `402aaf8`: WP-30, the documentation for two interfaces

Documentation only. Every command and option that the new and the changed pages name was
checked against the built jar or against the source: `tools`, `tools --json` and its fields,
`click --help`, the exit codes, the 150 and 95 seconds, the ten minutes and their variable,
`--setup` and `--install-skill` with `--mode cli`, and what an MCP agent gets when its name is
kept for the CLI (`Hub.identify`).

| Command | Result |
|---|---|
| `node docs/agents/check-links.mjs` | All links resolve, the new page's among them |
| `node docs/agents/check-personal.mjs` | Nothing personal found |
| `mvn -q test -Dtest='SkillsTest,ToolReferenceTest,McpMainTest,SetupTest'` in `java-server` | Pass: the two that read the tool reference still find every tool, argument and code in it |

A last review the same day, documentation only again. Every `tabgoblin` command line that the
documentation shows, 24 of them, was given to the built jar with `--help` behind it, which
reads the arguments against the tools' schemas and sends nothing: all were understood. What
the pages say about approvals was held against `needsAsking` and `askUnder` in `policy.ts`,
and three statements were found to say more than the code does; they are in WP-30's entry.
The two checks passed again.

The diagrams, the same day: all twelve Mermaid diagrams of the Markdown files were drawn with
Mermaid 11 in the container's Chromium, each on a light and on a dark ground, 24 pictures, none
failed; five were opened and looked at (the README's, the architecture's components on dark,
the security model's, the corporate assessment's, the CLI's). The first drawing of the
components had a label cut by a box and was made simpler. The pictures were not kept. Not
seen: the same diagrams as GitHub draws them, whose Mermaid may be of another version.

The four SVG diagrams, the same day: each was drawn by `node docs/assets/diagrams/build.mjs`,
shown as an image in the container's Chromium on a white and on a dark ground, and looked at,
both variants of the overview and one or both of the others. Three rounds: labels that ran
out of their boxes, a popup drawn outside the extension it belongs to, and a legend cut off
at the lower edge were mended. Every file a page names exists. Not seen on GitHub.

Every diagram looked at, the same day, on the owner's word to look with a critical eye, after
a semicolon in a label had drawn three stray states that no earlier look had caught: the four
SVG files on a light and a dark ground and all eight Mermaid diagrams. Found and mended: two
container labels crossed by a connector; the coding agent and the result drawn outside the
box that stands for the one account they run in; a dashed border on a check that is no
boundary; four Mermaid notes and labels longer than their place. Left as it is: the session's
state diagram, whose labels lie on its lines as Mermaid sets them.

Not run: the rest of the server's tests, the extension's and the end-to-end suite, since no
code was changed. Not seen: the changed pages and their two changed pictures as GitHub draws
them. No picture was regenerated.

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

Then the skills' folder was split in two, `skills/mcp` and `skills/cli`: `mvn verify` again,
226 tests with one new in `SkillsTest`, and the built jar installed the skill for MCP and the
one for the command line into a home folder made for the purpose.

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
| `mvn -f java-server/pom.xml test` | 186 tests, 15 skipped (the window's tests, without a display). Two are new, `ToolReferenceTest`: every tool of the server has its heading in `docs/tool-reference.md` and no other tool has one, and every argument of a tool's schema is named in that tool's section |
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

## Earlier, in one line each

- 2026-11-24, Windows at `8b7656d` and Linux at `9b287f0`: Windows reserved the default port range. The panel explained the bind failure. Both server suites passed 184 tests, Linux also passed 8 conformance and 102 end-to-end checks. A live Windows smoke test covered Explore, submission confirmation and access refusals.

- 2026-11-24, on `claude/tabgoblin-security-features-ncxa9m` (the server's window names a
  security policy; under `xvfb-run` in a container): the server 179 tests with none skipped,
  the 15 of `PanelTest` among them, and the 8 of the conformance check; nineteen pictures of
  the panel, two of them new and looked at.
- 2026-11-24, on `claude/tabgoblin-security-features-ncxa9m` at `41248d7` (WP-27 on Windows,
  and the editor lab): the suites passed on Windows 11 as they had in the container; the
  editor lab was run in front and in the background.
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
