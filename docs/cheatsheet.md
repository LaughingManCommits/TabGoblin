# Cheat sheet

The commands you need most, one line each. Every one is run from the folder you cloned the
project into and, where its row names no shell, works as written in PowerShell, Command Prompt
and bash. Nothing is explained here: under each table is the page that explains it.

## Build

| To | Command |
|---|---|
| Build the server | `mvn -f java-server/pom.xml package` |
| Build the extension | `npm --prefix chrome-extension install`, then `npm --prefix chrome-extension run build` |
| Load the extension in Chrome | `chrome://extensions` → *Developer mode* → *Load unpacked* → the folder `chrome-extension/dist` |
| Take a rebuild into use | Reload TabGoblin on its card at `chrome://extensions`, and restart your agent |

Explained in the [installation guide](installation.md).

## The server, by hand

Your agent starts the server itself. These are for what you do yourself.

| To | Command |
|---|---|
| Print the pairing token | `java -jar java-server/target/browser-context-mcp.jar --show-token`; or **Copy** in a server's panel, which puts it on the clipboard |
| Replace the pairing token | `java -jar java-server/target/browser-context-mcp.jar --rotate-token` |
| Run a server with its panel, to look at it | `java -jar java-server/target/browser-context-mcp.jar --panel`. No agent talks to this one: to watch your agent, add `--panel` to its own server ([Your agent](#your-agent)) |
| List the options | `java -jar java-server/target/browser-context-mcp.jar --help` |
| Stop a server you started | Ctrl+C in its terminal, or **Stop server** in its panel |

*Unknown option: --panel* means that the jar is from before the panel: build the server, then
run the command again.

Explained in the installation guide, under
[pairing](installation.md#6-pair-the-extension-with-the-server), and in the user guide, under
[the server's panel](user-guide.md#9-the-servers-panel) and [stopping](user-guide.md#8-stopping).

## Your agent

`<folder>` is the folder you cloned the project into, as an absolute path with forward slashes.

| To | Command or setting |
|---|---|
| Add the server to Claude Code | `claude mcp add tabgoblin -- java -jar <folder>/TabGoblin/java-server/target/browser-context-mcp.jar` |
| The same, with the panel | `claude mcp add tabgoblin -- java -jar <folder>/TabGoblin/java-server/target/browser-context-mcp.jar --panel` |
| See what Claude Code has, and how to remove it | `claude mcp get tabgoblin` |
| Add the server to another agent | Command `java`, arguments `-jar` and the jar's path; `--panel` as a further argument for the panel |
| Check the whole chain | Ask the agent: *"Call browser_status."* |
| Find out what is slow | Ask the agent: *"Call browser_status with diagnostics."* |

Explained in the installation guide, under
[telling your agent about the server](installation.md#5-tell-your-agent-about-the-server) and
[checking that it works](installation.md#7-check-that-it-works).

## Find and stop servers

| To | Windows (PowerShell) | macOS and Linux |
|---|---|---|
| List the servers with their ports | `Get-NetTCPConnection -State Listen -LocalPort (47821..47828) -ErrorAction SilentlyContinue \| Select-Object LocalPort, OwningProcess` | `lsof -nP -iTCP:47821-47828 -sTCP:LISTEN` |
| Stop one | `Stop-Process -Id <OwningProcess>` | `kill <PID>` |

Explained in the user guide, under [stopping](user-guide.md#8-stopping).

## Options of the server

An option goes after the jar's path; the variable is set in the environment the server is
started in, and the option wins.

| Option | Variable | Default | What it sets |
|---|---|---|---|
| `--port` | `BCMCP_PORT` | `47821` | The first of the eight ports a server tries |
| `--token-file` | `BCMCP_TOKEN_FILE` | `~/.browser-context-mcp/pairing-token` | Where the pairing token is kept |
| `--extension-origin` | `BCMCP_EXTENSION_ORIGIN` | this extension's id | Which extension may connect; `any` if you changed the id |
| `--panel` | `BCMCP_PANEL=1` | off | Whether the server shows its panel |
| none | `BCMCP_LOG` | `info` | How much the server logs: `debug`, `info`, `warn` or `off` |

Explained in the user guide, under [settings](user-guide.md#10-settings).

## For developers

| To | Command |
|---|---|
| Server: all tests, then the built jar against the protocol | `mvn -f java-server/pom.xml verify` |
| Server: the tests alone | `mvn -f java-server/pom.xml test` |
| Server: one test class | `mvn -f java-server/pom.xml test -Dtest=PairingTest` |
| Extension: type-check, tests and build | `npm --prefix chrome-extension run check` |
| Extension: one test file | `node --test chrome-extension/test/editor.test.ts` |
| End to end, in your Chrome | `npm --prefix e2e install`, then `npm --prefix e2e test` |
| The editor lab | The install of the row above, and `npm --prefix e2e/editors install`; then `npm --prefix e2e/editors test` |
| The documentation's links | `node docs/agents/check-links.mjs` |
| Nothing personal in the files | `node docs/agents/check-personal.mjs` |

The end-to-end suite and the editor lab need both parts built. Each of these, with what success
looks like, and the rest (pictures, a CI job, a change of version) is in the
[runbook](agents/runbook.md); the background is in [Development](development.md).
