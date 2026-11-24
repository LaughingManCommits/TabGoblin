# Validation log

Newest first. One entry per session that verified something. Not part of the startup read.
When this passes about ten entries, fold the oldest into one summary line.

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

## 2026-11-24, on `claude/tabgoblin-security-features-ncxa9m`: WP-27, workspaces and requests for access

On the owner's "continue with p2", after the two entries below. Workspaces, a fourteenth tool,
`browser_request_access`, and the security policy in the model of the server's window. In the
same container. Pushed to that branch, as the owner said for it; nothing to `main`.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify` | 179 tests, 15 skipped for lack of a display, and the 8 of the conformance check, which counts fourteen tools and nine that give an object |
| `npm run check` in `chrome-extension` | 205 tests, with the type-check and the build. Five are new: the rules for a workspace's name and for a request, a clock that is set back, and the two in the worker |
| `cd e2e && node run.mjs` | 102 passed, 0 failed. One step is new; it drives the real popup: a request declined, one allowed, a tab on another site given by the click on that tab with the request offered there, a workspace's two buttons |
| `node docs/agents/check-links.mjs`, `node docs/agents/check-personal.mjs` | all links resolve; nothing personal found |

A picture of the popup with a request in it was taken in that step and looked at: the card says
who asks, for which level, in which session and on which site, the agent's reason in quotation
marks, and has Deny before Allow. The field for a workspace had the browser's own look in the
first picture and was given the popup's.

Found on the way, and mended: an agent was locked out for as long as the system's clock had
been set back, because its allowance per second was reckoned with the time that had passed,
which was then less than none (`RateLimiter` in `policy.ts`). A test moved the clock and showed
it.

Afterwards, on the owner's word that a request should open the popup as a question about a
submission does: the worker brings the popup up for a request that is put to the user, and
for none that is refused; a request that has only just appeared takes no answer for 0.7
seconds, with the rest of the popup held for that moment, and Deny before Allow. `npm run
check`: 205 tests. `node run.mjs`: 102 passed, 0 failed; in it the popup came up by itself in
the container's Chromium, a click on Allow in the first moment did nothing, and the suite's
own clicks had to wait for the moment to pass, in two places. The server was not changed by it.

Not run: Windows; the editor lab; the workflows; the server's window, whose new line is in its
model and its test only; a real agent by hand.

## 2026-11-24, on `claude/tabgoblin-security-features-ncxa9m`: WP-27, collecting and hovering

On the owner's "continue with p1", after the entry below. Two tools, `browser_collect` and
`browser_hover`: thirteen now. In the same container. Pushed to that branch on the owner's word.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify` | 176 tests, 15 skipped for lack of a display, and the 8 of the conformance check, which counts thirteen tools and eight that give an object |
| `npm run check` in `chrome-extension` | 200 tests, with the type-check and the build. Eight are new: what of a further reading is new, hover, the control to a next page, and collecting in the worker |
| `cd e2e && node run.mjs` | 101 passed, 0 failed. One step is new, on two new pages of demo site A |
| `node docs/agents/check-links.mjs`, `node docs/agents/check-personal.mjs` | all links resolve; nothing personal found |

Measured in the real browser, on the demo's feed of sixty events that shows twenty at a time:
one call of `browser_collect` returned all sixty, each once, in 6 readings and 2.1 seconds;
the same with `find: "ERROR"` returned the two that failed with a line of context, in about a
quarter of the characters. A list that draws nine rows of two hundred came back in order and
without a row twice, over two calls of twenty steps. Three pages of a list: 19 lines in 3
readings, 0.5 seconds.

Found on the way: the count of readings in the result's first line was one too many where the
last step found no further page. And, on the owner's word about standards, the new Java was gone
over: the access level is an enum and no longer three strings, the record on disk is written
with the JSON library and no longer by hand, and qualified names in the new classes became
imports.

Not run: Windows; the editor lab; the workflows; a real agent by hand.

## 2026-11-24, on `claude/tabgoblin-security-features-ncxa9m`: WP-27, security hardening and features for developers

Asked for by the owner as a list of fourteen points. Made from `a06b0ce`. In a container in the
cloud: Linux, Java 21, Node 22 (the runbook asks for 24), and the container's Chromium, build
1243, started without its sandbox because the container runs as root. Committed on that
branch by the session; nothing went to `main`.

