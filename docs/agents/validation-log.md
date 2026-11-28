# Validation log

Newest first. One entry per session that verified something. Not part of the startup read.
When this passes about ten entries, fold the oldest into one summary line.

## 2026-11-28, branch `one-port` after `9a6e233`: the documentation rules and the alignment review

In the copy with the Java 25 runtime, under a virtual display (`xvfb-run`): `PanelTest` ran its
20 tests, 19 passed, and `theWindowsIconIsTheGoblinInAFormTheWindowTakes` errored for want of
`icon16.png`, which the build takes from `chrome-extension/icons` beside `java-server` and the
copy has no `chrome-extension`; `PanelModelTest` 17, `McpMainTest` 18, `HubTest` 17,
`SkillsTest` 9, `ToolReferenceTest` 2, none failed. `PanelPictures` drew its 21 pictures under
the display; the first is the documentation's. The popup's pictures were captured under the
display with `HEADED=1` and the container's Chromium; four pictures and `status.txt` changed for
the cause (port chips, the form's label, the status line) and were taken; the others differed in
pixels only, from another Chrome, and were left. The extension's type-check passed. The new
`check-drift.mjs` found, before the mends, nine places: the agent guide's task map, the
development page's names (allowed: the rule states them), `status.txt` (protocol 3), two
comments; its own tests 4 of 4. `check-diagrams.mjs`: 10 Mermaid blocks, 0 fail, Mermaid
11.4.1, after it had found one that a semicolon cut short. The six SVG pictures were drawn by
the script; the components picture and the new picture of the documentation rules were opened
in light and in dark. Links 348, all resolve;
nothing personal. Not run: the full suites (the code changes of this commit are comments, a
test's expected string and the pictures' made-up log lines), the end-to-end suite.

## 2026-11-28, branch `one-port`, WP-33 built, before its first commit

In a copy of the tree with a Java 25 runtime (`jdk4py`) and the Eclipse compiler, the tree
having no JDK: `mvn verify`, 240 tests, none failed, 20 skipped (`PanelTest`, no display), among
them `WebSocketBridgeTest` rewritten (33: one connection for every agent, each told apart; a
user's disconnect of one agent; the links' path refuses a page's origin; versions 0, 2 and 3
refused), `HubTest` (17: two agents on one connection, each with its own sessions; a program
that holds the port is not taken for the server), `CliTest`, `CommandsTest`, `PanelModelTest`,
`PortsTest` rewritten for single ports, `BrowserServiceTest` (35); `McpConformanceIT` 8 of 8.
In the same copy `npm run check` in `chrome-extension`: 217 tests, with the type-check and the
build; `background.test.ts` drives one fake server with several agents. End to end here, in the
copy: 110 passed, 0 failed, with the hand-made server reached by setting the popup's port to it
and the suite's own server paired with again after; the window's section is Windows-only and
did not run. With real processes of that jar and a plain program holding 47821: two agents'
processes started without `--port` each served their agent alone, logged `no port to listen on
port=47821 reason=taken`, answered `initialize`, and left the fallback port free, which is the
designed telling-apart of a held port from one the system keeps back. After the pages: links
320, all resolve; nothing personal. Not run: the panel's tests and its pictures (no display),
Kill and Stop in the window, a port the system keeps back.

## 2026-11-28, branch `one-server-found-and-plain-answers` after `3cfff0b`: CI's two failed steps

CI run 61 on pull request 15, read on GitHub: *End to end* on Windows, 113 passed, 2 failed
("Kill in the window …": nothing listens on the second server's link port; "a command under the
name of a connected MCP agent …": timed out waiting for the extension to find the new agent);
*Dependencies* failed on the dependency review, which the repository does not support; the five
other jobs passed. After the mends, in the same copy, runtime and compiler as below: `mvn
verify`, 261 tests, none failed, 20 skipped (`PanelTest`), with the new `RunningServersTest`
case of two tokens in one folder; `McpConformanceIT` 8 of 8. With real processes of that jar
and the test's fake extension: a second token's agent with `--port 45821` got its own server on
45821 while the first token's server had the browser, and the first token's second agent joined
that server; stopped, every file was taken out. End to end here: 110 passed, 0 failed; the
window's section is skipped on Linux, so the mended step itself has not run. Links 318, nothing
personal.

## 2026-11-27, branch `one-server-found-and-plain-answers` after `c350f29`: the review's six mends

In the same copy, runtime and compiler as below: `mvn verify`, 260 tests, none failed, 20
skipped (`PanelTest`, no display), among them `RunningServersTest` (11: a failed write says so
and leaves no `.tmp`; a file whose server does not answer is taken out by the next server that
opens, one whose server answers stays; the own port's file does not hold a process where its
server is gone; what another server's file says is compared with the asking process's own
settings), `HubTest` (19: each agent's status is answered from what its own process said of its
settings, not from the server's; nothing is told of the browser after the server begins to
stop) and `BrowserServiceTest` (37); `McpConformanceIT` 8 of 8. With real processes of that
jar, a token of their own and the test's fake extension paired by a small program: a stale
file left in the folder was taken out when the first server opened; agent b with `--port 45821`
and the same settings was served by the browser's server (41821) with the line that its setup
names 45821; agent c with `--port 46821` and another `--settings` kept its own server, twice,
and was told that the browser's server reads another settings file; agent d without a port
joined the browser's server; stopped by a signal, every file was taken out. End to end with
that jar: 110 passed, 0 failed. Links 318, nothing personal. One run of
`aLinkWithoutAPortReachesTheServerOnAnotherAgentsPort` failed three times in a row, with a
dropped server's port still answering a hello, and could not be made to fail again in six
runs after; no stray server was found afterwards, and the cause is not known. Not tried: a
real browser, and any agent with the skills.

## 2026-11-27, branch `one-server-found-and-plain-answers` after `7a79ba7`: a named port joins the server with the browser and the same settings

In the same copy, runtime and compiler as below: `mvn verify`, 259 tests, none failed, 20
skipped (`PanelTest`), among them the new cases in `RunningServersTest` (10), `HubTest` (an
agent whose link names another port is told so in its status, one of the server's own port is
not) and `BrowserServiceTest`; `McpConformanceIT` 8 of 8. With real processes of that jar, a
token of their own, and the test's fake extension paired by a small program in the scratch
folder: agent a with `--port 41821` started a server, whose file said `"browser":true` once the
fake browser paired; agent b with `--port 47821` and the same settings was served by that
server (`Listening on: ws://127.0.0.1:41822`) with the line that its setup names 47821, and no
server was started on 47821; agent c with `--port 46821` and another `--settings` started its
own server there and was told that the browser server reads another settings file; stopped by
a signal, every file was taken out. End to end with that jar: 110 passed, 0 failed. Links 317,
nothing personal. Not tried: a real browser, and any agent with the skills.

## 2026-11-27, branch `one-server-found-and-plain-answers` after `2a20b3b`: a file for each server, with its browser

In the same copy and on the same Java 25 runtime with ECJ as the entry below: `mvn verify`, 255
tests, none failed, 20 skipped (`PanelTest`, no display), among them `RunningServersTest` (8)
and a new test in `HubTest` (the server is told once when a fake extension pairs and once when
it goes); `McpConformanceIT` 8 of 8. With real processes of that jar and a token of their own: a
server started by a command with `--port 41821` wrote `41821.json` with its process id and
`"browser":false`; ended with `kill -9`, its file stayed, and the next server (47821) took it
out; with a second server on 42821 both had a file, and a command without `--port` went to
42821; both ended by a signal took their files out. End to end with that jar: 110 passed, 0
failed. Links 317, nothing personal. Not tried: the flag with a real browser.

## 2026-11-27, branch `one-server-found-and-plain-answers` after `69bdb81`: another server named to an agent without a browser; the six skills share the rules for few calls

In a copy of the tree, on a Java 25 runtime from PyPI (`jdk4py` 25.0.5.1, which has no
`javac`) with the build's compiler switched to ECJ 3.46.100 in the copy's `pom.xml` only:
`mvn package`, 252 tests, none failed, 20 skipped (`PanelTest`, no display), among them the
new tests in `BrowserServiceTest`, `HubTest` and `RunningServersTest`, and `SkillsTest` on the
changed skills; `mvn verify`, `McpConformanceIT` 8 of 8. End to end with that jar, the
extension built in the copy and the container's Chromium (without its sandbox): 110 passed, 0
failed, the window's section skipped (Linux). In the tree: the link check, 315 links; the check
for personal content, nothing found. Not run: the extension's own tests (it was not changed),
the message with two real servers and a real browser, and any agent with the new skills.

## 2026-11-27, branch `one-server-found-and-plain-answers` from `9c751a9`, not committed: a server on another port is found, `--plain`

In a copy of the tree: `mvn -o package`, 250 tests, none failed or skipped, among them the new
`RunningServersTest` (5) and one more in `CliTest` (16). In the tree: the extension's
`npm test`, 219 passed; the link check, 312 links; the check for personal content, nothing
found. With real processes and the copy's jar, in a folder of its own with its own token: a
server started with `--port 41821` wrote `41821` into `servers`; `status` without `--port`
answered from that server (`Listening on: ws://127.0.0.1:41821`), and nothing listened on
47821 afterwards; `--plain` printed the text alone, and `Error [USAGE]: click needs --ref.`
with exit code 2 for a wrong command line. The server was then ended by force, and its line
stayed in the file, as it is meant to. Measured on this machine: `java -version` 1.15 s to
1.17 s, a command's start 1.28 s, the same with `-XX:TieredStopAtLevel=1` and with a shared
archive. Not run: end to end, `mvn verify`, anything in Codex, and a server ending in order
(that its line is taken out is held by the unit test only).

## 2026-11-27, working tree on `main` at `9c751a9`: both Codex skills cut to few calls

`SkillsTest` passed, 9 of 9, run in the tree with `mvn -o test` (the jar was not rebuilt). A
smoke test from Claude Code over MCP on the owner's GitHub tab in Explore, with the jar built
at 18:16: status, snapshot, extract with find, screenshot (opened), scroll, hover, a link
click, wait, collect and history back succeeded; a fill was refused with
`WRITE_NOT_AUTHORIZED` and an address on another site with `NAVIGATION_BLOCKED`. Its
diagnostics: the server 1 ms a call, the extension and page 16 ms in the median and 915 ms at
most. A start of the jar for `status --help` took about 1.3 s, three times measured, once
0.3 s. Not run: the other suites, `mvn package`, end to end, and anything in Codex.

## 2026-11-27, working tree on `main` at `9c751a9`: Codex CLI workflow rewrite

Live CLI run on the authorized GitHub tab in Explore. Status, navigation, link clicks,
snapshots, extract outline, wait, screenshot, scrolling and bounded collection succeeded.
Collection found 32 matching lines and reported its step limit. Hover and Escape were
dispatched, with no visible change in the hover diff or confirmed key effect. The Components
viewport capture was opened and inspected. The starting URL was restored. TabGoblin timed
snapshots at 12–23 ms, the screenshot at 55 ms, and collection at 741 ms. Earlier live checks
covered back, forward, reload, and a request from Read to Explore. No live typing or submission.

Separately, the end-to-end suite in a copy used a disposable Chrome profile and local demo.
It passed 117 steps including two temporary checks covering CLI navigation, keyboard, hover,
scroll, collection, and access requests. Together the checks exercised all fourteen commands
and included declined and approved submissions. The rewrite passed all 9 skill tests and
244 package tests before the final clarification about live tests and dispatch evidence.
Link, shared-text, whitespace, and personal-information checks passed on the final wording.
No fresh-agent skill invocation was tested.

## 2026-11-27, working tree on `main` at `9c751a9`: Codex CLI smoke test and timing

On Windows, the CLI navigation smoke test passed in one shell launch using the running
server and an authorized GitHub tab. Direct URL navigation, the docs link, history back
and forward, and reload were confirmed with fresh snapshots. The original page was restored.
TabGoblin recorded snapshots at 11–16 ms, history back and forward at 48–53 ms, and reload
at 531 ms. End-to-end CLI timings include a new process per command and exclude the wait for
the shell launch. An earlier launch request was dismissed when a second approval request
superseded it. The revised skill calls for batching and one pending approval at a time.
All 9 skill tests and 244 package tests passed in a copy. Link, whitespace and
personal-information checks passed. The revised skill was not loaded in a fresh Codex
session. The extension and end-to-end suites were not run.

## 2026-11-27, working tree on `main` at `9c751a9`: Codex MCP skill examples

Documentation only. `SkillsTest` passed, 9 of 9. `mvn package` passed in a copy with JDK 25,
244 tests, no failures or skips; the running server's jar was not replaced. The examples were
checked against `docs/tool-reference.md`; the shared MCP text is unchanged. Link check,
311 links; personal-information and whitespace checks passed. The first sandboxed Maven
attempt could not fetch a plugin; a second offline attempt could not access the dependency
cache. Both checks passed with access to that cache. The skill-creator Python validator did
not run because PyYAML is missing; the repository's skill structure tests passed.

Before the edit, a manual smoke test used seven MCP tools on the authorized GitHub tab:
status, snapshot, extract (outline and search), click, navigate (URL and history-back), scroll
and screenshot (visually inspected). No tool errors; the longest recorded browser operation
was 1.4 seconds. Delays before dispatch were recorded separately and their cause was not
established. **Not run:** a fresh agent with the revised skill, automatic skill selection,
writing or submissions, the extension suite, MCP conformance or end to end.

## 2026-11-27, branch `ccr-7d9f8e27-k7i1f9` from `f6fe056`: the diagrams' alignment and wording

On Linux with Node 22 and this container's Chromium, no JDK run. Documentation only. `node docs/assets/diagrams/build.mjs` wrote the five pictures, each rendered in Chromium in light and dark and looked at, before and after. The ten Mermaid blocks parsed and rendered with Mermaid 11.4.1 in Chromium (default theme), and each render was looked at, before and after; the submission's state diagram was tried in three forms and the one with fewest crossings kept. Link check, 311 links; nothing personal (198 files). **Not run:** the suites (no product code changed); the dark theme for Mermaid; the pages on GitHub itself.

## 2026-11-27, branch `ccr-f3dc7878-ztt85n` from `e47b696`: the backlog cleared

Documentation only. `TODO.md` cut from 2150 lines to what is open; each kept fault checked against the source (`Ports.note` with `PORT_RANGE` 8, `McpMain` `--help`, `popup.ts`, `TABGOBLIN_COMMAND_IDLE_SECONDS`, `release.yml` `--generate-notes`); CI on `main` read on GitHub (runs #52 and #54 passed and #56 was running, so the billing fault is gone). The link check (311 links) and the personal-information check passed; `node release/version.mjs` prints one version. No suite run: no code changed.

Then the six skills against the server: the three MCP skills gain `INTERRUPTED` among the unknown outcomes and a row for `CANCELLED` (both reach an MCP agent: `ExtensionConnection`, `Protocol`), and all six say that `CONFIRMED` is what the page showed. With a JDK 25 from Ubuntu's packages: `SkillsTest` 9 of 9 and `ToolReferenceTest` 2 of 2 passed; each three are the same from "Start with the status" on. No skill was loaded in an agent.

## 2026-11-27, branch `ccr-ed552230-wm7n6w` from `4534eda`: JavaFX's native files in the download

On Linux with a JDK 25 (installed in the session) and Xvfb. `mvn package` under `xvfb-run`: 244 server tests, none skipped, `PanelTest` 20 of them. `release/bundle.sh` made the Linux download, with the ten `.so` files in `runtime/tabgoblin-javafx`. A probe (not in the repository) opened a JavaFX window through `Panel.onFxThread` with an empty home folder: on the system's Java with the jar alone, JavaFX wrote 8 files into `.openjfx`; on the download's runtime it wrote nothing there, named the download's folder in `javafx.cachedir`, and left no lock file in that folder. Links and the personal-information check passed. Not run: the Windows download, the scanner that quarantined it, macOS, the extension and end-to-end suites (neither part they test changed).

## 2026-11-27, branch `ccr-df3851d4-clmz1a` from `9c6aed1`: a last documentation pass

Documentation only. The ten Mermaid blocks parse and render with Mermaid 11.4.1 in Chromium, default and dark theme; `build.mjs` writes the five SVG files unchanged; `SkillsTest` 9 of 9 and `ToolReferenceTest` 2 of 2 with a JDK 25; link check, 349 links; nothing personal. **Not run:** the full suites; the pages on GitHub itself.

## 2026-11-27, branch `ccr-df3851d4-clmz1a` after `0689040`: the documentation aligned with main

On Linux with a JDK 25 (installed in the session) and Xvfb, Node 22. Documentation only. `SkillsTest` 9 of 9 and `ToolReferenceTest` 2 of 2 after the edits (a first run failed: an MCP skill named a `tabgoblin` command, which the test forbids; mended). `PanelPictures` drew its twenty-one pictures under `xvfb-run`; the first, looked at, is `docs/images/server-panel.png` now. Link check, 349 links; nothing personal. The claims changed were each read against the code. **Not run:** the full suites, end to end, a download.

## 2026-11-27, branch `ccr-df3851d4-clmz1a` from `e701c94`: the diagrams aligned with the code

On Linux with Node 22 and this container's Chromium, no JDK run. Documentation only. `node docs/assets/diagrams/build.mjs` wrote the five pictures, each opened in Chromium with the system light and dark, and looked at. Every Mermaid block in the documentation (ten: eight in `architecture.md`, one each in `cli.md` and `installation.md`) parsed and rendered with Mermaid 11.4.1 in Chromium, in the default and the dark theme, and the renders were looked at; the first run failed on five blocks whose messages had a semicolon, which ends a statement in a sequence diagram. Link check, 356 links; nothing personal. **Not run:** the suites (no product code changed); the pages on GitHub itself, whose Mermaid version is not known here.

## 2026-11-27, branch `ccr-9855a613-wqwjrk` from `4e00e6a`: what changed in a release's notes, and documentation that names no published release

On Linux with Node 22. `node --test release/version.test.mjs`: 12 of 12 (the order of versions with betas; the tag a list of changes starts from, for releases and betas). The publish step's script run with a stand-in `gh` that prints its arguments: a release passes the notes, `--generate-notes` and `--notes-start-tag` of the release before; a beta also `--prerelease`, with its line at the top of the notes; the first release passes no start tag. `gh release create --help` (the installed `gh`) says notes given with `--notes` come before the generated ones. `release.yml` parses; link check, 356 links; nothing personal. **Not run:** the workflow on GitHub, actionlint, the suites (no product code changed).

## 2026-11-27, branch `ccr-9855a613-wqwjrk` after `d97942c`: a release workflow that sets the version, and betas

On Linux with Node 22 and a JDK 21 (the server needs 25, so nothing was built). `node --test release/version.test.mjs`: 10 of 10 (betas in the manifest and back to the file as it was, a `version_name` that does not fit, the plan from `main` and from another branch, its refusals). `--plan` in the clone, which has no tags: `0.3.0` from `main`, `0.3.0-beta.1` from another branch. `release/bundle.sh` in a copy with a stand-in jar: with the files at `0.3.0-beta.2` and at `0.3.0` it read the full version and refused another `TABGOBLIN_RELEASE_VERSION`; with the right one it went on to Java. The publish step's git commands against a bare repository: the version commit and the tag arrived in one push; a second run from the same commit after the branch had moved on was refused, the tag with it. Both workflows parse as YAML; link check, 356 links; nothing personal, and its tests. **Not run:** the workflows on GitHub, actionlint (installing it was refused here), a download (no JDK 25), the suites (no product code changed).

## 2026-11-27, branch `ccr-9855a613-wqwjrk` at `02eef57`: a script for the version

On Linux with Node 22. `node --test release/version.test.mjs`: 6 of 6. `node release/version.mjs` printed 0.2.1; with `0.3.0 --dry-run` it named the ten files and wrote nothing; with `0.3.0` it changed one line in each (two in each lock file) and nothing else, and `npm install --package-lock-only` in the three folders afterwards changed no lock file further; with `0.2.1` the tree was as before (`git status`). Refused, with nothing written: `0.2`, `0.2.01`. The list of other mentions, tried with 0.2.0: the README's and the installation guide's lines about the published release and the tag in the runbook's example. Link check, 356 links; nothing personal; `ci.yml` parses. **Not run:** the suites (no product code changed, and the version was put back), the new CI job on GitHub, a build at another version.

## 2026-11-27, branch `ccr-2317e25f-tftdvd` at `59fc62d`: a review of WP-31 and WP-32, and its mends

On Linux with a JDK 25 (headless), no display, no Chrome. A review of the branch against `main` found four faults in the command line's conversation with the server, all mended: `Commands.close` waited for a read that waits (shown with a small program: `BufferedReader.close` blocks during `readLine`, closing the stream frees it; a new case in `CommandsTest` fails against the old code), a server fault in a call gave no answer for 150 s, a structured tool's text-only answer had no `result`, and an agent without a label was named "null (command line)". Also: the message of an MCP start that the running server refuses, `INTERFACE_NOT_ALLOWED` as a result exits 3, the old name of the content script's flag, a sentence in the settings file, a row in the download's README. Every job of `ci.yml` run here after it: `mvn verify` passed, 243 tests and the conformance check's 8, `PanelTest` skipped for want of a display and then run alone under Xvfb with the full JDK, 20 of 20; the extension's check passed, 219 tests, and its type-check; end to end with this container's Chromium through a wrapper that adds `--no-sandbox`, 110 of 110 (a first run, during which the JDK was being installed by apt, failed 8 steps on agents that found no server in time, and passed whole when run again with nothing beside it); the editor lab in front, 222 of 225 as `docs/editors.md` has it, no `SILENT`; the personal-information check and its tests; `npm audit` in `chrome-extension` and `e2e` found nothing, in `e2e/editors` two high (which does not fail the job). **Not run:** the editor lab with `BACKGROUND=1` (`editor.ts` is not changed), a download. The case of a server fault has no test: `BrowserService` is final.

## 2026-11-27, branch `cli-mcp-side-by-side` after `30fbd8b`: WP-32, one name and the documentation in the download

On Linux with a JDK 25 and Xvfb, as for WP-31. After the renaming: `mvn verify` passed, 241 tests and the conformance check's 8, none skipped; the extension's check passed, 219 tests; end to end 110 of 110, with the Chromium wrapper as before. `release/bundle.sh` made the Linux download (54 MB) with `tabgoblin.jar`, `docs/` (37 files: the pages, the pictures, the diagrams), `README.md`, `skills/README.md`; unpacked into a folder with a space in its name, `./tabgoblin --help` and `./tabgoblin status --agent t` answered, the server started and ended by itself, and the token and keys went to `~/.tabgoblin` (Java's home, not `$HOME`). Not a trace of the old names remains in the tree outside the records (`grep` for `browser-context-mcp`, `browsercontext`, `BCMCP`, `bcmcp` finds `TODO.md`, this log, and the two sentences that say what the names were: the constraint in `AGENTS.md` and "Names" in `docs/development.md`). **Not run:** the Windows and macOS downloads; the panel's pictures again (the window is unchanged by the renaming).

## 2026-11-27, branch `cli-mcp-side-by-side` from `ca760d9`: WP-31, the CLI and MCP side by side

On Linux with a JDK 25 (installed in the session; the full package, for the window's native library) and Xvfb, no Chrome. `mvn verify` under `xvfb-run` with `-Djava.awt.headless=false` passed, 241 tests and the conformance check's 8 on the built jar, none skipped; new tests `SeparationTest` (4), `CommandsTest` (5), and one case each in `BlockedSitesTest`, `HubTest`, `BrowserServiceTest`, `CliTest`, `McpMainTest` and `PanelModelTest`; `CliTest`'s expected output and exit codes unchanged. `PanelTest` ran on the display, 20 of 20. The window's twenty-one pictures were drawn (`PanelPictures`) and the headers of four looked at: the pills, the sign, the agent's mark, both pills off on an unreadable file. By hand with the built jar: an MCP start with `interfaces = cli` ended with exit code 2 and the reason on standard error, with and without a server running, and started none; a command with `interfaces = mcp` answered `INTERFACE_NOT_ALLOWED`, exit 3; a command with `interfaces = cli` started the server and answered; that server ended by itself. The extension's check passed, 219 tests (nothing of the extension is changed). End to end, with the Chromium of this container run through a wrapper that adds `--no-sandbox` (the session runs as root): 110 of 110; the section "The server's window" is Windows only and counted nothing. **Not run:** a download; the server's window on a real screen.

## 2026-11-27, branch `windows-launcher` at `26d4f39`: the review's four mends

On Linux with a JDK 25, no display. `mvn package` passed, 226 tests, 20 skipped (`PanelTest` needs a display); one new case in `McpMainTest` for `wantsWindow`. In the first full run `WebSocketBridgeTest.closesConnectionThatFloodsMessages` failed once (1006 for 4429); alone three times, in five suites together and in the next full run it passed. **Not run:** the conformance check (`mvn verify`), the extension's check and end to end (no change there), a download made and used on Windows, and `Panel.tell` with a JavaFX that does not start: the three mends of the program are held by unit tests and reading only.

## 2026-11-26, branch `windows-launcher` from `bcb890e`: a program with the goblin's icon in the Windows download

On Windows 11 with a JDK 25 and Node 24. The server's suite with the conformance check passed on a build in a copy (two new cases in `McpMainTest`); the extension's check passed, 219 tests, one new for the icon file; end to end 115 of 115 on the new jar. `release/bundle.sh` made the download with `TabGoblin.exe` and `app/TabGoblin.cfg` in it and the jar once. Unpacked into a folder with a space in its name and started without a console, with a port and a token file of its own: the program's process ended after about two seconds with exit 0, the server ran on the download's `javaw`, and its window was read through Windows' accessibility interface; a second start with the server running ended with exit 0 and left one server; Stop pressed twice in the window ended it. With the server's port held by a listener that says nothing: a message window came after six seconds, saying that the port is held by something that does not answer, and the program ended with exit 1 once OK was pressed. The icon was taken out of the program and looked at: the goblin's face. Links and the personal-information check passed. A fault of the test, not of the program: started from PowerShell with `-Wait`, the server ended with the program. Not run: a double-click in Explorer, and the start without arguments, which would have met the owner's own server; the picture of 256 pixels in Explorer; a machine that asks about or refuses unsigned files; the release workflow; another system.

## 2026-11-26, branch `release-window-and-token-scripts` from `b82f97c`: two files to double-click in the Windows download

On Windows 11 with a JDK 25. `release/bundle.sh` made the download with the three command files in it, each with Windows line ends. Unpacked into a folder with a space in its name: `tabgoblin-token.cmd`, with a token file and a port of its own, printed the token and the port and waited for a key, exit 0. `tabgoblin-window.cmd`, started in a console of its own as a double-click starts it, with the same token file and port: the server came up on the download's own runtime without a console, its window was read through Windows' accessibility interface (the port, no agent, the version), the console and the starting process were gone within 18 seconds, and the server ended on Stop pressed twice in its window. Links and the personal-information check passed. Not run: a real double-click in Explorer; the case where the window cannot open and the console stays; the suites, which this did not touch; the release workflow.

## 2026-11-26, branch `history-waits-for-load` from `7bca71d`: a late load after a move through history, and the window's steps

On Windows 11 with a JDK 25. The command line by hand first, with the owner's Chrome and a tab on a public site given with Explore: reading, the Explore actions, three navigations by address (the one to the address the tab was at among them, 1.9 to 2.6 seconds each) and six refusals answered as they should; one `navigate --history back` answered `no-change`. Eight tries to repeat it, in four sequences, answered rightly. After the mend and a reload of the extension by the owner: sixteen moves back and forward, all right, 19 to 148 ms each. The extension's check passed, 218 tests, with a case for a move back whose page comes after two seconds; before that it stopped on Windows at the goblin's text file, whose line ends a checkout had changed. End to end, four runs: 114 of 115 with the step of Kill failing (*the server ended at the first press of Kill*, which of its two facts not said); 114 of 115 with the first step of the window failing (five agents shown and the newest not yet by its name); then, with both steps mended, 115 of 115 twice in a row. The first half of the step with Kill alone, five times: armed after 0.76 seconds each time, the same process, its port answering. Links and the personal-information check passed. Not run: the server's own suite, which this did not touch; another system; the CI job.

## 2026-11-26, branch `e2e-server-panel` from `c39b71f`: the server's window in the end-to-end suite

On Windows 11 with a JDK 25, the jar and the extension built from the branch. The helper alone first, against a real server on a port and a token of its own: it read the window (0.4 seconds a call), pressed the switch (a tool then said *switched off in this server's window*, and after a second press no longer), hid the window by its close button and found it again after a second agent asked for it, and ended the server by Stop pressed twice, with both agents' processes ending with code 0. Kill pressed twice: within a second another process had the window and the port, and the agent answered, its first call after ten seconds. Then the whole suite: 115 of 115, the five new steps among them, once. Links and the personal-information check passed. Not run: the suite a second time; any other system, where the section is skipped; the CI job, which is on a Windows runner and will run the section; the server's and the extension's own suites, which this did not touch.

## 2026-11-26, branch `claude/docs-onboarding` from `d3f3436`: the README and the documentation's review

Documentation only. Checked against the code: the setup lines of the three agents in both modes (run with the jar of `main` in a home folder made for it; an unknown agent is refused with the list); the CLI's exit codes 0 to 4 (`Cli.java`, and `tools --json`); the options the README names (`--find`, `--context-lines`, `--interactive-only`, `--ref`); what 0.2.0 has (`git show v0.2.0`: no `Cli.java`, no `AgentKeys.java`, eleven tools, no `--agent` and no `--mode`, no `Audit.java`, no allowed sites or screenshot limit); that neither part opens a connection of its own outside the machine; the manifest's four permissions; that Pause cancels a running command at its next checkpoint (`cancelOperations`, `checkpoint` in `background.ts`); that the page's notice is on by default. Run: the README's four install lines in a fresh clone of `main` on Linux (the build, `npm install` with 0 vulnerabilities, the extension's build, `release/bundle.sh`), and the packed folder's setup from a folder with a space in its name. The five diagrams drawn and looked at, light and dark; the README drawn as a page and read. Link check, 349 links; nothing personal. Not run: the install lines in Git Bash on Windows and on macOS; no suite, as no code changed.

## 2026-11-26, branch `claude/goblin-mascot` from `ebdfafe`: the pixel goblin, and its review mended

In the same Linux container (OpenJDK 25.0.5, Chromium 1243 through the `--no-sandbox` wrapper). `node art/mascot.ts` wrote the icons, the sprite sheet, its index and `docs/images/mascot.png`; every animation and the icons were looked at enlarged on the panel's ground. The header was drawn in a frame of working, sleeping, confused and guarding with a probe (not in the repository): nothing of a frame meets the words. The real window opened at scale 1 and at `-Dglass.gtk.uiScale=2`: the goblin is sharp at both. `HEADED=1 node screenshots.mjs` drew the popup and the notice again; each changed picture looked at; the three text examples it changed (a page's height, from the font) were put back. The extensions page was taken again by a script of the session (not in the repository) with the steps of `screenshots.mjs`, in Chrome's dark theme as before, and with the line that this container's browser is managed by an organization hidden before the capture: the container's own policies put it there, and a reader's Chrome does not show it. The ID and the card without an *Errors* button, which the installation guide asks to check, are in it. The README's logo is its own picture now, `docs/images/logo.png`, written by `art/mascot.ts` and shown at its own size; looked at beside the README's first lines in a page of the same width. The two full-length pictures of the popup (`popup-full.png`, `popup-full-light.png`) had an empty box for the goblin: they are laid out in an ordinary tab, where the popup's `icons/` path leads nowhere. `screenshots.mjs` now puts the icons into that page; both drawn again and looked at. Passed: the extension's check, 218 tests (`mascot.test.ts` four, the notice's face among `notice.test.ts`); Maven's package under `xvfb-run`, 223 tests and none skipped, with the mood's rules in `PanelModelTest` and the sprite's playing in `PanelTest` (a new mood after a whole round, the wait called off, still while hidden); the end-to-end suite, 110 of 110. Not run: Windows and macOS; the animations seen moving in a real window (frames, and the timeline's state and its rounds through `tick`, were checked).

## 2026-11-25, working tree from `a1107fc`: the fixes of the branch's review

In a Linux container, with OpenJDK 25.0.5 and Chromium 1243 (started with `--no-sandbox` through a wrapper, since the container runs as root). Passed: the extension's check, 214 tests, among them the slow-site case of `navigate`, now driven by Chrome's events, with a load over in one moment and a move from `/later#part` to `/later`; Maven's package, 221 server tests, with `PanelTest` skipped for want of a display, then `PanelTest`'s 19 under `xvfb-run` with the JDK that has its window libraries; and the end-to-end suite, 110 of 110. The real window opened by a probe (not in the repository) on a virtual screen 600 high, without a window manager: 552 high, where it was made 560 before; on a screen 1024 high it opens 824 high with a lowest height of 560; and whether it is on the screen followed hiding, showing again and putting it away. The twenty pictures of the panel drawn the next day under `xvfb-run` and looked at: the header and the Control card are whole in each, `outside scope` ends the refused calls' lines, and the first is `docs/images/server-panel.png` now. Drawn with this system's font (Inter), wider than the Windows one of the picture before: the client id in the header is cut to `c-7240d…`, and a long log line goes on a second row. Not run: a `navigate` that runs out its 20 seconds (no case for it, it would take that long); the window in a system's frame with a title bar, Windows, macOS; the window's tooltip by hand; `mvn verify`.

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

At `3f162a7`, with the owner's Chrome and the extension loaded again: `navigate --url` on the public site, two addresses each asked for twice and a third once, answered `new-document` with the right address all five times, in 2.0 to 3.4 seconds each. The address the tab was already at is among them. A run a few minutes before, on the extension as it was loaded before, still said `no-change` for that case. The owner saw the popup's row name its owner.

The failed-build section added to the three MCP skills, and `SkillsTest` narrowed to `--agent` and `--port`: its 9 tests passed, and the server's 219 with none skipped. The skills in the jar were not compared, since no jar was built.

The review's last three findings: a folded Log card (three steps more in the window's test of a held log), the test client and an `error` event of a process that runs (one test more, which failed against the client as it was; 7 pass), and an agent's port shown again. The server's 219 tests passed, and the end-to-end suite passed with the changed client, 110 of 110, before the port was put back. The port was first put in the header, where it cut the agent's id short in the picture; it is at the end of the connection line now. The window's 19 pictures were drawn anew, 12 of them opened, and the documentation's picture replaced.

The chip under the title renamed from *First port* to **Port**, and the one agent's own port shown only where it differs: the server's 219 tests passed, the pictures were drawn anew, the connected one opened and made the documentation's picture.

The window's wording and its log after the critical review: the server's 219 tests passed after eight of them were brought to the new words, with cases added for a call's short line and for the hint while the extension is waited for. The 19 pictures were drawn anew and four opened: connected (four calls' lines where there was part of one), waiting (the hint), without a port (three lines), and two agents, where the window still scrolls and the Log has two rows. No jar was built and the real window was not seen.

The window's behaviour, read from its own controls by a program in the session's scratch folder: 14 controls, 13 of them reached by Tab in the order shown and the port chip not; Space and Enter both pressed a card's heading and a button; no label cut short; contrasts computed from the stylesheet's colours, 6.3 to 14.3 for text, 1.4 and 1.5 for a switch that is off and a card's edge. After the mend the chip is reached and pressed by the keyboard, with steps for it in the window's test; the server's 219 tests passed and the pictures were drawn anew.

The window's theme, height and place, on JavaFX 23.0.2: the server's 220 tests passed, one new; `mvn verify` built the jar in the tree, with no server running from it, and the conformance check passed its 8 on that jar. Twenty pictures were drawn and three opened: connected, two agents (no second scroll bar, three rows of the log) and the light one. The real window was opened as the server opens it, on Windows 11 with a system set to dark: a see-through window, the dark colours, the pointer for the lower edge and a drag by it from 868 to 748, a drag elsewhere that changed nothing, the place kept and read back, and a place off every screen refused; what Java's preferences held before was put back. JavaFX 23 named no key about motion on this system, so the window was not seen to keep still. Read from Maven Central the same day: JavaFX 23 is compiled for Java 21, 24 for 22, 25 for 23, 26 for 24 and 27 for 25.

End to end against that jar: 93 of 110 twice, the first failure each time the wait "the session to keep its disconnected owner while the unkeyed agent is connected" after 30 seconds, and the 16 steps after it for want of the agent that step starts again. The wait asked for a text the popup shows only until it knows the second agent's name; made to take the owner's name with or without its id, the suite passed 110 of 110, once. The five runs earlier in the day were on the jar of 18:19 and passed with the wait as it was.

Java 25 and JavaFX 27.0.1.1, on Windows 11 with a JDK 25: `mvn verify` passed the server's 220 tests and the 8 of the conformance check, and made a jar of 19.2 MB. That jar listed its commands on Java 25 and on Java 27, and on Java 21 it stopped with `UnsupportedClassVersionError`. The real window, opened as the server opens it: JavaFX said that less motion is not asked for here, which JavaFX 23 could not say; the theme, the lower edge and the kept place as before. Twenty pictures drawn, the connected one opened and the same as on JavaFX 23. The download for Windows was made with that JDK (50 MB; its runtime now has `java.prefs`, which the kept place needs), unpacked into a folder with a space in its name, and its command listed the tools and printed its help on the runtime inside. End to end on Java 25 against that jar: 110 of 110. Links and the personal-information check passed. Not run: the two workflows, which run on GitHub only and now ask for Java 25; the downloads for Linux and macOS; the extension's own suite, which this did not touch.

The window with the system's frame around its own header (`StageStyle.EXTENDED`), on Windows 11 with Java 25: the server's 221 tests passed, one new for the header's two buttons. Opened as the server opens it, the window said: style EXTENDED, resizable, 416 wide and no wider or narrower, 560 at the lowest; no room taken by buttons of the system's; the header's two taken for ICONIFY and CLOSE; asked to fill the screen, it stayed as it was; made 120 lower, its body followed; a close request hid it, and `Panel.raise` showed it again. Twenty pictures drawn, the connected and the light one opened: the header with its two buttons, the body unchanged. The owner looked at a try of it in the dark and the light theme before it was built in.

The window's controls after that, in the real window with the real pointer (commands taken into a list, the port into a clipboard of the check's own): the port chip copied and left the window where it was; minimize and close, by the pointer and by Space; a card's heading folded and opened; a tab's row chosen; the switch, Copy and Edit each sent their command; Kill and Stop each armed at the first press and sent theirs at the second. On a real server started from the jar of 20:42 in a console of its own, with a port and a token file of its own: Stop pressed twice through the accessibility interface ended the process, and so did Kill. Not shown by the session: a drag by the header, which the owner then did by hand in the window of a server started with Java 27, with a click on the port and a change of the height.

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
