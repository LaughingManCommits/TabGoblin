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

Success: Maven ends with `BUILD SUCCESS` and `java-server/target/tabgoblin.jar` exists;
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

An extension test that waits for something that never comes is ended after 120 seconds and
reported as failed, with its name (`--test-timeout` in `chrome-extension/package.json`). Give the
option yourself when you run one file as above.

The built jar is checked against the protocol by `mvn -B -f java-server/pom.xml verify`, which runs
`McpConformanceIT` after the jar is made. `package` builds without that check.

The extension's type-check is separate: `cd chrome-extension && npm run typecheck`. A test can
pass with a type error in it, because Node strips types without checking them.

## Run the end-to-end suite

Needs both parts built (the suite uses `java-server/target/tabgoblin.jar` and
`chrome-extension/dist`), and Chrome.

```sh
cd e2e && npm install && npm test
```

Success: each step prints `ok`, the last line is `N passed, 0 failed`, and the process exits 0. It
takes about eight minutes. The browser opens no window. **On Windows the server's own window comes up twice, at the top right, near the end of the run:** the section "The server's window" reads and presses the real window through the accessibility interface of Windows (`e2e/panel-window.ps1`, which captures nothing of the screen), on the suite's own server and on a second one that it ends with Kill and Stop. Leave the windows alone while it runs. On another system that section prints one line that begins with `skip` and counts no step. Options: `HEADED=1` shows the browser, `TABGOBLIN_CHROME=<path>` picks another Chrome,
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
| Documentation | `node --test docs/agents/check-personal.test.mjs`; `node --test docs/agents/check-drift.test.mjs`; `node docs/agents/check-personal.mjs`; `node docs/agents/check-drift.mjs`; `node docs/agents/check-links.mjs` |
| One version | `node --test release/version.test.mjs`; `node release/version.mjs` |
| Dependencies | `npm audit --audit-level=high` in `chrome-extension` and in `e2e`; the same in `e2e/editors`, whose result does not fail the job. The review of a pull request runs on GitHub only |

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
same with the image `maven:3.9-eclipse-temurin-25`, the whole repository as `/src`, `target` and
`.git` excluded as well, and `mvn -B -f java-server/pom.xml verify` as the command.

## Try a change in a real browser

1. Build the part you changed.
2. In `chrome://extensions`, press reload on the TabGoblin card. A rebuilt `dist` is not picked up
   until you do.
3. An agent that already runs keeps its old server. Restart the agent, or its MCP connection, to
   get a rebuilt jar.

Pairing and authorizing a tab are in the [installation guide](../installation.md).

## Run a tool as a command

```sh
java -jar java-server/target/tabgoblin.jar tools
java -jar java-server/target/tabgoblin.jar status --agent try-it --no-panel
```

Success: the first prints fourteen commands, without a server. The second prints one JSON
object with `"ok":true` and the status in `text`, and exit code 0; the first command of a name
takes up to ten seconds while no extension is connected. It starts the one server if none
runs, and that server keeps the agent `try-it` for ten minutes: stop it as below, or start it
with `TABGOBLIN_COMMAND_IDLE_SECONDS=5` in the environment. `--token-file` and `--port` keep a try
away from the server your own agents use. Tests: `mvn -q test -Dtest=CliTest`; end to end it
is the section "The command line".

## Stop a server that is still running