Before anything was changed, the same three suites on `a06b0ce`: 151 Java tests, 161 of the
extension, 95 steps end to end, all passing.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify` | 174 tests, 15 of them skipped for lack of a display (the panel's), and the 8 of the conformance check on the built jar. 23 are new |
| `npm run check` in `chrome-extension` | 192 tests, with the type-check and the build. 31 are new. The limit for one test file went from 60 to 120 seconds: the worker's file takes about 60 |
| `cd e2e && node run.mjs`, with `BCMCP_CHROME` set to a script that starts the container's Chromium with `--no-sandbox` | 100 passed, 0 failed. Five steps are new, and one was widened: an agent that only has the owner's name |
| `npm audit --audit-level=high` in `chrome-extension` and in `e2e` | 0 vulnerabilities |
| `npm audit --audit-level=high` in `e2e/editors` | 5 advisories, 2 of them high, in fixed versions of editors under test. The CI job lists them and does not fail |
| `mvn org.cyclonedx:cyclonedx-maven-plugin:2.9.1:makeBom`, and `npm sbom --sbom-format cyclonedx` | a CycloneDX 1.6 file with 24 components for the server, one with 39 for the extension's build tools |
| both workflow files read as YAML | well-formed; the jobs are named as the pages say |
| `node docs/agents/check-links.mjs`, `node docs/agents/check-personal.mjs` | all links resolve; nothing personal found |

What the new tests are about, by where they run:

- **Java:** a process that knows the pairing token and not an agent's key; a key held by two
  processes; revoking and allowing; the key's file, id and proofs; the policy read from the
  file, a value that cannot be read, the strict profile's defaults; refusals before anything is
  sent; what the status says and does not say; the record on disk.
- **Rules and worker:** a name that gives nothing, with the owner away and there; the policy at
  the moment of a command, each of its lines; a change between two steps of one command (the
  tab on another site, the time run out, a pause, a revocation, a lower level, a disconnected
  agent); an approval used once, and content that changed after the question; twenty commands
  waiting for a tab; a frame of another site in view; redaction, and its time on a megabyte.
- **Real browser:** an agent without a key under the owner's name; content changed while the
  prompt is open; redaction in a snapshot and an extract; a picture refused with a frame in
  view and taken without; the settings file's policy in force without a restart; `find` on a
  log of 4,019 lines.

Measured, in the extension's tests under jsdom, on the demo's build log (317,613 characters in
4,019 lines): read whole it is 27 results with 326,668 characters; `find: "ERROR"` with four
lines of context is one result with 2,759 characters, with all three errors and their stack
traces. And, natively, why search does not use the browser's regular expressions: `.*.*.*x`
took 37 seconds on one line of 1,000 characters; the automaton takes 1 to 3 milliseconds on
2,000.

Found on the way and mended: the first form of the check on changed content compared after the
agent's own fills, and refused a form with a group of choices, because filling one choice
unchecks another; it compares before the fills now. And `HubTest` kept its clients in a list
that two threads wrote.

Not run: Windows; the editor lab; the two workflows on GitHub; the server's window; `screenshots.mjs`,
so the documentation's pictures are as they were, and do not show the policy line that the
popup has when a policy is set; a real agent with a real extension by hand; the download.

## 2026-11-23, on `easy-install`: WP-15, a download, a setup command, and a release by a tag

The owner decided that there will be no Chrome Web Store, ever, and then: "okay lets build wp 15
with the cd release". Made from `new-token-each-start`. Committed on the owner's word; not
pushed.

In a copy of the tree, with a jar and an extension built there; the session's own server runs
from the tree's jar, which was not rebuilt.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify` | 151 tests, and the 8 of the conformance check on the built jar. Five of the 151 are new for this: four of setup, one of the help |
| `npm run check` in `chrome-extension` | 161 tests, with the type-check and the build |
| `cd e2e && node run.mjs` | 95 passed, 0 failed. No server of the copy left running |
| `bash release/bundle.sh`, on Windows 11 with a JDK 26 | `tabgoblin-0.2.0-windows-x64.zip`, 48.5 MB; 67 MB unpacked. With a tag that is not the version it makes nothing and ends with 1 |
| `cd e2e && node run.mjs`, with the download's `runtime/bin` first on the path | 95 passed, 0 failed, on a jar that is byte for byte the download's. `java` was the download's, for the shell and for Node |
| `bash release/bundle.sh`, in Ubuntu under Windows' Linux subsystem, with a JDK 21 fetched for the making | `tabgoblin-0.2.0-linux-x64.tar.gz`, 51.3 MB |
| both workflow files read as YAML | well-formed; the release calls the suites, makes three downloads after them, and publishes only for a tag, as the one job that may write |
| `node docs/agents/check-links.mjs`, `node docs/agents/check-personal.mjs` | all links resolve; nothing personal found |

