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

## Commands you run yourself

Your agents start the server themselves: the first that needs it, for all of them. These are
the commands for you. With a [download](installation.md#from-a-download), `tabgoblin` in its
folder stands for `java -jar java-server/target/browser-context-mcp.jar` in every row.

| To | Command |
|---|---|
| Print the pairing token | `java -jar java-server/target/browser-context-mcp.jar --show-token`; or **Copy** in the server's window, which puts it on the clipboard |
| Replace the pairing token | `java -jar java-server/target/browser-context-mcp.jar --rotate-token` |
| See the server's window, with every agent in it | `java -jar java-server/target/browser-context-mcp.jar --panel`. It brings the window up and returns; if no server runs, it starts one, which stays until you stop it |
| Set TabGoblin up for an agent | `java -jar java-server/target/browser-context-mcp.jar --setup claude-code`, or `codex`, or `copilot`. It installs the skill and prints the line that tells the agent about this server, the extension's folder, and how to pair |
| List the options | `java -jar java-server/target/browser-context-mcp.jar --help` |
| Give your agent the skill for the tools | `java -jar java-server/target/browser-context-mcp.jar --install-skill claude-code`, or `codex`, or `copilot`. Add `--replace` to overwrite one that is there and is not this one |
| Block a site for every agent | **Edit** next to *Blocked sites* in the server's window opens the settings file. Write `blocked.sites = example.org, intranet.example` and save: it is in force at once |
| Restrict what every agent may do | The same file: `security.profile = strict`, `allowed.sites = …`, `screenshots = off`, `access.max = explore`, `session.max.minutes = 240`, `session.idle.minutes = 20` |
| List the agents that have a key of their own | `java -jar java-server/target/browser-context-mcp.jar --list-agents` |
| Take one agent away | `java -jar java-server/target/browser-context-mcp.jar --revoke-agent <name>`; `--allow-agent <name>` allows it again, as a new agent with no tab |
| Stop the server | **Stop server** in its window. Without that it ends by itself after its last agent |

*Unknown option: --panel* means that the jar is from before the panel: build the server, then
run the command again.

Explained in the installation guide, under
[pairing](installation.md#6-pair-the-extension-with-the-server), and in the user guide, under
[the server's panel](user-guide.md#9-the-servers-panel), [stopping](user-guide.md#8-stopping) and
[blocked sites](user-guide.md#blocked-sites), [the security policy](user-guide.md#the-security-policy) and
[agents](user-guide.md#agents); the skills in [skills](../skills/README.md).

## Your agent

`<folder>` is the folder you cloned the project into, as an absolute path with forward slashes.

| To | Command or setting |
|---|---|
| Add the server to Claude Code | `claude mcp add tabgoblin -- java -jar <folder>/TabGoblin/java-server/target/browser-context-mcp.jar --agent claude-code` |
| The same, with the panel | `claude mcp add tabgoblin -- java -jar <folder>/TabGoblin/java-server/target/browser-context-mcp.jar --agent claude-code --panel` |
| See what Claude Code has, and how to remove it | `claude mcp get tabgoblin` |
| Add the server to another agent | Command `java`, arguments `-jar`, the jar's path, `--agent` and a name for that agent; `--panel` as a further argument for the panel |
| Check the whole chain | Ask the agent: *"Call browser_status."* |
| Find out what is slow | Ask the agent: *"Call browser_status with diagnostics."* |

Explained in the installation guide, under
[telling your agent about the server](installation.md#5-tell-your-agent-about-the-server) and
[checking that it works](installation.md#7-check-that-it-works).

## Find the server

| To | Windows (PowerShell) | macOS and Linux |
|---|---|---|
| Find the server: its ports, one for each agent and its own | `Get-NetTCPConnection -State Listen -LocalPort (47821..47829) -ErrorAction SilentlyContinue \| Select-Object LocalPort, OwningProcess` | `lsof -nP -iTCP:47821-47829 -sTCP:LISTEN` |
| End a server that hangs. Agents that still run start it again at once | `Stop-Process -Id <OwningProcess>` | `kill <PID>` |

Explained in the user guide, under [stopping](user-guide.md#8-stopping).

## Options of the server

An option goes after the jar's path; the variable is set in the environment the server is
started in, and the option wins.

| Option | Variable | Default | What it sets |
|---|---|---|---|
| `--port` | `BCMCP_PORT` | `47821` | The first of the eight ports a server tries |
| `--token-file` | `BCMCP_TOKEN_FILE` | `~/.browser-context-mcp/pairing-token` | Where the pairing token is kept |
| `--extension-origin` | `BCMCP_EXTENSION_ORIGIN` | this extension's id | Which extension may connect; `any` if you changed the id |
| `--panel`, `--no-panel` | `BCMCP_PANEL=1`, `=0` | neither | The server's window: there from the start, or never by itself. With neither it comes up only when the browser came with a token that is not the server's |
| `--settings` | `BCMCP_SETTINGS` | `tabgoblin.properties` beside the token file | Where the settings file is: it names the [blocked sites](user-guide.md#blocked-sites) and holds the [security policy](user-guide.md#the-security-policy) |
| `--agent` | `BCMCP_AGENT` | none | The name of the agent that starts the server: by it the agent has a key of its own and its tabs again after a restart ([agents](user-guide.md#agents)) |
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
