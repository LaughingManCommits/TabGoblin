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
`SHOW_STDERR=1` prints the servers' logs at the end.

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
| Java server | `mvn -B -f java-server/pom.xml package` |
| Chrome extension | `cd chrome-extension && npm ci && npm run check` |
| End to end | `mvn -B -f java-server/pom.xml package -DskipTests`; `cd chrome-extension && npm ci && npm run build`; `cd e2e && npm ci && npm test` |
| Editors | the two builds as above; `npm ci --prefix e2e`; `npm ci --prefix e2e/editors`; `cd e2e/editors && npm test` |

CI runs on pushes to `main`, on pull requests, and by hand. A push to another branch without a
pull request runs nothing. `npm ci` deletes `node_modules` first; use `npm install` when you only
want to work.

## Try a change in a real browser

1. Build the part you changed.
2. In `chrome://extensions`, press reload on the TabGoblin card. A rebuilt `dist` is not picked up
   until you do.
3. An agent that already runs keeps its old server. Restart the agent, or its MCP connection, to
   get a rebuilt jar.

Pairing and authorizing a tab are in the [installation guide](../installation.md).

## Stop a server that is still running

A server ends when its agent closes it. One started by hand waits on its input and looks like a
hang; Ctrl+C stops it. Finding a leftover one by its port is in the
[user guide](../user-guide.md#8-stopping).

## Regenerate screenshots and examples

```sh
cd e2e && HEADED=1 node screenshots.mjs
```

It rewrites `docs/images` and `docs/examples`. Run it headed: a headless Chrome gives the popup a
different size. Afterwards open every changed image and check it shows what the documentation says
it shows.

## Change the version

The version is written in eight places. Change all of them in one commit:

```text
pom.xml
java-server/pom.xml
java-server/src/main/java/browsercontext/McpMain.java     serverInfo(...)
chrome-extension/manifest.json
chrome-extension/package.json                              then npm install, for the lock file
e2e/package.json
e2e/editors/package.json                                   then npm install, for the lock file
e2e/mcp-client.mjs                                         clientInfo
```

Check: `git grep -n "0\.2\.0" -- ":!*package-lock.json"` (with the old version) prints nothing, and
all four suites pass. There is no release procedure, no published artifact and no changelog; a
version is a number in the tree and a merge to `main` by the owner.

## Check the documentation links

```sh
node docs/agents/check-links.mjs
```

Success: `N links, all resolve`. It checks relative links and heading anchors in every Markdown
file, outside code blocks.

## Common problems

| Symptom | Cause | Do |
|---|---|---|
| The editor lab cannot find `puppeteer-core` | `npm install` was run only in `e2e/editors` | `cd e2e && npm install` |
| End-to-end or lab fails at start with a missing jar or `dist` | A part is not built | Build both parts |
| A change to the extension has no effect in Chrome | The extension was not reloaded | Reload it in `chrome://extensions` |
| `agnostic.test.ts` fails | A library name or a library's class name got into `chrome-extension/src`, also in a comment | Describe the DOM fact instead |
| A Bash here-document with backslashes or quotes fails on Windows | Git Bash quoting | Write the script to a file and run the file |
