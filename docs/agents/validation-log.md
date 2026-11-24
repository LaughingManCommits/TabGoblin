# Validation log

Newest first. One entry per session that verified something. Not part of the startup read.
When this passes about ten entries, fold the oldest into one summary line.

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

## 2026-11-22, on `agent-skills`: WP-22, a skill for the tools for each of three agents

The owner asked for a folder of skills for Claude Code, Codex and Copilot, "to standards", if it
adds value; and, asked how, chose three separate skills over one for all. Committed on the
owner's word; not pushed.

No product code changed. What was added: `skills/` with three skills and a page on where each
goes, one test, and the pages that point to them.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml test`, in the tree | 134 tests, 3 of them new (`SkillsTest`): the three are the same from "Start with the status" on; each names the server's eleven tools and no other; each names only codes the tool reference sets in code; the front matter has a name that is the folder's and a description within the format's limit |
| `node docs/agents/check-links.mjs`, `node docs/agents/check-personal.mjs` | all links resolve; nothing personal found |

Read, not tried: the format (agentskills.io), and where Claude Code, Codex and Copilot look for
skills and which fields of their own they take, from each one's documentation on 2026-11-22.
Two of those pages had moved; one was read at its new address. How a local server is added to
Codex and to Copilot could not be read that day, and the skills do not say it.

Not run for the skills alone: the jar's build and the conformance check, the extension's check,
the suite end to end and the editor lab; nothing they cover had changed. Not tried: any of the
three skills in its agent.

**Then, on the owner's word, the command that installs one.** The owner agreed that a skill
helps only who has it, and chose to have the jar put it in place: `--install-skill claude-code`,
`codex` or `copilot`. The build takes the three skills into the jar. Committed on the owner's
word; not pushed.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify`, in a copy of the tree | 136 tests, 2 more of the skills: the jar's files are the repository's, file for file; a skill goes to its agent's place below the home folder, is not written twice, and one that is there and is not this one is left alone unless the user says to replace it. And the 8 of the conformance check on the built jar |
| `cd chrome-extension && npm run check`, in the copy | type-check clean, 161 tests, build |
| `cd e2e && npm test`, in the copy | 95 passed, 0 failed |
| `mvn -B -f java-server/pom.xml test`, in the tree, after one word of a message was changed | 136 tests |

With the jar built in the copy, against a home folder made for the purpose and removed again:
each of the three skills was written to its place, and each was the repository's, compared
file by file; run again, nothing was written; with the Claude Code skill's file changed by
hand, the command left it as it was and ended with code 1; with `--replace` it was
overwritten; an agent's name for which there is no skill ended with code 2 and the help.
Mended by reading its own answer: the first line said "Put the skill in …", which reads as
something the user is asked to do; it says "Installed" now. The owner's own home folder was
not written to.

Failed on the way: the build file, once. A comment in it named the option, and two dashes end
a comment there; no test had run until it was reworded.

## 2026-11-22, on `smoke-fixes`: WP-21, what the first test on the public repository showed

The owner made the repository public and asked for a basic test through TabGoblin with Explore
access; then showed a picture of the server's window and asked whether its metrics look good;
then: "do the fixes please". Committed on the owner's word; not pushed.

**The test, in the owner's Chrome, with the build of `main` as merged.** One session on the
repository's pages, Explore. Worked: status with diagnostics, snapshot, extract (whole, outline,
one section), navigation by address and back, a click on a link and on a tree item, scroll,
wait, a navigation key, screenshot. Refused, as they must be: a fill, a click on a plain button
and a typed character (`WRITE_NOT_AUTHORIZED`), a navigation to another site
(`NAVIGATION_BLOCKED`), a ref from an earlier page (`STALE_REF`). Nothing was changed on GitHub.

**Three faults, and how each was pinned down before it was mended.**

