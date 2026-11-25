# Corporate security assessment

This page collects the facts an organisation needs to assess TabGoblin. It is a summary; each
section links to the page that has the detail. It makes no claim that TabGoblin complies with
any corporate policy or regulatory standard. That judgement is the organisation's.

## What it is

A local browser bridge that lets a coding agent read and operate browser tabs the developer
explicitly authorizes, in the developer's own Chrome. An agent uses it through one of two
integration interfaces: a CLI, for any agent that can run a local command, or MCP, for an
agent that is an MCP client. It is not a hosted service and not a general browser automation
framework.

Both interfaces are the same product under the same controls: they share the server, the
extension, the tools, the user's authorization and approvals, and the local policy.

## Restrictions on MCP and the CLI

Two different things can be restricted, and they should not be mistaken for each other:

| Restriction | What it is about | Effect on TabGoblin |
|---|---|---|
| On MCP: which MCP servers an agent may load, or whether it may use MCP at all | A protocol and its servers | Covers TabGoblin's MCP interface only |
| On agents acting in a browser: which agents may read or operate web applications, which applications, with which data | An activity | Covers TabGoblin through either interface |

- **The CLI removes the technical dependency on MCP.** An agent that can run a local program
  can use TabGoblin without an MCP client. A control that only blocks MCP servers does not
  prevent this.
- **The CLI does not override a policy.** It grants nothing that MCP does not, and every
  control in this document applies to it unchanged. Where browser interaction by agents is
  not permitted, using the CLI instead of MCP is a violation of that rule, not a way to comply
  with it. TabGoblin's documentation and its skills say so to users and to agents; what an
  agent then does is not something TabGoblin enforces.