There is one server for all agents (`javaw` on Windows, with `--hub` in its command line). It
ends by itself three seconds after its last agent has gone, and by **Stop server** in its
window. The process an agent starts is a pipe to it and ends when the agent closes it; run in a
terminal without an option it waits on its input and looks like a hang, and Ctrl+C ends it. Ending
the server's process is no stop: agents that still run start it again. Finding it by its port
is in the [developer guide](../developer-guide.md#stopping).

## Regenerate screenshots and examples

```sh
cd e2e && HEADED=1 node screenshots.mjs
```

It rewrites `docs/images` and `docs/examples`. Run it headed: a headless Chrome gives the popup a
different size. Afterwards open every changed image and check it shows what the documentation says
it shows.

Take a picture of the popup without `fullPage`. The popup is a small window, and its content is
longer than the window, so it scrolls. With `fullPage` Chrome returns one tall image, and only
its upper part is right: the part that fits in the popup's window. Below that the image does
not go on with the rest of the content. It starts again with the popup's header: the goblin,
the name, the status line, the first panel. So the image has the header twice and the lower
part of the popup not at all, while the popup itself has one header. For the popup at full
length, do as `screenshots.mjs` does for the two full-length pictures: lay its content out in
an ordinary tab and picture that.

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
java -cp "target/classes;target/test-classes;$(cat target/classpath.txt)" tabgoblin.PanelPictures target/panel-pictures
```

On Linux and macOS the separator in the class path is `:`. On a machine without a display, put
`xvfb-run -a` in front of the `java` command, and of `mvn` for the window's tests (with a headless
JDK the window's tests are skipped and the pictures fail for want of `libawt_xawt`: the full JDK
package has it; and the forked test JVM wants `-DargLine=-Djava.awt.headless=false`). Success: twenty-one pictures at
double size, in `java-server/target/panel-pictures` (not in git): connected with three sessions,
waiting for the extension, switched off, without a port, Stop armed, the panel as it fills a
window with the system's frame, an agent with nine tabs, the most there is to show on a low
screen, the server without an agent, with two agents, the first and the second tab clicked, an
agent clicked, sites blocked with a tab on one of them, and a settings file with a mistake in
it, the log held, a browser that came with another token, and a security policy with a blocked
site and without one, and the server with MCP off by the settings (`21-cli-only`: in the
header the **MCP** pill is red with the no-entry sign and **CLI** green, the one agent is one of the
command line, and the log says an MCP agent was turned away). The twentieth is the first again in the light colours, as on a system that is set to light. In every picture the header has the two pills **CLI** and **MCP** beside the title, green but where the settings have one off, and both red where the file cannot be read. In the two of the policy the Control card's heading reads *Blocked sites
and security policy*, and a line *Policy: …* under the blocked sites says in short what it
restricts, whole, on two lines at most. In the two of the blocked sites the Control card names what is blocked, or says that every site is refused,
and the tab says *blocked*; with the mistake an amber box under the status names it. In the last, a green box under the status says *Pair the browser with this server* and has the
button **Copy token**; no other picture has that box, also not the second, where no browser has
come. The sixteenth
has the log held: scrolled up to its first line, its corner says *held while you read*
and has a button with the number of newer lines. In every picture with calls the Metrics card
has two numbers for each heap, under *share* and *per call*. In every one the header and the whole Control card must be inside the window:
look at the seventh and the eighth for that; there the list of tabs shows three rows and has a
scroll bar of its own. With two agents each has a heading over its tabs. Where a tab or an
agent is clicked, it is marked, the corner of the Sessions card says which it is, and Metrics
and Log name it and show its part alone; nothing below the list has moved. They are drawn by the server's own code from made-up states;
no window is shown and nothing of the screen is read. It needs a display, because JavaFX does
not start without one. `1-connected.png` is the documentation's picture: copy it to
`docs/images/server-panel.png` when it has changed.

A drawing does not show the window on a desktop. For that, open the server's window yourself,
on a port of its own, so that it is a server beside the one your agents use and your own
extension does not pair with it:

```sh
java -jar java-server/target/tabgoblin.jar --panel --port 47840
```

The command starts the server, says so and returns; the window says that no agent is connected.
Look at: the window and its place, the goblin on the taskbar instead of Java's icon, the switch
(the log says `switched off in the panel`, and `on`), **Copy** (the clipboard then holds the
token of `--show-token`, the log says that it was copied and has nothing of it, and a minute
later the clipboard is empty), the dash, and the two buttons, each of which needs two clicks. **Stop server** ends the process with exit code 0, **Kill** with 1. Do
this on each system the panel is to be trusted on: a see-through window that drew nothing on
Linux was found this way, and by no test. Do not take pictures of the screen for it: a capture
of a place on the screen shows whatever lies on top there.

The window also comes up by itself: when a browser came with a token that is not the server's
and an agent then uses a tool. To see it with your own setup, and no window open: run the jar
with `--rotate-token`, and have your agent call a tool. The window comes up, with the green
box at its top; the agent's answer says that the window is open and where the button is; a
second call does not bring it to the front again. Paste the new token into the popup
afterwards: until then your browser is not paired. With `--no-panel` in the agent's settings
no window comes, and the answer names `--show-token`.

## Change the version

A release sets its version itself (the next section); this is for changing it by hand. The
version is written in ten files. A script changes all of them, from any folder:

```bash
node release/version.mjs                    # prints the version; exits 1 if the files disagree
node release/version.mjs 0.3.0 --dry-run    # says which files it would change, writes nothing
node release/version.mjs 0.3.0              # changes them
node release/version.mjs 0.3.0-beta.1       # a beta: the manifest gets 0.3.0.1 and a version_name
node release/version.mjs --plan 0.3.0 --branch main   # the version a release from that branch gets
node release/version.mjs --previous 0.3.0   # the tag its list of changes starts from
```

The files are the two POMs, the extension's manifest, the three `package.json` files of
`chrome-extension`, `e2e` and `e2e/editors` with their lock files (the root package's version
only, as `npm install` would write it), and `clientInfo` in `e2e/mcp-client.mjs`; the list is
`PLACES` in the script. A version is three numbers, or a beta of them with `-beta.` and a
number from 1; no other suffix, and no leading zeros, as Chrome takes it. `--plan` and
`--previous` read the tags of the clone: fetch them first (`git fetch --tags`). If a place is not found exactly once, the script writes nothing and
names the file; then the file's layout changed, and `PLACES` with it.

After a change it lists the other lines of the tree that still name the old version
(`TODO.md` and the two records in `docs/agents/` are left out: they are history). Those that
name the first release, 0.2.0 (the README, `docs/installation.md`), stay: they say what that
release has. The script runs no build, commits nothing and tags nothing.

Then: all four suites, and one commit with the ten files. The server reads its version from the
build (`java-server/pom.xml`), and the conformance check compares the two; `release/bundle.sh`
reads the manifest's. The CI job "One version" runs the script without a version, and fails if
the files disagree. There is no changelog; git history and the tags are the record.

## Make a release

A release is the owner's: it is made by starting the workflow *Release* by hand, which sets the
version, runs the suites, makes the downloads, and only then commits, tags and publishes. The
workflow is `.github/workflows/release.yml`, described in
[development.md](../development.md#releases).

1. What is to be released is on the branch: `main` for a release, any other branch for a beta.
2. Try it first: on GitHub under *Actions*, *Release*, *Run workflow*, choose the branch, type
   the version (three numbers, as `0.3.0`; from a branch other than `main` its next beta is
   made), and leave *publish* off. The run's summary names the version it would make. It runs
   the suites and makes the three downloads, which are kept with the run; nothing is written.
   Download one and use it as the [installation guide](../installation.md#from-a-download)
   says.
3. Run it again on the same branch with the same version and *publish* on. If the branch got a
   commit after the run started, the push is refused and nothing is published: start it again.
4. Success: a commit `TabGoblin <version>` on the branch, the tag `v<version>` on it, and a
   release of that name on GitHub with three downloads and `SHA256SUMS.txt`; a beta is marked
   as a pre-release. `gh attestation verify <download> --repo <owner>/<repository>` says that it
   was built there.
   Its notes are the fixed text of `release/notes.md`, then the pull requests merged since the
   release before; for a beta, since the beta before. The documentation names no release but
   the first, and links to the latest, so it needs no change for a release.

A release cannot be made again under the same version: the workflow refuses a version whose
tag is there. If one is wrong, delete the release and its tag on GitHub, mend, and release
again, or go on to the next version. If the push went through and `gh` failed, the tag is there
without a release: delete the tag and start again.

To make the download for the system you are on, without GitHub:

```sh
mvn -f java-server/pom.xml package -DskipTests      # in a copy, if a server runs from the tree's jar
npm --prefix chrome-extension run build
bash release/bundle.sh                              # on Windows: in Git Bash
```

Success: `Made .../release/out/tabgoblin-<version>-<system>-<machine>` with `.zip` on Windows
and `.tar.gz` elsewhere, about 50 MB; the folder is not in git. It needs a JDK 25 or newer on
the path, and on Windows Node as well, which writes the icon of `TabGoblin.exe`. Unpack it into a folder with a space in its name and try: `tabgoblin --help`;
`tabgoblin --setup claude-code` with a home folder made for the purpose
(`JAVA_TOOL_OPTIONS=-Duser.home=<folder without a space>`), which must put the skill there and
print the line for the agent, the extension's folder and the command for the window; and the
end-to-end suite with the download's `runtime/bin` first on the path, which runs every step
on the runtime that is inside. On Windows also start `TabGoblin.exe`: the server's window has
to come and the program's own process has to end, with the server left running on the
download's `javaw`. From PowerShell start it without `-Wait`, which ends the server with it.

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

## Check for documentation drift

```sh
node docs/agents/check-drift.mjs
```

Success: `no drift: protocol N in both parts, link N, ports …, no retired name`, and exit code
0. It reads every text file of the tree but the records (`state.md`, the validation log) and
fails on a name that was retired (`RETIRED` in the script: the names from before the product was
named TabGoblin, and the per-agent ports and the servers folder of before the one port), on a
protocol version, link version or port list that the server and the extension do not define
alike, and on a page, skill, example or diagram source that quotes a protocol version other
than the one defined. A finding is printed as `file:line` and what it is. When a change retires
a name, add it to the list with the change that retired it; when it changes one of the numbers,
the check names every place that still says the old one.

Its own tests: `node --test docs/agents/check-drift.test.mjs`. Success: `ℹ fail 0`.

## Check the diagrams

The Mermaid diagrams are in the pages themselves; this renders each with Mermaid in a headless
Chrome and reports the blocks that do not parse (a semicolon ends a message early, for one).
Mermaid is not a dependency of the repository (its own dependencies carry advisories that the
*Dependencies* job fails on), so install it once outside the tree, pinned, and name the file:

```sh
mkdir -p ../mermaid && npm --prefix ../mermaid install mermaid@11.4.1
MERMAID=../mermaid/node_modules/mermaid/dist/mermaid.min.js node docs/agents/check-diagrams.mjs
```

Success: `N Mermaid blocks, 0 do not parse (Mermaid 11.4.1)`, exit code 0. It needs the
end-to-end suite's browser driver (`npm install` in `e2e`) and a Chrome; `TABGOBLIN_CHROME=<path>`
picks another, as for the suite. With `OUT=<folder>` it also writes each diagram as an SVG
there, to open. The SVG pictures are drawn, not checked:

```sh
node docs/assets/diagrams/build.mjs
```

writes the six files in `docs/assets/diagrams`, and `git status` says whether the script and
the files agreed. Open a changed picture with the system set to light and to dark; the rules for
what to look for are in [development.md](../development.md#diagrams-and-pictures).

## Common problems

| Symptom | Cause | Do |
|---|---|---|
| The editor lab cannot find `puppeteer-core` | `npm install` was run only in `e2e/editors` | `cd e2e && npm install` |
| End-to-end or lab fails at start with a missing jar or `dist` | A part is not built | Build both parts |
| A build is to replace `java-server/target/tabgoblin.jar` while a server runs from it | An agent whose MCP settings name the tree's jar has its process running from that file, and so has the one server (`javaw` with `--hub`), which that process started; your own session may be that agent | Do not build under it: copy the tree without `.git`, `node_modules`, `target` and `dist`, build and run the suites there, and build in the tree once that agent is closed. `mvn test` in the tree writes classes only and is safe |
| A change to the extension has no effect in Chrome | The extension was not reloaded | Reload it in `chrome://extensions` |
| `agnostic.test.ts` fails | A library name or a library's class name got into `chrome-extension/src`, also in a comment | Describe the DOM fact instead |
| A Bash here-document with backslashes or quotes fails on Windows | Git Bash quoting | Write the script to a file and run the file |