- *The notice in a screenshot.* Six screenshots in the owner's Chrome: the two taken about ten
  seconds after a page had loaded had the notice in the corner, three taken later did not, and
  one was taken after the notice had gone by itself. Then on the build as it was, in the
  suite's Chrome, with a script that puts the notice on the page and takes the picture at
  once: on a quiet page the notice was in 0 of 12 pictures, with the page kept busy in 4 of 12.
  The same script on the build with the fix: 0 of 20 busy and 0 of 20 quiet; and in a visible
  Chrome 0 of 10 busy and 0 of 10 quiet. A visible Chrome was not measured before the fix.
- *The log that stood still.* Read from the owner's real window: nine lines, ending before the
  test, scrolled to the top. On the build as it was, in a real window on ports of its own, with
  an agent whose calls each write a line: untouched, the log followed, also while the window
  was put away and after it came back (37, 67, 97, 127 lines, at its end each time). So it
  holds only when someone has scrolled up or marked text, as the user guide says. With the
  fix, in a real window: text marked through the accessibility interface, thirty calls later
  the log stood at 37 lines, its corner said *held while you read* and the button *30 newer
  lines*; the button pressed, it had 67 lines and no button; thirty calls later 97.
- *The metrics.* The window's four shares were the status tool's own, 98, 0, 2, 0 over 50
  calls, with a longest pause of 346 seconds in them. With the fix the real window had, over 33
  calls of a script, *share* and *per call* over the numbers and 70% with 124 ms for the agent.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify` | 131 tests, 5 of them new, and the 8 of the conformance check on the built jar |
| `cd chrome-extension && npm run check` | type-check clean, 161 tests, 1 of them new and one longer, build |
| `cd e2e && npm test` | 95 passed, 0 failed. The step on the notice takes six pictures of a page kept busy now, each measured against the page without the notice |
| `node docs/agents/check-links.mjs`, `node docs/agents/check-personal.mjs` | all links resolve; nothing personal found |

All of it in a copy of the tree with a jar built there, on the final sources, in one run.

The picture tool drew sixteen states, one of them new: the log held. Opened and looked at: the
first, the low screen, a tab chosen, and the new one. Mended by looking: the new button took
the general button's look and height and left the log two lines; and the line over the
metrics' numbers took the log's room, so the window is 24 pixels higher.
`docs/images/server-panel.png` is the first drawing, byte for byte.

Not run: the editor lab; nothing it covers changed. Not tried: a screenshot of a tab whose
window is covered or minimized; the owner's own Chrome and window with these fixes; Linux and
macOS. Read on GitHub and not acted on: CI's runs #15 to #20 did not start, with a message about
the account's billing.

## 2026-11-22, on `blocked-sites`: WP-20, sites that no agent may work on

The owner: "deny URL domain basically we can created blocked sites, this should be properties,
any action tried on site is blocked by the mcp server", and, from options: an entry is a domain
with its subdomains; the block shows in the server's answer, the popup and the window; a file
that cannot be read refuses everything. Built on a branch made from `one-server`, and
committed there on the owner's word; not pushed.

All of the following on the final sources, in a copy of the tree with a jar built there.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify` | 126 tests, 17 of them new, and the 8 of the conformance check on the built jar |
| `cd chrome-extension && npm run check` | type-check clean, 160 tests, 4 of them new, build |
| `cd e2e && npm test` | 95 passed, 0 failed. The new step: a second tab on the demo site under `localhost`, which is another host than `127.0.0.1`; the site written into the settings file while the server runs; nine tools refused there with `SITE_BLOCKED`, the tab not moved; the other tab working, and a navigation from it to the blocked host refused; the status naming the blocked session; the popup marking it, and offering nothing on a new tab of that site, checked as drawn and not as marked; the site taken off the list and the same session working; a mistake in the file refusing both sessions, the popup saying so once; the file mended |
| `node docs/agents/check-links.mjs`, `node docs/agents/check-personal.mjs` | all links resolve; nothing personal found |

The suite was run four times. What the earlier runs showed:

- **Run 1, 94 and the new step failed:** the popup's sentence named the tab's address with its
  scheme and port, and the step expected the host. The sentence was the fault: no list has an
  address in it. It names the host now, and the entry that blocks it where that is a domain
  above it.