The download for Windows, unpacked into a folder with a space in its name:

- `tabgoblin --help` prints the help, with the line that says what the command stands for.
- `tabgoblin --setup claude-code` and `--setup copilot`, with a home folder made for the purpose:
  the skill was put there; the line for the agent, the extension's folder and the command for
  the window were printed with the download's own paths, each in quotes; asked again, it said
  that the skill was there already.
- The line for Claude Code was run with the real tool, in Command Prompt and in PowerShell,
  against a configuration made for the purpose, and what it stored was read: the Java of the
  download as the command, its path whole with the space in it, and `-jar` with the jar.
- Started as an agent's program starts it, on the runtime that is inside: the server came up,
  and its window after a browser had come with another token, read through UI Automation.

The download for Linux, in the Linux subsystem, where there is no Java: the help; setup for
Codex, which put both files of that skill in place; and the server as an agent starts it,
which answered `initialize` and a `browser_status`. Its window: the server's log said `panel
shown`, and the window was not found by a look from either system, so it counts as not seen.
A server started with `tabgoblin --panel` in a terminal made up for the purpose was gone once
that terminal had closed.

What went wrong on the way, and is worth knowing:

- **The first run of the suite "on the download's runtime" was not on it.** The path was given
  in the form Windows writes, which the shell did not take, and the suite ran on the system's
  Java. Its own first line showed it. The run was thrown away and done again, and its record
  now names the Java the shell and Node each found.
- **Counts of windows in the Linux subsystem meant nothing:** the tools that list them are not
  installed there, and their errors were hidden. Nothing was installed.
- **A line passed from one shell into another lost its quotes,** which looked like a fault of
  the line for Claude Code in Command Prompt. Run from a file of that shell, the line is right.

Read on GitHub afterwards, through TabGoblin, on a tab the owner authorized with Explore, once
the owner had merged and started the workflow by hand:

- Run #1 of *Release*, on `83aea15`: succeeded in 7m 37s. *Java server* 1m 19s, *Chrome
  extension* 59s, *Nothing personal* 14s, *End to end* 4m 22s, *Editors* 5m 47s; the three
  downloads; *Publish* skipped.
- The job for Windows, 1m 34s, and the one for macOS, 36s, each say the six modules and *Made*
  with the download's name. On macOS that is the first time the script ran, and it starts the
  server on the runtime it made before it packs.
- Kept with the run: `tabgoblin-windows-x64` 47.9 MB, `tabgoblin-linux-x64` 51.1 MB,
  `tabgoblin-macos-arm64` 47.1 MB.
- CI run #22, for the merge itself, was cancelled after 5m 25s, with *Canceling since a higher
  priority waiting request for ci-refs/heads/main exists*: the release's suites took its
  place. On `release-keeps-ci` the group is named after the workflow as well. Both workflow
  files were read as YAML again; the change has not run on GitHub.

Later that day the owner merged that change and pushed the tag `v0.2.0`. Read from GitHub,
without signing in, since the repository is public:

- Run #2 of *Release*, for the tag, on `fde041c`: completed, success.
- The release *TabGoblin 0.2.0*, published at 18:10 UTC, neither a draft nor a prerelease, with
  `tabgoblin-0.2.0-windows-x64.zip` 47.9 MB, `tabgoblin-0.2.0-linux-x64.tar.gz` 51.3 MB,
  `tabgoblin-0.2.0-macos-arm64.tar.gz` 47.1 MB and `SHA256SUMS.txt`, which has a line for
  each of the three. Its notes begin as `release/notes.md` does.
- GitHub holds one attestation for the digest of the Windows download, as `SHA256SUMS.txt`
  gives it.
- CI run #23, for the merge of the change to the groups, passed. That does not show the
  change: the release ran for the tag, which was never in the CI's group.

Not done: a download of the release taken and used, on any system; `gh attestation verify`
run against one; the two other attestations asked for. Not run: the lines for Codex and for Copilot; neither agent is on this
machine. Not done: the acceptance as the package has it, a person following the page on a
machine with nothing installed, with the minutes counted. Not run on this tree: the editor lab;
its files are as on `main`.

## 2026-11-23, on `new-token-each-start`: WP-17, built, and cut back to what helps with a pairing

Three things happened on this day, and the entry says what stands at its end.

1. WP-23, the documentation's pictures as SVG, was built and committed on a branch. The owner
   pushed it and looked from the network it was for: the proxy there holds back SVG as well,
   by the owner's report. The owner deleted the branch. Nothing of it is in `main`. What the
   block page names was not read.
2. WP-17 was built as the owner decided it: a new pairing token at every start of a server.
   Committed on the owner's word. All suites passed on it: the server's 148 tests and the 8 of
   the conformance check, the extension's 161, 97 steps end to end, the editor lab with 222 of
   225; and the real window was read by hand.
3. Asked whether it had been a necessary feature, the session said no: the token has to stay
   in its file for the agents' processes, so a new one at every start keeps out no program
   that runs as the user, and it costs a pairing at every start. The owner had it taken out
   and kept the rest. Committed on the owner's word, as a second commit; not pushed.

What follows is of the third, the tree as it is. All of it in a copy of the tree, with a jar
and an extension built there; the session's own server runs from the tree's jar, which was not
rebuilt.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify` | 146 tests, and the 8 of the conformance check on the built jar. Ten of the 146 are new against `main` |
| `npm run check` in `chrome-extension` | 161 tests, with the type-check and the build |
| `cd e2e && node run.mjs` | 95 passed, 0 failed: the steps there were, three of them with more in them. No server of the copy left running |
| `node docs/agents/check-links.mjs`, `node docs/agents/check-personal.mjs` | all links resolve; nothing personal found |

