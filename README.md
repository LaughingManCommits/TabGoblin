# TabGoblin

[![CI](https://github.com/LaughingManCommits/TabGoblin/actions/workflows/ci.yml/badge.svg)](https://github.com/LaughingManCommits/TabGoblin/actions/workflows/ci.yml)

<img src="docs/images/logo.png" width="104" height="60" align="left" alt="">

**Extend your coding agent beyond the IDE.**

TabGoblin is a secure, user-controlled browser bridge for AI agents. It lets a coding agent
work in the web applications you are signed in to, in the browser tabs you authorize and at
the access level you choose. It needs no integration per application and no extra API
credentials.

<br clear="left">

## What is TabGoblin?

Much of what a coding agent needs is not in the repository: review comments, pipeline logs,
tickets, acceptance criteria, architecture decisions. They live in web applications behind
your sign-in, and without access you copy them into the agent by hand. The usual alternatives
are an integration and an API token for every application, or browser automation that hands
the agent your whole browser profile.

TabGoblin takes a narrower path:

- **Your existing sign-ins.** The agent reads the page you have open, signed in as you are.
- **Generic tools, no per-site code.** Read, search, navigate, click, fill, submit: fourteen
  tools that work on any website, within the [limits](#status-and-limits) below.
- **Access per tab.** Nothing is reachable until you authorize a tab, for its exact website.
- **You stay in control.** Submissions are shown to you first by default, and you can pause or
  revoke at any time.
- **Local.** A server and a Chrome extension on your machine, talking over `127.0.0.1`.
  TabGoblin has no hosted service.
- **CLI or MCP.** The agent runs `tabgoblin` commands in a terminal, or calls the same tools
  through MCP. Both are fully supported and held to the same rules.

## How it works

![TabGoblin at a glance: an AI coding agent uses the CLI or MCP, side by side; both lead to the TabGoblin server, which checks identity and validates every request (enforced) and applies your settings (configurable); the server sends the command to the TabGoblin extension, which checks the session, origin and access level again (enforced) and asks you before a submission (configurable); it reaches the tabs you authorized, and no path leads to any other tab.](docs/assets/diagrams/overview.svg)

The TabGoblin server runs locally: one process for all your agents. The browser
extension is TabGoblin in your Chrome, where you authorize tabs, approve, pause and revoke.

1. **You authorize a tab.** Click the TabGoblin icon on the tab, choose an agent and an access
   level, and press **Authorize**.
2. **The agent uses a tool:** it runs a command such as `tabgoblin extract`, or calls the MCP
   tool `browser_extract`. It gets text back: the page's structure with numbered elements, its
   content, or what an action did.
3. **The server checks the call and passes it on, once.** Nothing is retried.
4. **The extension checks what you allowed, then acts.** Is the tab authorized for this agent?
   Is the page still on that website? Does the access level cover the action?

<img src="docs/images/popup-sessions.png" width="354" alt="The TabGoblin popup with two sessions"> <img src="docs/images/popup-confirm.png" width="354" alt="The popup asking to allow a submission">

The [architecture](docs/architecture.md) has the components, the flows and the trust boundaries.

## Security by design

TabGoblin is built to give an agent less than browser automation does: only the tabs you
chose, only through fixed operations, and with you able to see and stop it.

![What an agent can reach: TabGoblin checks every command from the agent. What passes reaches only the tabs you authorized (enforced). A submission is shown to you first by default (configurable), and is not sent if you deny it or do not answer. Other tabs, cookies, request headers, website storage, password fields, scripts, the debugger and network requests are out of reach: there is no tool or permission for them (enforced).](docs/assets/diagrams/security-boundary.svg)

Each control is one of three kinds. **Enforced** holds whatever an agent or a page does.
**Configurable** is a setting you or your organisation choose. **Best effort** is a heuristic
with known gaps: it reduces a risk and is not a boundary.

| Control | What it means for you | Kind |
|---|---|---|
| You authorize every tab | The extension has no host permissions. It can touch a tab only after you click its icon on that tab and press **Authorize** | Enforced |
| Confined to the tab and its websites | Checked before every command and again before each step. A tab that moves to another website is suspended until you resume it | Enforced |
| Access levels | **Read** reads, searches and scrolls. **Explore** also moves around the site: other pages, links, collapsed sections, hover. **Read / Write** also presses buttons, fills fields and submits | Enforced |
| No credentials | No tool reads cookies, request headers or a website's storage, and password fields are neither read nor filled. No tool evaluates script, uses the debugger or makes a network request of its own | Enforced |
| Credential-like text taken out | Text that looks like a key or a token is removed from what a page says. A secret a page displays is otherwise page text like any other | Best effort |
| Approval of submissions | A submission must be declared by the agent and needs Read / Write. By default it is shown to you, with its content, before it is sent. You can relax that per tab; the strict profile makes it mandatory | Configurable |
| Recognising high-impact buttons | Buttons that delete, pay or publish always ask, whatever the setting. Outside forms they are recognised by their English labels | Best effort |
| Authenticated local connections | Loopback only. The extension and the server prove the pairing token to each other, and each named agent proves a key of its own, so no session passes from one agent to another | Enforced, within your OS account |
| Live visibility | The popup lists every session and what each agent did. A notice in the page shows what the agent is doing, with a Pause button. The server's window has a log | On by default |
| Pause, cancel, revoke | **Pause** cancels a running command before its next step and refuses new ones. **Revoke** ends a session; **Disconnect** ends an agent. A step already done in the page is not undone | Enforced |
| One set of rules for CLI and MCP | Both reach the browser only through the same server checks and the same extension | Enforced |
| Organisation policy | A settings file can block or allow sites, cap the access level, turn off screenshots, limit session time and require the strict profile | Configurable |

**Where it stops:**

- It governs what an agent does in your browser through TabGoblin's two interfaces, not the
  agent's other capabilities, such as its shell or its file access.
- It separates agents that cooperate. It does not confine a program that runs under your
  operating-system account: such a program can read the pairing token and the agents' keys.
- Whatever an authorized tab shows goes to your agent and its model provider, and a page can
  try to mislead an agent within the access you gave it.
- Nothing is retried. When a command's outcome cannot be known (it was sent and no answer
  came), it is reported as unknown, and the agent should look at the page before trying again.

| | Unrestricted browser automation | TabGoblin |
|---|---|---|
| Reach | Every tab of the profile it drives | Only the tabs you authorized, each on its exact website |
| Credentials | Cookies, website storage and request headers can be read | No tool reads them |
| Code | Arbitrary script can run in a page | A fixed set of operations; no tool evaluates script |
| Network | Arbitrary requests | None. A tab can be navigated within its authorized website |
| Writes | Performed like any other action | Declared, sent once and verified, and by default shown to you first |
| Control | The script decides | You pause, revoke and set the access level, per tab |

The [security model](docs/security-model.md) has the threat model, where each control is
enforced and where it stops, and the [residual risks](docs/security-model.md#residual-risks).
The [corporate assessment](docs/corporate-assessment.md) collects what an organisation needs to
assess it.

## Quick start

> **Releases.** This README describes `main`. A release has what `main` had on the day it was
> made, and its notes list what changed since the one before. The first release,
> [0.2.0](https://github.com/LaughingManCommits/TabGoblin/releases/tag/v0.2.0), supports MCP
> only and has eleven tools. It has no CLI, no agent names (`--agent`), no `browser_collect`,
> `browser_hover` or `browser_request_access`, no workspaces, no policy beyond blocked sites and
> no audit record; its own instructions are in
> [its README](https://github.com/LaughingManCommits/TabGoblin/blob/v0.2.0/README.md). If the
> [latest release](https://github.com/LaughingManCommits/TabGoblin/releases/latest) is 0.2.0, build `main` as below.

You need Google Chrome 120 or newer. Four steps:

**1. Install TabGoblin and its extension.** Download the file for your system from the
[latest release](https://github.com/LaughingManCommits/TabGoblin/releases/latest); a release
whose name ends in `-beta.` and a number is a beta, to try what comes next. Or build `main` and
pack it into the same folder a download has, with its own Java runtime. This needs a JDK 25,
Maven, Node.js 24 and Git; on Windows, run the last line in Git Bash:

```sh
git clone https://github.com/LaughingManCommits/TabGoblin.git && cd TabGoblin
mvn -f java-server/pom.xml package -DskipTests
npm --prefix chrome-extension install && npm --prefix chrome-extension run build
bash release/bundle.sh
```

Unpack the download, or the file the build makes in `release/out`, where it can stay, and put that `tabgoblin` folder on
your `PATH` (on Linux and macOS the command is `./tabgoblin` inside it). Then load the
extension: at `chrome://extensions`, switch on **Developer mode**, press **Load unpacked** and
choose the folder's `extension` folder.

**2. Configure your agent, for the CLI or for MCP.** One command, for `claude-code`, `codex` or
`copilot` (see [CLI or MCP](#cli-or-mcp)):

```sh
tabgoblin --setup claude-code --mode cli     # the agent runs tabgoblin commands
tabgoblin --setup claude-code                # the agent uses MCP: run the one line it prints
```

Setup installs a skill that teaches the agent the tools, and prints what is left with your own
paths. Then pair the extension once: `tabgoblin --panel` opens the server's window; press
**Copy** next to *Pairing token*, and paste the token into the TabGoblin popup in Chrome.

**3. Authorize a tab.** Start your agent anew and ask it for the browser status: from then on
the popup lists it. Open a website, click the TabGoblin icon on that tab, choose the agent and
an access level, and press **Authorize**.

**4. Ask the agent.** For example: *"Read the unresolved review comments in this pull request
and list the changes they ask for."*

You do not handle keys, session ids or individual commands. Setup gives the agent its name, its
key is created at its first start, and the skill teaches it the tools, its sessions and how to
read long pages. The [installation guide](docs/installation.md) has each step with what you
should see, how to verify a download, and problems during setup.

## CLI or MCP

Two interfaces to the same server, the same fourteen tools and the same rules. Choose one per
agent; it does not switch by itself.

| | CLI | MCP |
|---|---|---|
| The agent | Runs `tabgoblin` commands in a terminal | Calls `browser_*` tools of a registered MCP server |
| Suits | An agent or IDE without MCP support, or a preference for plain commands | An MCP client, when you want the tools in its tool list |
| What you register | Nothing | One line, printed by setup |
| A call looks like | `tabgoblin extract --agent claude-code --find "ERROR"` | `browser_extract` with `{ "find": "ERROR" }` |
| Reference | [CLI guide](docs/cli.md) | [Tool reference](docs/tool-reference.md) |

Setup for each agent, from the `tabgoblin` folder:

| Agent | CLI | MCP |
|---|---|---|
| Claude Code | `tabgoblin --setup claude-code --mode cli` | `tabgoblin --setup claude-code`, then the printed `claude mcp add --scope user tabgoblin -- … --agent claude-code` |
| Codex | `tabgoblin --setup codex --mode cli` | `tabgoblin --setup codex`, then the printed `codex mcp add tabgoblin -- … --agent codex` |
| GitHub Copilot | `tabgoblin --setup copilot --mode cli` | `tabgoblin --setup copilot`, then the printed `copilot mcp add tabgoblin -- … --agent copilot`; in VS Code, *MCP: Add Server* with the same command |

For the CLI, the agent needs to find `tabgoblin` on its `PATH`, or be told the full command
line once; setup prints it. Another agent works with either interface too: for the CLI it needs
[a few lines of instructions](docs/cli.md#agents-and-ides-without-mcp), and an MCP client takes
the server in its settings:

```json
{
  "mcpServers": {
    "tabgoblin": {
      "command": "<folder>/tabgoblin/runtime/bin/java",
      "args": ["-jar", "<folder>/tabgoblin/tabgoblin.jar", "--agent", "my-ide"]
    }
  }
}
```

`<folder>` is where you put the folder; on Windows the command is
`<folder>\tabgoblin\runtime\bin\java.exe`. Give each agent its own `--agent` name: the name is
how its tabs are its own again after a restart.

**The CLI is an alternative interface, not a way around a rule.** It grants nothing that MCP
does not, and every control above applies to it unchanged. Where your organisation does not
permit agents in the browser, that applies to both interfaces
([corporate assessment](docs/corporate-assessment.md#restrictions-on-mcp-and-the-cli)).

## Example use cases

Authorize the relevant tab at the level shown, then ask in your own words. The same generic
tools are used on every website; none of these is a dedicated integration.

| Use case | Ask the agent | Level |
|---|---|---|
| Process review comments | *"Read the unresolved review comments in this pull request, group them by priority and identify the changes required in my local codebase."* | Read |
| Investigate a failed pipeline | *"Investigate the failed pipeline, extract the relevant errors and determine the root cause using the local source code."* | Read |
| Check acceptance criteria | *"Read the acceptance criteria of this ticket and check my current branch against each of them."* | Read |
| Explore documentation | *"Explore the authorized documentation and identify requirements relevant to the feature I am implementing."* | Explore |
| Review code quality findings | *"Go through all pages of this list of findings and summarise them by rule and by file."* | Explore |
| Respond to a review | *"Draft a reply to the second review comment that explains the fix, and submit it when I have approved it."* | Read / Write |

More, with tips, are in the [developer guide](docs/developer-guide.md#example-prompts).

## Documentation

| Document | Purpose |
|---|---|
| [Installation](docs/installation.md) | Set it up from a download or from source, for the CLI or for MCP; verify a download; problems during setup |
| [Developer guide](docs/developer-guide.md) | Everyday use: authorize tabs, access levels, sessions and workspaces, approvals, pausing and revoking, policy, troubleshooting |
| [CLI guide](docs/cli.md) | Commands, arguments, JSON output, exit codes, identity, instructions for an agent |
| [Tool reference](docs/tool-reference.md) | Every tool, for both interfaces: required access, input, output, limits, errors |
| [Architecture](docs/architecture.md) | Components, flows, session lifecycle, trust boundaries |
| [Security model](docs/security-model.md) | Threat model, each control with where it is enforced and where it stops, residual risks |
| [Corporate assessment](docs/corporate-assessment.md) | Deployment, data flow, permissions, listeners, policy, audit and release integrity, for an organisation's assessment |
| [Editors](docs/editors.md) | Which rich-text and code editors can be filled, and what was measured |
| [Skills](skills/README.md) | The instructions that teach an agent the tools: for Claude Code, Codex and GitHub Copilot, each for the CLI and for MCP |
| [Contributing](CONTRIBUTING.md) | Build, test and change TabGoblin |
| [Security policy](SECURITY.md) | How to report a vulnerability |

## Status and limits

- This README describes `main`; a release has what `main` had on the day it was made
  ([above](#quick-start)).
- The extension is loaded unpacked, with Chrome's developer mode on. It is not in the Chrome
  Web Store, and the downloads are not code-signed.
- Chrome is the only browser it has been run in.
- Through MCP it has been used with Claude Code and with a scripted MCP client. The setup lines
  for Codex and GitHub Copilot follow their documentation and have not been run.
- The CLI is covered by the same automated tests as MCP, end to end in a real Chrome. On Windows
  it has been used by hand with the real extension for reading and Explore, not yet for writing
  and submitting; no agent has yet been driven through it by its skill.
- When a tab moves to another website, Chrome withdraws the extension's access. A session that
  spans two websites needs one click from you per move.
- Frames from another website and closed shadow roots are not read. Editors that draw to a
  canvas cannot be filled; thirteen editor libraries are tested
  ([results](docs/editors.md#results)).
- Hovering sends the events a page's script listens for. What a page shows through a hover
  style alone does not appear.

Some technical names, such as `tabgoblin` and `TABGOBLIN_*`, predate the product name and
are kept for compatibility: [which, and why](docs/development.md#names).

## Licence

[MIT](LICENSE).