- **Run 2, the new step passed and the step behind it failed:** the diagnostics step looks for
  one old operation among the recent ones, and the new step's many snapshots had pushed it out.
  No fault of the product; the new step stands behind that one now. The same run's list showed
  the extension refusing for up to a second after a site was taken off the list, because the
  server had read the file and not told it yet. The server tells it ahead of the next command
  now.
- **Run 3, 95 of 95.** Then the look below found three things in the popup and the window, and
  they were mended.
- **Run 4, 95 of 95,** on what is in the tree.

Found by reading, by no run: a list sent right behind the pairing answer would have made an
extension from before this change close the connection, every time, since it takes a message it
does not know for a failed pairing while it still checks the server's proof. The list is sent
after the extension's first word as a paired one. A test of the server alone holds that; an
older extension was not run against it.

The picture tool drew fifteen states, two of them new: sites blocked with a tab on one, and a
settings file with a mistake. Opened and looked at: those two, the first, and the low screen.
Mended by looking: the new row had left the log two lines, so the window is 40 pixels higher;
and the sentence on a mistake took three lines, and takes two. `docs/images/server-panel.png`
is the first drawing, byte for byte.

By hand, with real parts on Windows and Java 21: the jar from the copy as an agent's program
starts it, with `--panel`, on ports of its own; the suite's Chrome with the built extension;
the demo site. The popup was pictured in five states and each picture opened. The server's real
window was read and pressed through the accessibility interface.

- A tab authorized on `localhost`, then `localhost` written into the settings file: the agent's
  next snapshot there answered `SITE_BLOCKED` with that host and nothing else of the list. The
  popup marked the session and said why in its row. The window marked the tab *blocked*.
- A tab on the blocked site without a session, and one on `app.localhost`: the popup had a
  statement and nothing to press. **The first pictures showed the two selects for access and
  duration still drawn** under the statement, though the code hid them: the row's own layout
  beat the hidden mark. Mended, and the suite's step now checks what is drawn.
- The window's line read "bank.example, intranet.example and 1 more", and the one more was the
  entry that blocked the tab in view. Entries that block a tab come first now; the real window
  then read "localhost, bank.example and 1 more".
- **Edit**, pressed in the real window: a text editor started on the settings file of that
  server. It was Notepad; its window was closed again by its own close command.
- A mistake written into the file (`local_host`): the agent's calls answered
  `SETTINGS_UNREADABLE`, the status began with it, the window said in its amber box which
  entry is no domain, and both tabs were marked. The popup said it three times, in each row
  and in a box; it says it once now, above the rows. The file written whole again: the window
  showed the list at once, without anything restarted.
- After the look no server and no editor from it was left running.
- The first three pictures of the popup showed it twice, one above the other, and the owner
  asked why. They had been taken as whole pages. Reproduced afterwards with the built extension
  in Chrome: one masthead in the popup's page, counted before and after; pictured as the popup
  shows it, one; pictured as a whole page, of 844 pixels with a window of 510, the image starts
  again with the popup's header about 586 pixels down, in place of the rest of the content.
  Scrolled as a person scrolls it, to the middle and to the bottom, the popup's window showed
  Sessions, Activity and Settings and no header: it is not pinned and had scrolled out of view.
  So the popup has one header, and the fault is in that kind of picture. Where in Chrome or
  in the tool that drives it was not traced. The same popup laid out in an ordinary tab and
  pictured whole, as `screenshots.mjs` does it, showed it once at its full length. The look's
  later pictures are of the popup's own view. In the repository no script pictures the popup
  as a whole page, and the two full-length pictures in `docs/images` were opened: one header
  each. The runbook says how to picture the popup, and the development page points to it.

Not run: the editor lab; nothing it covers changed. Not tried: **Edit** on Linux and macOS;
this server with an extension from before this change; the owner's own Chrome and agent with
this build; a list of hundreds of entries.

## 2026-11-22, on `one-server`: WP-19, one server for all agents, and a click on a tab

