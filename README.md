# TabGoblin

[![CI](https://github.com/LaughingManCommits/TabGoblin/actions/workflows/ci.yml/badge.svg)](https://github.com/LaughingManCommits/TabGoblin/actions/workflows/ci.yml)

<img src="chrome-extension/icons/icon128.png" width="64" align="left" alt="">

**Extend your coding agent beyond the IDE.**

TabGoblin is a secure, user-controlled browser bridge for AI agents. It gives a coding agent
controlled access to the web applications you are signed in to: the agent works in the browser
tabs you authorize, at the access level you choose. It needs no application-specific
integration and no additional API credentials, and no tool gives it your cookies, stored
tokens or passwords.

<br clear="left">

**Your agent does not need MCP.** TabGoblin has two integration interfaces, with the same
tools and the same rules:

| | CLI | MCP |
|---|---|---|
| The agent | Runs `tabgoblin` commands in a terminal | Calls `browser_*` tools of a registered MCP server |
| Works with | Any agent that can run a local command, also one with no MCP support | Any MCP client that starts a server over stdio |
| Set up by | `tabgoblin --setup <agent> --mode cli`; nothing is registered | `tabgoblin --setup <agent>`, then one line that registers the server |
| Looks like | `tabgoblin extract --agent my-agent --find "ERROR"` | `browser_extract` with `find: "ERROR"` |
| Start here | [Quick start: CLI](#quick-start-cli) · [CLI guide](docs/cli.md) | [Quick start: MCP](#quick-start-mcp) · [MCP configuration](#mcp-client-configuration) |

Both talk to one local TabGoblin server, which talks to the TabGoblin browser extension in
your Chrome. You stay in control there, whichever interface the agent uses.

## The problem

Much of what a coding agent needs is not in the repository. Review comments, pipeline logs,
tickets, acceptance criteria and architecture decisions live in web applications behind your
sign-in. Without access to them, you copy text into the agent by hand.

The usual alternatives each cost something: an integration and an API token for every
application, or browser automation that hands the agent your whole browser profile.

TabGoblin takes a narrower path. The agent uses the session you already have, in the tabs you
select, through fourteen generic tools, and by default anything it submits waits for your
approval.
The agent reaches those tools from a terminal or through MCP, whichever it has.

## What you get

- **Your existing sign-ins.** The agent reads the page you have open, signed in as you are. No
  tokens to issue, no API scopes to request.
- **No integration per application.** The tools are generic: read, search, navigate, click,
  fill, submit. There is no website-specific code in TabGoblin; the agent supplies the
  understanding. How much of a given site can be read and operated depends on how the site is
  built: see [status and limits](#status-and-limits).
- **Access per tab.** A tab is available to an agent only after you authorize it, for its exact
  website, at one of three levels: Read, Explore or Read / Write.
- **Approval before a submission.** A submission is declared by the agent, sent once, and
  checked against what the page does afterwards. By default each one is shown to you first,
  with its content. You can relax that per tab; the strict profile makes it mandatory.
- **Control while it runs.** Pause or revoke a tab, or disconnect an agent, at any moment.
- **Local.** TabGoblin's server and its extension run on your machine and talk over `127.0.0.1`.
  TabGoblin has no hosted service and sends nothing anywhere. What your agent reads is sent to
  the agent's model provider, as with any other context you give it.
- **CLI or MCP.** An agent that runs local commands uses the tools as `tabgoblin` commands; an
  MCP client uses them as MCP tools. Several agents can share one browser, each with its own
  tabs.

## Example workflows

These are examples of the generic tools at work. None is a dedicated integration: the same
tools are used on every website, within the [limits](#status-and-limits) below.

| Workflow | What the agent does |
|---|---|
| Process review comments on a pull request | Reads the discussion, also where it loads as you scroll or runs over pages; groups the comments; changes your local code |
| Investigate a failed pipeline | Searches a long log for errors with the lines around them, without reading the whole log; finds the cause in your source |
| Retrieve requirements and acceptance criteria | Reads a ticket by its outline and sections; follows links to related pages of the same site |
| Explore documentation and architecture decisions | Navigates a documentation site and reads the relevant sections |
| Investigate code quality findings | Reads the tables of findings and opens the details |
| Respond to review comments | Writes a reply and submits it after you approved it in the popup |

## How it works

![TabGoblin at a glance: an AI coding agent uses the CLI or MCP, side by side; both lead into the TabGoblin bridge, which checks identity, validates every request and applies the policy; the bridge leads to the browser extension, where execution is under your control; it reaches the tabs you authorized, and every other tab is denied.](docs/assets/diagrams/overview.svg)

The bridge is TabGoblin's local server: one process for all your agents, on `127.0.0.1`. The
browser extension is TabGoblin in your Chrome, where you authorize tabs, approve, pause and
revoke.

1. **You authorize a tab.** Click the TabGoblin icon on the tab, choose an access level and
   press **Authorize**. That tab, on that website, is now a session your agent can use.
2. **The agent uses a tool:** it runs a command such as `tabgoblin extract`, or calls the MCP
   tool `browser_extract`. It gets text back: the page's structure with numbered elements, its
   content, or what an action did.
3. **TabGoblin's server checks the call and passes it on, once.** Nothing is retried.
4. **The extension checks what you allowed, then acts.** Is the tab authorized for this agent?
   Is the page still on that website? Does the access level cover the action? A submission is
   put to you first by default; you can relax that per tab, and the strict profile makes it
   mandatory.

<img src="docs/images/popup-sessions.png" width="354" alt="The TabGoblin popup with two sessions"> <img src="docs/images/popup-confirm.png" width="354" alt="The popup asking to allow a submission">

The [architecture](docs/architecture.md) has the components, the flows and the trust boundaries.

## How it differs from unrestricted browser automation

Automation through a browser's debugging interface or a test driver controls the whole browser.
TabGoblin is built to offer less:

| | Unrestricted browser automation | TabGoblin |
|---|---|---|
| Reach | Every tab of the profile it drives | Only the tabs you authorized, each on its exact website |
| Credentials | Cookies, website storage and request headers can be read | No tool reads them. A secret that a page displays is still page text |
| Code | Arbitrary script can run in a page | A fixed set of operations; no tool evaluates script |
| Network | Arbitrary requests | None. A tab can be navigated within its authorized website |
| Writes | Performed like any other action | A submission is declared, sent once and verified, and by default shown to you first |
| Control | The script decides | You pause, revoke and set the access level, per tab |

## Security principles

- **Least privilege.** The extension's permissions are `activeTab`, `scripting`, `storage` and
  `alarms`. It has no host permissions: it cannot touch a tab until you click its icon there.
  `storage` is the extension's own store, for its pairing, settings and sessions; it gives no
  access to a website's storage or cookies.
- **Exact scope.** A session is one tab on the websites you gave it, checked before every
  command and again before each step that touches the page.
- **No direct access to credentials.** No tool reads cookies, request headers or a website's
  storage. For cookies and headers the extension holds no permission; a website's storage it
  has no operation to read. Password fields are neither read nor filled.
  That is about where credentials are kept. What a page *displays* is page content: a key or
  a token shown on a page reaches the agent like any other text, unless the best-effort
  redaction below catches it.
- **Untrusted content.** Page content is returned as data and marked as such. A page cannot
  change a session, a permission or a setting.
- **The user decides.** Access is granted in the extension's popup and nowhere else, whether
  the agent uses the CLI or MCP.
- **Best effort, and said so.** Some protections are heuristics with known gaps: text that
  looks like a credential is taken out of what a page says, and buttons that submit or do
  something drastic are recognised by their labels. They reduce a risk; they are not a
  boundary.
- **Local policy.** A settings file can restrict every agent: blocked sites, allowed sites, a
  maximum access level, no screenshots, session time limits, a strict profile.

TabGoblin restricts what an agent does in your browser through its own two interfaces. It does
not restrict the agent's other capabilities: its shell, its file access, its other tools. No
access control makes an agent safe by itself. Whatever an authorized tab shows goes to your
agent and its model provider, and a page can try to mislead an agent within the access you gave
it. The [security model](docs/security-model.md) says what is enforced, what is configurable,
what is best effort, and [what remains your risk](docs/security-model.md#residual-risks).

## Quick start

You need Google Chrome 120 or newer. Downloads exist for Windows (x64), Linux (x64) and macOS
(Apple silicon); the Java runtime TabGoblin needs is inside.

**Which interface?** Use the **CLI** if your agent can run commands in a terminal and has no
MCP support, or if you would rather not register a server with it. Use **MCP** if your agent
is an MCP client and you want the tools in its tool list. Both give the same tools under the
same rules; pick one for each agent.

All steps but the second are the same for both:

1. **Download** the file for your system from the
   [latest release](https://github.com/LaughingManCommits/TabGoblin/releases/latest) and unpack
   it where it can stay.
2. **Connect your agent,** by one of the two paths below.
3. **Load the extension:** at `chrome://extensions`, switch on Developer mode, press **Load
   unpacked** and choose the download's `extension` folder.
4. **Pair, once:** `tabgoblin --panel` opens the server's window. Press **Copy** next to
   *Pairing token* and paste the token into the TabGoblin popup in Chrome.
5. **Let the agent introduce itself:** ask it for the browser status. From then on TabGoblin
   knows it by its name, and the popup lists it.
6. **Authorize a tab for it:** open a website, click the TabGoblin icon on that tab, choose the
   agent and an access level, and press **Authorize**. Ask for the status again: it now lists
   the tab as a session, and the agent can read the page.

### Quick start: CLI

```sh
tabgoblin --setup claude-code --mode cli     # or codex, or copilot
```

That installs a skill that teaches the agent the commands, and prints the command with your
own paths. Nothing is registered anywhere. Put the download's folder on your `PATH` so the
agent finds `tabgoblin`. For an agent that setup does not know, a few lines of instructions
do the same: [agents and IDEs without MCP](docs/cli.md#agents-and-ides-without-mcp).

Then the first interaction, which you can run yourself to see it work:

```sh
tabgoblin tools --json                                    # discover the commands and their arguments
tabgoblin status --agent claude-code                      # 1. the agent introduces itself
```

`--agent` is who the agent is: the same name at every command is the same agent, with the
same tabs. That first `status` makes the agent known, so it now appears in the TabGoblin popup.
Open a website, click the TabGoblin icon on that tab, choose the agent and an access level, and
press **Authorize**. Then:

```sh
tabgoblin status --agent claude-code                      # 2. lists the tab as session s1
tabgoblin snapshot --agent claude-code                    # 3. the page, with numbered elements
tabgoblin extract --agent claude-code --find "ERROR" --context-lines 3
tabgoblin click --agent claude-code --ref 12
```

Each command prints one JSON object, `{"ok":true,"tool":"browser_status","text":"…"}`, and
exits with a code that says how it ended. An agent with a shell needs no more than this to
start: it learns everything else from `tools --json`. The [CLI guide](docs/cli.md) has the
commands, the output, the exit codes and instructions you can hand an agent.

### Quick start: MCP

```sh
tabgoblin --setup claude-code                # or codex, or copilot
```

That installs a skill that teaches the agent the tools, and prints one line that registers the
server with your agent. Run that line; it is the agent's own command, and looks like the one
under [MCP client configuration](#mcp-client-configuration).

What the agent then calls:

```text
browser_status
browser_snapshot   { "interactive_only": true }
browser_extract    { "find": "ERROR", "context_lines": 3 }
browser_click      { "ref": 12 }
```

The [tool reference](docs/tool-reference.md) has every tool with its input, output and errors.

The [installation guide](docs/installation.md) has each step with what you should see, how to
verify a download, and how to build from source.

## MCP client configuration

For MCP, TabGoblin's server is a command your agent starts. `--agent` gives the agent a stable
identity, so its tabs are its own again after a restart. (The CLI needs none of this: every
command names its agent itself.)

Claude Code:

```sh
claude mcp add --scope user tabgoblin -- "<folder>/tabgoblin/runtime/bin/java" -jar "<folder>/tabgoblin/browser-context-mcp.jar" --agent claude-code
```

Clients that take JSON:

```json
{
  "mcpServers": {
    "tabgoblin": {
      "command": "<folder>/tabgoblin/runtime/bin/java",
      "args": ["-jar", "<folder>/tabgoblin/browser-context-mcp.jar", "--agent", "my-ide"]
    }
  }
}
```

`<folder>` is where you unpacked the download; on Windows the command is
`<folder>\tabgoblin\runtime\bin\java.exe`. `tabgoblin --setup` prints these lines with your
paths filled in. Use a different `--agent` name for each agent.

## Example prompts

With the relevant tab authorized, and the same for either interface:

> Read the unresolved review comments in this pull request, group them by priority and identify
> the changes required in my local codebase.

> Investigate the failed pipeline, extract the relevant errors and determine the root cause
> using the local source code.

> Explore the authorized documentation and identify requirements relevant to the feature I am
> implementing.

> Read the acceptance criteria of this ticket and check my current branch against each of them.

> Draft a reply to the second review comment that explains the fix, and submit it when I have
> approved it.

More, with the access level each needs, are in the
[developer guide](docs/developer-guide.md#example-prompts).

## Documentation

| Document | Purpose |
|---|---|
| [Installation](docs/installation.md) | Set it up from a download or from source, for the CLI or for MCP; verify a download; problems during setup |
| [Developer guide](docs/developer-guide.md) | Everyday use: authorize tabs, access levels, sessions and workspaces, approvals, pausing and revoking, policy, troubleshooting |
| [CLI guide](docs/cli.md) | Using TabGoblin without MCP: commands, arguments, discovery, JSON output, exit codes, identity, instructions for an agent |
| [Tool reference](docs/tool-reference.md) | Every tool, for both interfaces: required access, input, output, limits, errors |
| [Architecture](docs/architecture.md) | Components, flows, session lifecycle, trust boundaries |
| [Security model](docs/security-model.md) | Threat model, each control with where it is enforced and where it stops, residual risks |
| [Corporate assessment](docs/corporate-assessment.md) | The facts an organisation needs to assess TabGoblin: deployment, data flow, permissions, listeners, policy, audit, release integrity |
| [Editors](docs/editors.md) | Which rich-text and code editors can be filled, and what was measured |
| [Skills](skills/README.md) | Instructions that teach an agent the tools, for Claude Code, Codex and GitHub Copilot, each in a CLI and an MCP edition |
| [Contributing](CONTRIBUTING.md) | Build, test and change TabGoblin |
| [Security policy](SECURITY.md) | How to report a vulnerability |

## Status and limits

- The extension is loaded unpacked, with Chrome's developer mode on. It is not in the Chrome
  Web Store, and the downloads are not code-signed.
- Chrome is the only browser it has been run in.
- Through MCP it has been used with Claude Code and with a scripted MCP client. The setup lines
  for Codex and GitHub Copilot follow their documentation and have not been run.
- The CLI is covered by the same automated tests as MCP, end to end in a real Chrome, on Linux.
  It has not been run on Windows or macOS, and no agent has yet been driven through it by its
  skill.
- When a tab moves to another website, Chrome withdraws the extension's access. A session that
  spans two websites needs one click from you per move.
- Frames from another website and closed shadow roots are not read. Editors that draw to a
  canvas cannot be filled; thirteen editor libraries are tested
  ([results](docs/editors.md#results)).
- Hovering sends the events a page's script listens for. What a page shows through a hover
  style alone does not appear.
- Buttons that submit, or that do something drastic, are recognised outside forms by English
  labels.

Some technical names, such as `browser-context-mcp` and `BCMCP_*`, predate the product name and
are kept for compatibility: [which, and why](docs/development.md#names).

## Licence

[MIT](LICENSE).
