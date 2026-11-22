# Runbook

Procedures by outcome. Each block starts at the repository root. Commands are written for a POSIX
shell (Git Bash on Windows). In Windows PowerShell 5.1, write `a; b` instead of `a && b`, and set a
variable beforehand instead of in front of the command: `$env:BACKGROUND = '1'; npm test`, then
`Remove-Item Env:BACKGROUND`. Background and options are in
[Development](../development.md); this page is the short form.

## Prerequisites

| Tool | Version | Source of the requirement |
|---|---|---|
| JDK | 21 or newer (the build targets release 21) | `java-server/pom.xml` |
| Maven | 3.8 or newer | used locally; CI uses the runner's |
| Node | 24 (tests are TypeScript run directly by `node --test`) | `.github/workflows/ci.yml` |
| Chrome | 120 or newer, installed | `chrome-extension/manifest.json`; needed for `e2e` only |

## Build both parts

```sh
mvn -B -f java-server/pom.xml package
cd chrome-extension && npm install && npm run check
```

Success: Maven ends with `BUILD SUCCESS` and `java-server/target/browser-context-mcp.jar` exists;
`npm run check` ends with `ℹ fail 0` and three lines listing `dist\content.js`,
`dist\background.js`, `dist\popup.js`.

The Java tests print lines such as `connection rejected reason=pairing_proof` and
`outcome=error code=TIMEOUT`. They are the tests exercising refusals, not failures.

## Run one test

```sh
cd chrome-extension && node --test test/editor.test.ts        # one extension test file
mvn -B -f java-server/pom.xml test -Dtest=PairingTest         # one Java test class
```

Success: `ℹ fail 0`, or `BUILD SUCCESS`.

An extension test that waits for something that never comes is ended after 60 seconds and
reported as failed, with its name (`--test-timeout` in `chrome-extension/package.json`). Give the
option yourself when you run one file as above.

The built jar is checked against the protocol by `mvn -B -f java-server/pom.xml verify`, which runs
`McpConformanceIT` after the jar is made. `package` builds without that check.

The extension's type-check is separate: `cd chrome-extension && npm run typecheck`. A test can
pass with a type error in it, because Node strips types without checking them.

## Run the end-to-end suite

Needs both parts built (the suite uses `java-server/target/browser-context-mcp.jar` and
`chrome-extension/dist`), and Chrome.

```sh
cd e2e && npm install && npm test
```

Success: each step prints `ok`, the last line is `N passed, 0 failed`, and the process exits 0. It
takes a few minutes and opens no window. Options: `HEADED=1` shows the browser, `BCMCP_CHROME=<path>` picks another Chrome,
`SHOW_STDERR=1` prints the servers' logs at the end, `SHOW_TIMES=1` the report of where the time
of one agent's tool calls went.

## Run the editor lab

Needs both parts built, and `npm install` in **both** `e2e` and `e2e/editors`: the lab takes its
browser driver from `e2e/node_modules`.

```sh
cd e2e && npm install
cd editors && npm install
npm test                      # tab in front
BACKGROUND=1 npm test         # tab in the background
ONLY=monaco,quill CHECKS=lines,indent npm test
```