The owner, after a server started by hand had been taken five times for the server the agent
uses: "only one instance of the server may be started", with several agents connected to it and
each with its own tabs; and for its window: a click on a session shows that session's metrics
and log, and no click shows all. Then: "okay do your recommendations". Built in two steps.

**The click, in the window as it was.** Every tab is in the list, three show at a time and the
list scrolls; a click on a tab shows that tab's metrics and log lines, a second click or Escape
shows all. The extension says in each answer in which session a command ran, since a command
may name none. Run in a copy of the tree with a jar built there: the server's 96 tests and the
8 of the conformance check, the extension's 156, end to end 94 of 94. Pressed in a real window
through the accessibility interface, with the suite's Chrome, two tabs and seven real calls:
each tab chosen shows its own calls and its own lines, and the same tab again shows all.

**The one server.** The process an agent's program starts is a pipe to the server, which it
starts as a process of its own if none runs. All of the following on the final sources, in a
copy of the tree with a jar built there.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify` | 109 tests, 17 of them new since `by-hand-panel`, and the 8 of the conformance check on the built jar, which now goes through the pipe and the server it starts; none skipped, none failed. No server was left running six seconds after it |
| `cd chrome-extension && npm run check` | type-check clean, 156 tests, build |
| `cd e2e && npm test` | 94 passed, 0 failed, with the suite's two agents through one server. Two checks are new in it: the server listens for agents on the port after theirs and neither process serves alone, and nothing listens there once the last agent has gone |
| `node docs/agents/check-links.mjs`, `node docs/agents/check-personal.mjs` | all links resolve; nothing personal found |

The suite passed 94 of 94 before its two new checks as well, unchanged: an agent's own log, its
port and its restart are to the suite as they were.

Found by the first run with real processes, and by no test before it: six servers that the
conformance check had started were still running forty minutes later. That check ends each
process at once, and the server took a broken connection for none at all, so that it never
counted its agent as gone. It takes it for the agent's going now. The test for it fails against
the code as it was; after the fix no server was left behind.

The picture tool drew thirteen states. Opened and looked at: a tab clicked, the second tab
clicked, nine tabs, the low screen, no agent, two agents, and an agent clicked. Three things
were mended by looking: the list of tabs did not stay at three rows with nine tabs; an agent's
name was cut short when its row was marked; and the line that said what is chosen pushed the
cards below it down at every click, so it stands in the corner of the card now.

By hand, with real processes on Windows and Java 21, read and pressed through the
accessibility interface:

- Two agents' processes started as agents' programs start them: one server process (`javaw`)
  and two pipes; the first agent opened in 666 ms, which includes the server's start, the
  second in 198 ms. Ports listened on: one for each agent, and the server's own. The first
  agent left: its process ended with code 0 after 9 ms and its output closed for the program
  that had started it; the second went on working. After the last one the server was gone and
  nothing listened.
- The jar run in a console of its own with `--panel`, on ports apart from the owner's: the
  command returned, one server ran that stays without an agent, and its window said that no
  agent is connected. An agent's process started then showed in that
  window by its name, 441 ms after its start. **Stop server**, pressed twice: the agent's
  process ended with code 0 and the line that the user had stopped the server in its log, the
  server was gone, and nothing started it anew.
- Two agents with the suite's Chrome, each with a tab of its own and real calls, one window:
  both agents with their headings, ids and ports; an agent clicked shows its five calls and its
  seven lines and none of the other's; a tab of the other agent clicked shows its two; clicked
  again, everything.

On the owner's word that "typed by hand" is confusing, and to be critical of what the user
reads, the words of the window, the terminal and the help text were gone over afterwards: the
help text is in two parts, what you run and what your agent runs; the window said that no
agent is connected twice, and "no tabs" twice in one card, and says each once now. The three
suites were run once more on that, with the same counts, and the pictures drawn and the changed
ones looked at.

Not tried: Linux and macOS, where the server is started as a process of its own in another
way; an IDE's program that ends every process below it when it closes, which would end the
server with it and leave the taking over to the other agents; Kill in the real window with
agents connected, and the taking over with real processes, which the tests do with a server
that is dropped inside one Java process; the jar run in a terminal while a server already runs,
which the tests do; a process that has to serve its agent alone because another program holds
the server's port, of which the tests cover that it is found out and not the serving; the
owner's own Chrome and Claude Code with this build, which needs both parts built in the tree.
Not run: the editor lab; CI, which has no credit.

## 2026-11-22, on `by-hand-panel`: what a server started by hand says, a disconnected agent's server left alone, and a panel that shows what the agent did

The owner asked for a walk through GitHub with the tools, and then for the fixes of what it
showed. A server started by hand with its panel stood beside the session's own server, which
had no window: the owner authorized a tab for the first, which no agent can use, and watched
its panel for the agent's sessions, times and calls. That panel's log filled with a pairing
and a close every few seconds, after its agent had been disconnected in the popup. Asked for
on the way: the card of the times is to be called Metrics, and the log is to show what the
agent did.

The walk itself, on a tab of `github.com`, some seventy tool calls through the session's own
server, first with the owner's extension as built at 10:03 and then with the one built at
15:47. With Read: outline, sections, scrolling, a wait, two screenshots; a fill, a navigation,
the Tab key and a link refused with the level each needs. With Explore: links followed, pages
read, the Actions page and the list of commits, the way back, a folder opened in the file
tree; another site refused, buttons refused, one screenshot refused while another tab was in
front. No fault of the tools was found. A file in GitHub's file tree could not be opened by a
click with Explore: it is a tree item and no link, so it counts as a control; its address
opens it.

All of the following on the final sources, in a copy of the tree with a jar built there.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify` | 92 tests, 3 of them new, and the 8 of the conformance check on the built jar; none skipped, none failed |
| `cd chrome-extension && npm run check` | type-check clean, 156 tests, 1 of them new, build |
| `cd e2e && npm test` | 94 passed, 0 failed. The step that disconnects an agent now reads the server's log: one disconnect, and no pairing after it, across the next looks at the ports |
| `node docs/agents/check-links.mjs`, `node docs/agents/check-personal.mjs` | all links resolve; nothing personal found |