What the changed steps of the suite show, with the real jar, real Chrome and the real popup:

- With no browser, the status says that a paired extension finds the server within half a
  minute and what to do if it is not paired, names `--show-token`, and says nothing of a token
  that is held.
- A wrong token pasted into the popup is not taken. The popup says *Paste the server's current
  token to connect*, and its dot is amber and not red. The status then says that the browser
  holds a token that is not the server's and what the user has to do, and names no token.
- After a rotation the agent is told the same, and not that the browser is paired by way of
  the other agent, whose pairing on the old token is still open at that moment.

By hand, with the built jar started as an agent's program does, on ports and a token file of
its own, and the window read through UI Automation, with no part of the screen captured:

- A token written to the file before the start is the server's after it: it is kept.
- With no browser, `browser_status` brings no window up.
- A program that connects as an extension and answers the challenge with a proof that is none
  is closed with 4401. The next `browser_status` says that the browser holds another token and
  that the window is open; the window is there, with *Not paired: the browser has another
  token*, *Pair the browser with this server* and the button *Copy token*. The token is in no
  word of the window and not in the status.
- With `--no-panel` no window comes, and the status names `--show-token`.
- When the agent's process ended, the server and its window were gone.

The buttons that copy the token were not pressed: they write to the clipboard of the machine.

Looked at, each opened: the window's states as its picture tool draws them, seventeen now. The
pairing box is in the new one, where a browser came with another token, and in no other: not
where no browser has come, not where the server has no port, not where it is switched off. The
picture of the first state is byte for byte `docs/images/server-panel.png` as it is on `main`.
The popup before pairing and after a refused token, captured from the real popup: the text
fits. `docs/images/popup-pairing.png` is new; the other pictures show nothing that changed.

Not run on the tree as it is: the editor lab; its files are as on `main`. Not tried: Linux and
macOS; the owner's own extension after a real rotation; an extension from before this change
against this server, with real parts.

## Earlier, in one line each

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