Success: exit 0 and a table with one row per editor. A cell marked `fail` is an honest, documented
limit and does not fail the run. `SILENT` fails it: the tool reported success for text the editor
does not hold. `VERBOSE=1` prints what the tool answered each time. Expected totals are in [Editors](../editors.md#results); a change to `editor.ts` or
to `editorSurface` in `snapshot.ts` needs both the front and the background run.

`node live.mjs` tries public demo pages. It needs the internet, and those pages change; treat a
failure as a lead.

## Reproduce a CI job

The workflow is `.github/workflows/ci.yml`. Each job is these commands on a clean checkout:

| Job | Commands |
|---|---|
| Java server | `mvn -B -f java-server/pom.xml verify` |
| Chrome extension | `cd chrome-extension && npm ci && npm run check` |
| End to end | `mvn -B -f java-server/pom.xml package -DskipTests`; `cd chrome-extension && npm ci && npm run build`; `cd e2e && npm ci && npm test` |
| Editors | the two builds as above; `npm ci --prefix e2e`; `npm ci --prefix e2e/editors`; `cd e2e/editors && npm test` |
| Nothing personal | `node --test docs/agents/check-personal.test.mjs`; `node docs/agents/check-personal.mjs` |

CI runs on pushes to `main`, on pull requests, and by hand. A push to another branch without a
pull request runs nothing. `npm ci` deletes `node_modules` first; use `npm install` when you only
want to work.

The two Linux jobs can be run on Windows in a container, if Docker is installed. From the
repository's root, in PowerShell, the Chrome extension job:

```powershell
docker run --rm --cpuset-cpus=0,1 -v "${PWD}/chrome-extension:/src:ro" node:24 bash -c "mkdir /work && cd /src && tar cf - --exclude=node_modules --exclude=dist . | (cd /work && tar xf -) && cd /work && npm ci && npm run check"
```

Success: `ℹ fail 0` and exit code 0. The sources are copied inside the container, so that its
`node_modules` are Linux's own and the working tree is left alone. `--cpuset-cpus=0,1` gives it
two cores, as a small runner has; timing faults show sooner there. The Java server job is the
same with the image `maven:3.9-eclipse-temurin-21`, the whole repository as `/src`, `target` and
`.git` excluded as well, and `mvn -B -f java-server/pom.xml verify` as the command.

## Try a change in a real browser

1. Build the part you changed.
2. In `chrome://extensions`, press reload on the TabGoblin card. A rebuilt `dist` is not picked up
   until you do.
3. An agent that already runs keeps its old server. Restart the agent, or its MCP connection, to
   get a rebuilt jar.

Pairing and authorizing a tab are in the [installation guide](../installation.md).

## Stop a server that is still running

There is one server for all agents (`javaw` on Windows, with `--hub` in its command line). It
ends by itself three seconds after its last agent has gone, and by **Stop server** in its
window. The process an agent starts is a pipe to it and ends when the agent closes it; run in a
terminal without an option it waits on its input and looks like a hang, and Ctrl+C ends it. Ending
the server's process is no stop: agents that still run start it again. Finding it by its ports
is in the [user guide](../user-guide.md#8-stopping).

## Regenerate screenshots and examples

```sh
cd e2e && HEADED=1 node screenshots.mjs
```

It rewrites `docs/images` and `docs/examples`. Run it headed: a headless Chrome gives the popup a
different size. Afterwards open every changed image and check it shows what the documentation says
it shows.

After a change to the confirmation prompt, picture all its cases and look at them:

```sh
cd e2e && node screenshots.mjs prompts          # into e2e/prompt-pictures/, not in git
```

Success: thirty-two pictures of sixteen views, and a printed line of text for most of them:
seven cases of the prompt, a session on which a no stands, the prompt in the automatic mode, a
session in that mode with one thing that passes and with two, the setting with each of its
three values, and the panels folded, two of them and all four. It leaves `docs/` alone and needs no visible window. With `FULL=1` each view is
also written at its whole length and double size (`<view>-full-<scheme>.png`): that is the
picture to look at for spacing and alignment, since the popup's window shows only its top.

After a change to the notice in the page, picture all its states and look at them:

```sh
cd e2e && node notice-pictures.mjs               # into e2e/notice-pictures/, not in git
```

Success: thirty-one pictures and a printed list of the notice's size in each state. Every state
is drawn at double size over a light and over a dark page: the bar alone, with one, two and three
pills, the longest pill, the user being asked, paused, a pill fading, the whole notice fading,
Pause under the pointer, and four frames of it arriving; the two widest once more in a narrow
window, and
the fading pill once where the system asks for less motion, where it must look plain. It
draws with the extension's own `notice.ts` in a plain page, starts no server and no extension,
and takes seconds. What it does not show is the notice at work in a tab: `screenshots.mjs` takes
that picture (`indicator.png`), and the end-to-end suite reads the real one.

## Look at the server's panel

After a change to the panel, picture its states and look at them:

```sh
mvn -q -f java-server/pom.xml test-compile dependency:build-classpath -Dmdep.outputFile=target/classpath.txt
cd java-server
java -cp "target/classes;target/test-classes;$(cat target/classpath.txt)" browsercontext.PanelPictures target/panel-pictures
```

On Linux and macOS the separator in the class path is `:`. Success: fifteen pictures at
double size, in `java-server/target/panel-pictures` (not in git): connected with three sessions,
waiting for the extension, switched off, without a port, Stop armed, the panel as it fills a
window with the system's frame, an agent with nine tabs, the most there is to show on a low
screen, the server without an agent, with two agents, the first and the second tab clicked, an
agent clicked, sites blocked with a tab on one of them, and a settings file with a mistake in
it. In the last two the Control card names what is blocked, or says that every site is refused,
and the tab says *blocked*; with the mistake an amber box under the status names it. In every one the header and the whole Control card must be inside the window:
look at the seventh and the eighth for that; there the list of tabs shows three rows and has a
scroll bar of its own. With two agents each has a heading over its tabs. Where a tab or an
agent is clicked, it is marked, the corner of the Sessions card says which it is, and Metrics
and Log name it and show its part alone; nothing below the list has moved. They are drawn by the server's own code from made-up states;
no window is shown and nothing of the screen is read. It needs a display, because JavaFX does
not start without one. `1-connected.png` is the documentation's picture: copy it to
`docs/images/server-panel.png` when it has changed.

A drawing does not show the window on a desktop. For that, open the server's window yourself,
on ports of its own, so that it is a server beside the one your agents use and your own
extension does not pair with it:

```sh
java -jar java-server/target/browser-context-mcp.jar --panel --port 47840
```

The command starts the server, says so and returns; the window says that no agent is connected.
Look at: the window and its place, the goblin on the taskbar instead of Java's icon, the switch
(the log says `switched off in the panel`, and `on`), **Copy** (the clipboard then holds the
token of `--show-token`, the log says that it was copied and has nothing of it, and a minute
later the clipboard is empty), the dash, and the two buttons, each of which needs two clicks. **Stop server** ends the process with exit code 0, **Kill** with 1. Do
this on each system the panel is to be trusted on: a see-through window that drew nothing on
Linux was found this way, and by no test. Do not take pictures of the screen for it: a capture
of a place on the screen shows whatever lies on top there.

## Change the version

The version is written in seven places. Change all of them in one commit:

```text
pom.xml
java-server/pom.xml
chrome-extension/manifest.json
chrome-extension/package.json                              then npm install, for the lock file
e2e/package.json
e2e/editors/package.json                                   then npm install, for the lock file
e2e/mcp-client.mjs                                         clientInfo
```

Check: `git grep -n "0\.2\.0" -- ":!*package-lock.json"` (with the old version) prints nothing, and
all four suites pass. The server reads its version from the build (`java-server/pom.xml`), and the
conformance check compares the two. There is no release procedure, no published artifact and no changelog; a
version is a number in the tree and a merge to `main` by the owner.

## Check the documentation links

```sh
node docs/agents/check-links.mjs
```

Success: `N links, all resolve`. It checks relative links and heading anchors in every Markdown
file, outside code blocks.

## Check that nothing personal is in the files

```sh
node docs/agents/check-personal.mjs
```

Success: `N files read, M binary files not read, nothing personal found`, and exit code 0. It
reads the files git tracks and the new ones it would take, and fails on a home directory, on a
mail address outside the example domains (`example.org`, `name.example`, `name.test`) and on a
link to an agent's session. A finding is printed as `file:line` and its kind, without the text
that was found. A placeholder passes: `<folder>/TabGoblin`, or a home directory with `<name>` for
the name.

What it does not do: read pictures, which have to be opened, or commit messages. It does not
know the owner's name or account either; it finds forms, not persons.

Its own tests: `node --test docs/agents/check-personal.test.mjs`. Success: `ℹ fail 0`. They
build their planted values while they run, so the test file passes the check.

## Common problems

| Symptom | Cause | Do |
|---|---|---|
| The editor lab cannot find `puppeteer-core` | `npm install` was run only in `e2e/editors` | `cd e2e && npm install` |
| End-to-end or lab fails at start with a missing jar or `dist` | A part is not built | Build both parts |
| A build is to replace `java-server/target/browser-context-mcp.jar` while a server runs from it | An agent whose MCP settings name the tree's jar has its process running from that file, and so has the one server (`javaw` with `--hub`), which that process started; your own session may be that agent | Do not build under it: copy the tree without `.git`, `node_modules`, `target` and `dist`, build and run the suites there, and build in the tree once that agent is closed. `mvn test` in the tree writes classes only and is safe |
| A change to the extension has no effect in Chrome | The extension was not reloaded | Reload it in `chrome://extensions` |
| `agnostic.test.ts` fails | A library name or a library's class name got into `chrome-extension/src`, also in a comment | Describe the DOM fact instead |
| A Bash here-document with backslashes or quotes fails on Windows | Git Bash quoting | Write the script to a file and run the file |