The new worker test fails against the worker as it was: a proof went to the disconnected
agent's server again. The picture tool drew ten states. Opened and looked at: the first, which
is the documentation's picture and was taken into `docs/images` with the card's new name, and
the two of a server started by hand, without a tab and with one of its own beside one that is
open to any agent.

By hand, in the real windows on Windows with Java 21, read through the accessibility interface:

- A server started in a console of its own from a jar built in a copy, not connected to a
  browser: the box under the status line, the words of both cards, and the box, the cards'
  words, Copy, Stop, Kill and the version line all inside the window (444 by 804).
- The owner's own server started by hand from the jar the owner built at 15:47, connected: the
  box, *1 tab* for a tab the owner had authorized for any agent, and under it the line that no
  agent can use it. That line was wrong: the session used the tab a moment later, and the
  window then said *No tab is authorized for this server*. Mended after that: the line speaks
  of the server's own tabs, and an open tab is marked *any agent*. The mended form was drawn
  and tested, not seen in a real window.
- The session's own server, after the owner's Reconnect in Claude Code at 15:59, from the same
  jar and with `--panel`: its window named `claude-code`, the tab, the four shares over the
  last six calls, and a log with the start, the connection and the one call that was refused.
  The calls that went through were not in it, which is what the owner had missed; they are
  kept now, tested, and not seen in a real window, which needs the jar built again.
- That Reconnect was the first restart of a real agent's server: the new server, with another
  id, had the tab at once, by the name `claude-code`.

Not tried: an older extension against this server and the other way round, which are as before
by the source and by one half of the worker test; the owner's extension with a disconnected
agent, by hand. Not seen on GitHub: the picture in the two READMEs with its wider edge, which
needs a push. Not run: the editor lab; Linux and macOS; CI, which has no credit.

## 2026-11-22, on `restart-keeps-tabs`: a server that is started again has its tabs at once