- **What stops both interfaces technically** is the absence of the extension: without it,
  paired and with a tab the user authorized, neither interface reaches a page. A managed
  browser that forbids unpacked extensions cannot load it (below). The settings file restricts
  both interfaces alike, within [its limits](#configurable-corporate-restrictions).

The differences between the interfaces, which concern how an agent is identified over time and
not what it may do, are in the
[security model](security-model.md#cli-and-mcp-one-set-of-controls).

## Deployment model

| Aspect | Fact |
|---|---|
| Components | A Java program (one jar: the server, started as a local process when an agent first needs it, and the CLI) and a Chrome extension (Manifest V3) |
| Integration interfaces | CLI: the agent runs the program with a command, one process per tool call. MCP: the agent's program starts the jar as an MCP server over stdio. Both connect to the one server on the loopback interface |
| Where it runs | Entirely on the developer's workstation, under the developer's operating-system account |
| Hosted parts | None. There is no TabGoblin service, account, telemetry or update channel |
| Installation | A download per system (Windows x64, Linux x64, macOS on Apple silicon) that includes a Java runtime, or a build from source. The extension is loaded unpacked, which requires Chrome's developer mode |
| Privileges | No administrator rights. Nothing is installed system-wide |
| Updates | Manual: a newer download is unpacked over the old one and the extension is reloaded. The server and the extension must be of the same release |
| Browser | Chrome 120 or newer. Other browsers are untested |

A managed browser that forbids unpacked extensions or developer mode cannot load the
extension. TabGoblin is not published in the Chrome Web Store, so it cannot be deployed through
a store-based allowlist.

## Data flow and processing locations

![Deployment boundary and data flow: the coding agent, the CLI and MCP interfaces, the TabGoblin server and the TabGoblin extension in Chrome all run on the developer's workstation under one operating-system account. Two flows leave it, neither made by TabGoblin: the agent's prompts to its model provider and the tab's HTTPS session with the web application.](assets/diagrams/data-flow.svg)

The outer box is one operating-system account, not a set of isolated compartments: the checks
named in it are made by TabGoblin's own programs, and a program that runs as the developer is
not confined by them ([limitations](#known-limitations-and-residual-risks)). Only the two
arrows that leave the box cross the workstation's boundary, and neither is a connection that
TabGoblin makes.

| Data | Where it is processed | Where it goes |
|---|---|---|
| Visible text of an authorized page, its structure, addresses, non-password field values | Content script, extension, server (in memory, in transit) | To the agent, as tool results: an MCP result, or a CLI command's output |
| Screenshots of an authorized tab's viewport | Extension, server (in transit) | To the agent |
| Text the agent enters or submits | Server and extension (in transit) | Into the page, and from there to the web application |
| Cookies, tokens, headers, browser storage, passwords in fields | Not accessed | Nowhere |
| Operational metadata: ids, action names, durations, outcomes | Server log (stderr, and 300 lines in memory), extension's activity list, optional audit file | Stays on the workstation |

**TabGoblin sends no data off the workstation.** Its only network use is the loopback
interface. This does not make the data local: **the agent forwards what it reads to its model
provider**, under the agent's own configuration and the organisation's agreement with that
provider. Whether page content from an internal application may be sent there is a question
about the agent and the provider, which TabGoblin neither answers nor controls. The server
does not persist page content; what the agent's program stores is outside TabGoblin.

## Browser permissions and their justification

| Permission | Why it is needed |
|---|---|
| `activeTab` | Access to a tab only after the user clicks the extension's icon on it, limited to that tab and withdrawn by Chrome when the tab changes origin. This is the basis of per-tab authorization |
| `scripting` | To inject the content script into a tab that was authorized this way. No content script is registered for all pages |
| `storage` | To keep the pairing token, the settings and the sessions in the extension's own storage |
| `alarms` | To wake the extension's worker every 30 seconds to look for a local server |

There are **no host permissions** and no `cookies`, `webRequest`, `debugger`, `tabs`,
`clipboard` or `nativeMessaging` permission. The end-to-end test suite asserts the list.

## Local network listeners

| Listener | Address | Default port | Accepts |
|---|---|---|---|
| WebSocket endpoint, one per connected agent | `127.0.0.1` | 47821 to 47828 | Only this extension's origin, then mutual proof of the pairing token |
| Server's endpoint for agents' processes | `127.0.0.1` | 47829 | A process that proves the pairing token, and for a named agent that agent's key |

Nothing listens on another interface. The first port is configurable (`--port`). Where the
system keeps the default ports back, the server uses the same nine ports counted from 37821,
or else from 27821. The
connections are not encrypted; they do not leave the loopback interface. There are no outbound
connections.

## Authentication mechanisms

| Between | Mechanism |
|---|---|
| Extension and server | A shared pairing token of 256 random bits, proven in both directions by HMAC-SHA256 challenge and response. The token is not transmitted. The WebSocket `Origin` must be this extension's id. Ten failures lock a port for a minute. `--rotate-token` invalidates all pairings |
| Agent's process and server | Proof of the same pairing token, with a distinct prefix. The same for an MCP agent's process and for each CLI command |
| Agent identity | A per-agent key of 256 random bits (`--agent <name>`; optional through MCP, required by the CLI), proven by HMAC-SHA256. The agent's id is derived from the key. Sessions are bound to that id and never pass to another. `--revoke-agent` deletes a key |
| User and extension | None beyond the browser profile: whoever operates the browser operates the popup |

Detail: [agent identity](security-model.md#agent-identity-and-authentication),
[local transport](security-model.md#local-transport-security).

## Credential handling

- **Web credentials are not handled.** TabGoblin has no access to cookies, tokens, request
  headers or browser storage, and refuses to read or fill password and credential-like fields.
  It needs no API token for any web application; it acts within the session the developer
  already has in the browser.
- **TabGoblin's own secrets** are the pairing token (`~/.browser-context-mcp/pairing-token`,
  and in the extension's storage) and the agents' keys (`~/.browser-context-mcp/agents/`).
  They are files with owner-only permissions where the system supports that. They are not
  encrypted and not held in a system keychain.
- The server's window can copy the pairing token to the clipboard; it removes it after a
  minute.

## External dependencies

| Part | Third-party code at run time |
|---|---|
| Extension | None. TypeScript sources bundled with esbuild |
| Server | The MCP Java SDK, a WebSocket library (Java-WebSocket), a logging binding (SLF4J simple), JavaFX for the optional window; versions fixed in `pom.xml` |
| Download | A Java runtime reduced with `jlink` from the Temurin JDK 21 of the build machine |

No service is contacted at run time. Each release carries two CycloneDX lists of components.

## Permission enforcement

- A tab is reachable only after the user authorizes it by a click on that tab. A session is
  one tab, exact origins (scheme, host, port) and one agent.
- Three access levels: Read; Explore (also navigation within the site); Read / Write (also
  input, and submissions that the agent must declare).
- A submission has to be declared by the agent, is sent once and is verified. By default it
  is shown to the user with its content for approval, and an approval is bound to that
  content. The user can relax this per session; the strict profile makes it mandatory.
- Checks run in the server before a command is sent, in the extension when it arrives and
  again before each step that touches the page, and in Chrome through `activeTab`.
- Pause, revoke, disconnect and expiry take effect before the next step of a running command.

Detail: [security model](security-model.md), which labels each control as enforced,
configurable or best effort.

## Configurable corporate restrictions

One local properties file, `tabgoblin.properties` beside the pairing token, restricts every
agent on the workstation:

| Setting | Effect |
|---|---|
| `blocked.sites` | Domains no agent may work on |
| `allowed.sites` | Agents work on these domains only |
| `access.max` | Cap every session at `read` or `explore` |
| `screenshots = off` | No screenshots |
| `session.max.minutes`, `session.idle.minutes` | Maximum lifetime and idle limit of an authorization |
| `security.profile = strict` | Approval for every submission and for every click that is not plain navigation; no tab for *Any agent*; no screenshots and time limits by default |
| `audit.log = on` | A record on disk (below) |

Both the server and the extension enforce these. A file that cannot be read, or a value that
cannot be understood, blocks every site rather than none.

**What an organisation must provide itself.** The file is read from the user's home folder and
is protected only by that folder's permissions. There is no remote, signed or centrally
managed policy, no integration with browser enterprise policy, and no lock that keeps the user
or a program running as the user (including an agent with a shell) from editing the file. To
hold a policy against the user, the organisation has to deploy and protect the file with its
own device management, and can point the server at another location with `--settings` or
`BCMCP_SETTINGS`, which the user's agent configuration can in turn omit. Treat the policy as a
guard-rail for cooperative users, not as a boundary against them.

## Audit capabilities

| Record | Content | Location | Retention |
|---|---|---|---|
| Audit file (off by default) | One JSON line per command sent or refused: time, agent id, session, action, duration, outcome and error category | `audit.jsonl` beside the settings file | Rotated at 5 MB; at most two files |
| Server log | The same metadata, plus connection events | The server's stderr, kept by the agent's program; last 300 lines in the server's window | Not persisted by TabGoblin |
| Activity list | The six most recent operations per session | The extension's popup | Until the browser closes |

No record contains page content, addresses, entered text or secrets. None is tamper-proof: a
program running as the user can alter the audit file. None is forwarded; collecting it into a
central system is the organisation's task. The user's decisions in the popup (authorizations,
approvals) are not in the audit file; a refused or declined command appears by its outcome.

## Security testing and release integrity

- **Automated tests** at four levels: pure rules, DOM operations under jsdom, the extension's
  worker against a fake browser, and an end-to-end suite that drives the real extension in a
  real Chrome through real server processes. The security properties each level covers are
  listed in the [security model](security-model.md#what-is-verified-by-tests). They include
  negative tests: wrong token, wrong origin, another agent's session, forged session ids,
  replayed commands, content changed after approval, access ended mid-command.
- **Continuous integration** runs all suites on every pull request, with `npm audit` and
  GitHub's dependency review.
- **Releases** are built by a GitHub Actions workflow from a version tag after all suites
  passed. Each release has SHA-256 checksums and a GitHub build-provenance attestation per
  file, verifiable with `gh attestation verify`.
- **Not done:** no independent security audit or penetration test; no code signing for Windows
  or macOS; no Chrome Web Store review; no formal vulnerability-disclosure programme beyond
  the repository's [security policy](../SECURITY.md).

## Known limitations and residual risks

The full list, with reasons, is under
[residual risks](security-model.md#residual-risks). For an assessment the central ones are:

1. **Data leaves through the agent.** Everything visible in an authorized tab can reach the
   agent's model provider. Local execution of TabGoblin does not provide confidentiality.
2. **Prompt injection.** Website content can contain instructions aimed at the agent.
   TabGoblin prevents a page from changing grants; it cannot prevent a model from being misled
   within the access it has.
3. **State changes.** Interactions can change data in the web application with the developer's
   authority. The user's approval of a submission is the default and can be relaxed by the
   user. It is mandatory only under the strict profile, which also covers every
   non-navigation click, and for controls recognised as high-impact by their English label.
4. **Secrets in page content.** Redaction is by shape and incomplete. A secret displayed on a
   page is delivered as text.
5. **No isolation from the user's account.** An agent with a shell or file access under the
   same operating-system account can read TabGoblin's token and keys and edit its policy and
   audit file.
6. **Unpacked, unsigned distribution** with manual updates.
7. **Maturity.** A young project with one maintainer. Parts were exercised on one platform
   only; the installation guide and the developer guide say which.

## Questions an assessment should answer

- Which coding agents and model providers are approved, and for which classes of data?
- Is agent-driven browser interaction permitted at all, and does an existing rule about MCP
  servers express that intent, given that the CLI needs no MCP?
- Which internal applications may be opened to an agent, and at which access level? Can
  `allowed.sites` and `access.max` express that?
- Is the strict profile required?
- How is the settings file deployed and protected on managed workstations?
- Is the audit file collected, and where?
- Are unpacked extensions permitted in the managed browser?
- Who reviews new releases before they are installed?