The owner: a server stopped with a session and started again did not show the session in its
panel, while the popup showed it as connected. The cause is in two places. A server makes a new
id at each start, and its tabs come back to it by its agent's name alone; it learned that name
only with the agent's first tool call, and a server started by hand never had one. And the
extension handed a tab over only with the first command that used it.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify`, in a copy of the tree | 89 tests, one of them new; `McpConformanceIT` on the built jar: 8 tests |
| `npm run check` in `chrome-extension`, in the copy | type-check clean, 155 tests, one of them new, build |
| the new worker test against `background.ts` as it was | fails: the popup says of the restarted agent's tab that its agent is not connected |
| `cd e2e && npm test`, in the copy, on the final sources | 94 passed, 0 failed. The step for a restarted server now waits, before the agent calls any tool, until the popup names the agent as the tab's and the badge says `ON` |
| `node docs/agents/check-links.mjs` | 148 links, all resolve |
| `node docs/agents/check-personal.mjs` | nothing personal found |

By hand, the owner's case, with the real extension in Chrome as the suite drives it and the real
panel read and pressed through the accessibility interface: a server started in a console of
its own with `--panel`, a tab authorized for it, Stop pressed twice in the panel, the server
started again the same way.

- Before the stop: the popup lists the agent and the tab's agent as *Started by hand*, the
  badge says `ON`, the panel says `1 tab` and lists it.
- After the stop: the popup says *Disconnected* and marks the tab's agent as not connected;
  the badge says `OFF`.
- After the start, with Java 21 after 3.7 seconds and with Java 26 after 3.0: the popup says
  *1 agent connected* and names *Started by hand* as the tab's agent; the badge says `ON`; the
  panel of the new server, which has another id, says `1 tab` and lists it.
- A run before the hand-over was added showed the tab under the old server's id in the popup,
  though the new server could use it. That is why the extension now makes the tab the new
  server's own the moment it is back.

Not tried: a real IDE's agent that starts its server again (the suite's client stands in for
it); two agents of the same name, of which one is started again; Linux and macOS. Not run: the
editor lab; CI, which has no credit.

## 2026-11-22, on `aftercare`: commands at hand, the pairing token copied, a panel that keeps its controls, an extension that shows what is so

Four things the owner asked for after the documentation pass was merged, and one fault found on
the way. The jar and the suites that need it were run in a copy of the tree: a build of the jar
in the tree by the session was refused by its safety rules, and the jar there is still the one
of 2026-11-21.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml verify`, in the copy | 88 tests; `McpConformanceIT` on the built jar: 8 tests |
| `mvn -B -f java-server/pom.xml test`, in the tree | 88 tests |
| `npm run check` in `chrome-extension`, in the copy | type-check clean, 154 tests, build. The first try stopped at the type-check: a new test did not pass it, though it ran |
| the new worker test against `background.ts` as it was | fails: "timed out waiting for the silent server to be taken for gone" |
| `cd e2e && npm test`, in the copy | 94 passed, 0 failed. Its last step is longer: with both servers ended the badge goes from `ON` to `OFF` and the popup says *Disconnected* |
| `node docs/agents/check-links.mjs` | 147 links, all resolve |
| `node docs/agents/check-personal.mjs` | nothing personal found |

**A simple command, and a page of commands.** The user guide's section on the panel opens with
the command that starts a server with its window by hand. `docs/cheatsheet.md` is new: the
important commands on one line each, written so that a line works in PowerShell, Command Prompt
and bash, with the page that explains each part under its table. The options and variables
were read in `McpMain.java`. Tried from the repository's root for the form that needs no change
of folder: `npm --prefix chrome-extension run typecheck` and `node --test
chrome-extension/test/panels.test.ts`. The other rows in that form were not run. The owner ran
the panel's command on the old jar and got `Unknown option: --panel`, as the user guide says;
the cheat sheet has a line for it.

**The pairing token, copied.** A button in the panel puts the token on the clipboard. By hand,
in the real window on Windows, server run from the tree's classes with a token file of the
test's own, the button pressed through the accessibility interface: the clipboard then held
the token of the file; the window showed it nowhere; the log said `pairing token copied to the
clipboard in the panel` and had nothing of the token, nor had standard output; 66 seconds later
the clipboard was empty. The text the clipboard had held before was put back. Not tried: the
clipboard on Linux and macOS; Stop within the minute, which is tested with a clipboard of the
test's own.

**The panel's controls.** Found by drawing the panel with nine tabs: the list pushed the switch
and both buttons out of the window. It was so since the panel was merged, from about six tabs.
Now three are listed and the rest counted, the window is up to 760 pixels high where the screen
allows, and the part between header and controls scrolls. Looked at in the tool's eight
pictures, among them nine tabs, and the most there is to show at the height of a screen of 768
pixels: in each the header and the whole Control card are inside. Not seen: a real screen that
low.

**The extension shows what is so.** Two things were stale. The badge said `ON` for an
authorized tab whether or not an agent was connected: it says `OFF` now. And the answers to the
heartbeat were never counted, so a server that hangs stayed connected: now two in a row
without an answer take it for gone. By hand, with the real extension in Chrome as the suite
drives it and a real server whose process was stopped as a whole and later let run again
(`NtSuspendProcess`): the badge said `ON`; 60 seconds after the server stopped answering it
said `OFF`, and the popup said *Disconnected: is the MCP server running?* with the tab marked
as its agent's, not connected; 3.0 seconds after the server ran again the badge said `ON`, the
agent's status listed the session and a snapshot worked. The server's log has `extension
disconnected … code=4408` and the new connection. Not tried: a server that hangs while a
command runs; a machine that sleeps.

Pictures: the eight drawings of the panel, six of them opened after the last change;
`docs/images/server-panel.png` is the first, byte for byte.

Not run: the editor lab; the two unit suites on Linux; CI, which has no credit.

## 2026-11-22, on `docs-pass`: the documentation gone over (WP-18, part 1)

Every page that is not a record was read whole: `README.md`, `AGENTS.md`, `docs/README.md`,
the installation guide, the user guide, the tool reference, the security model, the editors
page, the architecture, the conformance page, the development page and the runbook. Claims
were checked against the source that owns them. No product code changed.

| Command | Result |
|---|---|
| `mvn -B -f java-server/pom.xml test`, in the tree | 84 tests, after the change to three test files below |
| `cd chrome-extension && npm test` | 151 tests, none failed: the count the README states |
| `git grep -n "0\.2\.0" -- ":!*package-lock.json"` | names the seven files of the runbook and no other, after the change below; before it, three test files as well |
| `PanelPictures`, then `cmp` with `docs/images/server-panel.png` | six pictures; the first is byte for byte the documentation's picture |
| The jar in the tree, built on 2026-11-21 before the panel, run with `--panel` | `Unknown option: --panel` and the usage text on standard error, exit code 2, nothing on standard output |
| The window asked to close (`WM_CLOSE`, as Alt+F4 sends it), on Windows, server run from the tree's classes | The window is put away and still there; the server runs on and ends with exit code 0 when its input ends |
| `node docs/agents/check-links.mjs` | 133 links, all resolve (91 before the pass) |
| `node docs/agents/check-personal.mjs` | nothing personal found |

Out of date, and set right, each against its source:

- Installation guide: the build's example output named 52 tests (there are 84), and three
  bundle sizes that the built bundles no longer have. Both numbers are gone: the page now says
  what to look for.
- "Fourteen editor libraries" in the editors page, the README (twice) and the development
  page. The lab has fifteen pages: thirteen libraries and two plain controls, as the editors
  page's own table and `FIXTURES` in `e2e/editors/lab.mjs` show. It has been so since the
  page was written.
- Tool reference: `PAGE_ERROR`, `EXTENSION_ERROR` and `ERROR` can be answered and were not in
  the table of codes. Every other code the sources give is in it, and every parameter of every
  tool's definition is named in that tool's section (compared by a script, not by eye).
- Architecture: `Progress.java`, `BrowserException.java` and `pairing.ts` were not in the file
  map.
- Development page: the close codes 1001 and 1009 are used and were not named; `editor` was
  missing from the list of modules that run under jsdom; CI is also started by hand.
- The panel's tests had the product's version written into them, which made the runbook's
  check for a change of version name three files too many. They use a made-up version now,
  and `PanelPictures` reads the real one.
- The popup's *Disconnected* is now also explained by a connection switched off in a server's
  panel, in the two places that explain it.

Said once now, with links from the other pages:

- Installing and pairing: the installation guide. The user guide had the commands, the
  settings and the picture again.
- What the popup's messages mean: the user guide. The installation guide had three of them
  again and now points there.
- The server's panel, which stood at length in four pages: what the user sees in the user
  guide, the rules in the security model, how it is built in the architecture, the commands in
  the runbook. The development page and `AGENTS.md` keep a line each and link.
- Which page owns what: a new section "Documentation" in the development page. `AGENTS.md`
  points to it.

Added, on the owner's question whether the panel needs better documentation. The pages said
what the window shows to someone who has it; they did not say what is needed before that, or
when it puzzles. Now in the user guide: that a jar from before the panel does not start at all
with the option, and so costs the agent its tools (shown above); what each sentence of the line
with the dot means and what to do about it; that several agents give several windows, that a
window takes the keyboard when it appears, and that a request to close it puts it away; two
rows in the troubleshooting table. In `AGENTS.md`: that the panel repeats the popup's colours
and the goblin's shapes by hand. Not tried: the close button of a frame on Linux; that it puts
the window away there too is read in the source.

After the commit of this pass, on the owner's word: the root README's picture, two lines of
plain text, is now the Mermaid diagram of `docs/README.md`, block for block, as every other
diagram in the documentation is one. Both copies carry a comment that says to change both.

Seen on GitHub, through TabGoblin, on the docs index as it is on `main`: GitHub lays its
buttons for zooming over the bottom right corner of a diagram, and where a diagram spans the
column they cover what is there. In this one that was most of the box "Every other tab", the
one the words "no access" point to. Both copies now have an empty place at the right edge,
with a comment that says why. That was checked by drawing the diagram with the Mermaid
library in a headless Chrome, in a frame of GitHub's width with the corner marked that the
buttons took in the picture from GitHub (112 by 105 pixels): before, "Every other tab" lay
under it; now nothing does. Not seen: the corrected diagram on GitHub itself; it is not
pushed. In the architecture page the diagram "Reading a page" is narrower than the column
and clear of the buttons; in "A command, end to end" they cover the lower of the two boxes
"Content script", whose upper one is whole. That was left as it is.

Moved out of the architecture page, where they were told as a story; they are measurements of
2026-11-22, made while the panel was built:

- With the real extension, the connection switched on again in the panel was found by the
  extension by itself after 14.3 seconds.
- A copy of the jar from which the 53 native files for Windows had been taken, run with
  `--panel` on Windows with an empty cache for JavaFX, as a stand-in for a system the jar has
  no native part for: JavaFX printed a trace of its own, the server logged
  `panel not shown reason=RuntimeException`, ran on, and ended with exit code 0 and nothing on
  standard output.

Looked at and left:

- The user guide and the security model both state the rules for submissions, for two
  readers. They point to each other now and were not merged.
- Two sentences in the editors page speak of "the fourteen" editors. What they count could
  not be told without a run of the lab.
- The security model's numbers (sizes, limits, times) were compared with the constants in the
  code and are right. Its table of what is verified by tests was not gone through row by row.
- The conformance page: the SDK's version and the number of tests were compared; the rest was
  not read against the SDK.
- The example outputs in the tool reference were not compared with a run.

CI: run #15, for `main` with the panel, failed in all five jobs after two seconds each, read
on GitHub. The owner says the account's credit for Actions is used up; the logs were not
opened. Nothing of that run speaks about the code.

Not run: the suite end to end and the editor lab; the pass changed three test files of the
server and no other code.

## Earlier, in one line each

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
