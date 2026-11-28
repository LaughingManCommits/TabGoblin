# Security model

TabGoblin is a browser bridge: it puts a coding agent into a browser where the developer is
signed in, and leaves the user in control of what the agent reaches there. An agent uses it
through a CLI or through MCP; the controls on this page are the same for both, and
[one section](#cli-and-mcp-one-set-of-controls) says exactly where the two differ. This page is
written for review: it states the threat model, then each control with the risk it addresses,
the mitigation, where it is enforced and where it stops, and closes with what is tested and
the risks that remain.

The components and flows are in the [architecture](architecture.md). A shorter summary for an
organisation's assessment is the [corporate assessment](corporate-assessment.md).

Every control is labelled with one of three classes:

| Class | Meaning |
|---|---|
| **Enforced** | Holds whatever an agent or a web page does and however TabGoblin is configured, under the assumptions below |
| **Configurable** | A restriction that holds once the user, or whoever manages the machine, has set it |
| **Best effort** | Reduces a risk by a heuristic. It has known gaps and must not be relied on alone |

## Threat model

### What is protected

- The user's authenticated sessions in the browser: cookies, tokens, stored credentials.
- Content of tabs and websites the user did not authorize.
- The integrity of the user's accounts: nothing is sent or changed without the user's intent.
- The user's control: grants, approvals and settings.

### Who is trusted with what

| Party | Trust | Consequence |
|---|---|---|
| The user | Full | Only the user, in the extension's popup, creates sessions, sets access levels, approves submissions and pairs |
| The server and the extension | Enforce the rules | Each checks independently where it can |
| The coding agent | Limited to what the user granted | Bound to its own sessions, their websites and their access level. Treated as possibly misled by page content |
| A web page | None | Its content is data. Its scripts cannot reach the extension's worker or popup |
| Other local software, without the pairing token | None | Cannot pair with the extension and cannot attach to the server |
| The model provider of the agent | Outside TabGoblin | Receives what the agent sends it. Governed by the agent's own configuration and contract |

### Threats considered

1. An agent, by error or because a page misled it, reads or changes more than the user meant.
2. A web page tries to obtain grants, approvals or data through the extension.
3. A web page or another website tries to connect to the local server.
4. An agent tries to use another agent's tabs.
5. A command is replayed, repeated or runs after its authorization ended.
6. Credentials leave the browser through tool output.

### Assumptions and what is out of scope

- **The user's operating-system account is not compromised.** The pairing token, the agents'
  keys and the settings file are protected by the home folder's permissions and by nothing
  else. A program that runs as the user can read and write them. TabGoblin does not isolate
  one program of the user from another, and that includes a coding agent with a shell.
- **Chrome enforces its extension model:** `activeTab`, the isolation of extension pages and
  workers from web pages, and the `Origin` header of a WebSocket handshake.
- **The user reads what a prompt shows** before allowing it.
- Out of scope: what the model provider does with what the agent sends; other tools the agent
  has (a shell, an HTTP client, other MCP servers); the security of the websites themselves.

## Summary of controls

| Control | Class | Enforced in |
|---|---|---|
| No access to cookies, headers, website storage, debugger or script evaluation | Enforced | Manifest permissions; no such tool or protocol action |
| A tab is reachable only after the user's click on it | Enforced | Chrome (`activeTab`); extension |
| A session is bound to exact origins, one tab, one agent | Enforced | Extension, before every command and step |
| Access levels Read, Explore, Read / Write | Enforced | Extension (`policy.ts`) |
| Password fields are neither read nor filled | Enforced | Content script |
| Other credential fields (by their `autocomplete` value, or a name or id such as `token`, `otp` or `cvv`) are neither read nor filled | Best effort | Content script |
| A recognised submission (a form's submit control, Enter in a form field or text box) needs the agent's declaration and Write access | Enforced | Extension |
| A submission needs the user's approval | Configurable (default: every time; mandatory under the strict profile and for high-impact actions) | Extension, popup |
| An approval is bound to the content the user was shown | Enforced | Extension, content script |
| Nothing is retried; a submission id is used once | Enforced | Server, extension |
| Pause, revoke, disconnect, expiry take effect before the next step | Enforced | Extension |
| Agent identity by key; no session passes between identities | Enforced, within the limits of the home folder | Server, extension |
| Loopback only, origin pinning, mutual proof of the pairing token | Enforced | Server, extension |
| Blocked sites, allowed sites, maximum level, no screenshots, time limits, strict profile | Configurable | Server and extension |
| No screenshot while a frame of another site is in view | Enforced | Extension |
| Redaction of credential-like text | Best effort | Content script, extension |
| Recognition of submitting controls outside forms, and of high-impact controls anywhere | Best effort (English labels) | Content script, extension |
| Marking of page content as untrusted | Best effort (advice to the model) | Server |
| Audit record on disk | Configurable; a record, not tamper-proof | Server |

### Where a command is checked

![Where a command is checked: three checks in the TabGoblin server and four in the TabGoblin extension, each with the error codes it refuses with, before one fixed operation runs in the authorized tab. Your settings and asking about a submission are configurable; the other checks are enforced; only allowlisted text leaves the page (enforced), and credential-like text is taken out of it (best effort).](assets/diagrams/command-checks.svg)

| Step in the picture | Class |
|---|---|
| Who is asking and whether the arguments are valid, in the server; the session, origin and access-level checks in the extension | Enforced |
| Whether your settings allow it: the interface, blocked and allowed sites, the highest level, screenshots | Configurable: nothing is restricted until it is set, and then it is enforced, in the server before anything is sent and in the extension at the moment of the command |
| Whether the user is asked about a submission | Configurable: every time by default. Enforced under the strict profile, and for a control recognised as high-impact, which is itself best effort |
| The check right before the page is touched | Enforced |
| Only allowlisted text leaves the page | Enforced |
| Credential-like text is taken out | Best effort |

The path is the same for a CLI command and an MCP call from the first box on.

## CLI and MCP: one set of controls

An agent reaches TabGoblin by running CLI commands or by calling MCP tools. The two are
interfaces to the same server, and no control depends on which one is used. They stand side by
side over one core and neither is built on the other: the tools are defined once, in no
protocol's terms (`ToolDefs`), and a command goes from the terminal to the server and through it
to the browser without any MCP being spoken or run (`Cli`, `Link`, `Hub`, `Commands`,
`BrowserService`). A test holds those classes to importing nothing of the MCP library
(`SeparationTest`), which is what a user shows to an organisation that forbids the protocol.
Such an organisation turns MCP off in the settings file (`interfaces = cli`, [the security
policy](#the-security-policy)); the limits of that switch are stated there.

**Shared.** Every row of the table above. A CLI command and an MCP tool call are validated by
the same code in the server, are refused by the same blocked sites and policy, and reach the
browser extension as the same command, where sessions, origins, access levels, approvals,
pause and revocation are checked. The extension has no rule that asks which interface a
command came by; it knows an agent by its id. (The name it shows for an agent of the CLI ends
in "(command line)", which is for the user and decides nothing.)

**Different,** and only in how an agent is identified over time:

| | CLI | MCP |
|---|---|---|
| Authentication | The pairing token and the agent's key are proven by every command's process | Proven once when the agent's link connects, and again if the server is started anew |
| A name | Required. A command without `--agent` is not run | Optional. Without one the agent has an id for that start, and no tab comes back to it |
| Session management | The server keeps the agent, and so its sessions' connection, for ten minutes after its last command | The agent is there while its process is; its sessions come back by its key when it starts again |
| Processes of one key at once | Are the one agent of that key | The second gets an id of its own, with no tab |
| Permissions | The same | The same |
| Approvals | The same rule decides whether the user is asked; the command waits for the answer | The same rule decides whether the user is asked; the call waits for the answer |

What follows from the differences, and is to be weighed:

- Through the CLI an agent is its name, backed by that name's key file. Two programs that run
  commands under one name are one agent and share its tabs.
- An agent of the CLI stays connected for ten minutes after its last command. In that time a
  process that holds its key can use its sessions, as it could at any time by starting the
  agent again. Pause, revoke and *Disconnect* act at once, as for any agent.
- A command's arguments and answers can be kept by whatever runs it: a shell's history, a
  terminal's scrollback, an agent's own log. Neither the pairing token nor a key is ever
  among them.

**The CLI is not a way around a restriction.** It grants nothing that MCP does not, and the
settings file's policy applies to it unchanged. It does remove the technical dependency on
MCP: an agent that can run a local program can use TabGoblin where no MCP server can be added.
A rule that is meant to keep agents out of the browser therefore has to be about that, not
about the protocol ([corporate assessment](corporate-assessment.md#restrictions-on-mcp-and-the-cli)). TabGoblin's own material
tells agents not to change interface by themselves when one is blocked
([skills](../skills/README.md)); that is advice to a model, and best effort.

## Least privilege

**Risk.** A browser integration with broad permissions exposes everything the browser holds.

**Mitigation.** The extension's manifest permissions are exactly `activeTab`, `scripting`,
`storage` and `alarms`. It has no host permissions and registers no content script for all
pages: it cannot touch a tab until the user clicks its icon there. The tools map to a fixed
set of operations. The `storage` permission is for the extension's own data (pairing,
settings, sessions) and is no access to a website's storage.

| Not available | Why |
|---|---|
| Cookies, HTTP headers, request and response bodies | No tool and no protocol action; no `cookies` or `webRequest` permission |
| `localStorage`, `sessionStorage`, IndexedDB | The content script does not read them |
| Passwords and tokens in fields | Password fields, and fields recognised as credentials by their `autocomplete` value, name or id, are not read and cannot be filled or typed into. A credential field that none of these marks is an ordinary field |
| JavaScript execution | No evaluate action exists; commands map to fixed operations |
| Arbitrary HTTP requests | No such tool. A tab can be navigated within its session's origins |
| The Chrome debugger | No `debugger` permission |
| Raw HTML, attributes, hidden content | Results contain role, name, a few states and visible text |
| The clipboard | No clipboard permission. A paste event used to fill an editor carries only the command's text |

**Enforced in.** `chrome-extension/manifest.json`; the action list in `policy.ts`; the
end-to-end suite asserts the four permissions.

**Limitations.** Whatever is *visible* in an authorized tab is available to the agent,
including a secret that a page displays as ordinary text.

## Agent identity and authentication

**Risk.** One local agent uses tabs that were authorized for another; a restarted program
inherits access by claiming a name.

**Mitigation.** All agents are served by one process, which has one authenticated connection
to the extension; on it each agent has an id of its own, which the server derived from the
agent's proven key, and every command, event and answer names its agent. A session has one
owner, and every command is checked against it. Another agent cannot list, read or act on it,
and a forged session id is refused.

- **Identity by key.** A program names its agent with `--agent <name>`. The name selects a key
  of 256 random bits in a file of its own (`agents/<name>.key` beside the pairing token),
  created at the agent's first start. The process the agent starts proves possession of the
  key to the server (HMAC-SHA256 over nonces of both sides). The server derives the agent's id
  from the key, and the extension binds sessions to that id.
- **A restart keeps the identity** because the key is the same. That is what lets a user
  restart an IDE or the server without authorizing every tab again.
- **A name grants nothing.** The display name is shown to the user and decides nothing. A
  session never passes from one id to another. An agent started without `--agent` has an id
  for that start only; no tab comes back to it.
- **One agent per key at a time.** Of two processes holding the same key, the first is that
  agent; the second gets an id of its own.
- **The CLI is the same agent model, not a second one.** An agent runs the tools as commands
  ([CLI guide](cli.md)). Every command is a
  process that proves the pairing token and the key of its `--agent` name, exactly as an MCP
  agent's process does; a command without a name is not run. The commands of one key are that
  key's one agent, one after another or at once, and the server keeps the agent between them
  for ten minutes. A command whose key an MCP-connected agent holds is refused
  (`AGENT_IN_USE`): it is not let into that agent's connection and gets no id of its own. A
  command reaches the browser only through the server's tool calls, so every rule on this page
  holds for it unchanged: authorization, origins, access levels, approval of submissions,
  blocked sites, the policy, pause, revocation and redaction. There is no rule that is
  different for a command, and no option of a command that changes one. Neither the pairing
  token nor a key is ever an argument, part of an answer or part of a log line.
- **The key is separate from the pairing token.** The extension never holds an agent's key. A
  new pairing token leaves every agent's identity; revoking one agent leaves the pairing and
  the other agents.

**Revocation** has two forms:

- *Disconnect* in the popup. The agent's sessions end, what it was running is cancelled, and
  the agent stays out until the user presses *Allow again*, which restores the connection and
  no tab. For an agent with a key the decision is kept across restarts of the agent, the
  server and the browser.
- `--revoke-agent <name>` on the command line. The key is deleted and a mark is left so that
  no new key is made for the name. Every tool of that agent answers `AGENT_REVOKED` from its
  next call. `--allow-agent <name>` removes the mark; the agent is then a new one, with a new
  id and no tab. `--list-agents` lists the names that have a key, each with its id, and the names that are revoked.

**Enforced in.** `AgentKeys.java`, `Hub.identify`, `Hub.serveCommand`, `Link.attach`, `Cli.java`;
`canUse` in `policy.ts`.

**Limitations.**

- What is particular to the CLI (an agent is its name, and stays connected for ten minutes
  after its last command) is under [CLI and MCP](#cli-and-mcp-one-set-of-controls).
- The keys are protected by the home folder and nothing else. A program that runs as the user
  can read a key and act as that agent, or create a key under a new name and be a new agent. A
  new agent has no tab until the user authorizes one.
- Revoking a name does not keep a program out: it can return under another name, as a new
  agent with nothing.
- A tab authorized for *Any agent* goes to whichever agent uses it first. The strict profile
  removes that option.

## Tab, origin and document isolation

**Risk.** An agent reaches a tab or a website the user did not authorize; a redirect or a
link carries a session to another site.

**Mitigation.** A session is one tab and the exact origins the user gave it: scheme, host and
port. Subdomains, other ports and other schemes are different origins.

- **Chrome enforces it.** The `activeTab` grant covers only the tab whose icon the user
  clicked and is withdrawn when that tab goes to another origin.
- **The extension enforces it again.** Before every command, and before each step that touches
  the page, it re-reads the tab's address and checks it against the session. The content
  script checks its own document's origin before each operation. An unknown address fails
  closed.
- **Navigation is checked in advance.** A destination outside the session's origins is
  refused. Links that lead elsewhere are not clicked. History moves go only to entries of the
  same origin.
- **Leaving suspends.** If the tab leaves its origins anyway (a redirect, a script, the user),
  the session is suspended at once and nothing of the new page is read. Returning does not
  resume it; only the user's click on that tab does. Adding a site to a session is a separate,
  explicit action in the popup.
- **Frames.** Frames from another origin are not read.
- **Documents.** An element reference is tied to one element of one document. References are
  not reused within a browser run, each session draws from its own block, and a reference to
  an element that changed or is gone is refused (`STALE_REF`).

**Enforced in.** Chrome; `gate` and `recheck` in `background.ts`; `content.ts`; `snapshot.ts`.

**Limitations.** A new tab that a page opens is not part of the session. Content that a page
of an authorized origin embeds from elsewhere by means other than a frame, such as an image,
is part of that page.

## Permission levels and capability enforcement

**Risk.** An agent that should only read also navigates, clicks or writes.

**Mitigation.** Each session has one of three levels, and each action has a minimum level
(`REQUIRED` in `policy.ts`):

| Level | Allows |
|---|---|
| Read | Read the page, scroll, take screenshots, wait |
| Explore | Also navigate within the session's origins, follow same-origin links, expand and collapse, hover, go through a list page by page |
| Read / Write | Also click other controls, fill fields, press keys that type, and submit as a declared submission |

What Explore may click is decided from what the element is (`checkClick`): a same-origin link
or a control that only shows or hides content. Enter or Space on a button or link is treated
as a click on it (`checkKey`).

**Checked when.** When a command arrives, and again immediately before each step that touches
the page: the session exists and belongs to this agent, it is not paused, suspended or
expired, the tab is on one of its origins at that moment, the level covers the action, the
site is not blocked, and the policy allows it. A command can take seconds and can wait a
minute for the user; access that ended in the meantime is not used.

**Enforced in.** The extension (`policy.ts`, `background.ts`). The server additionally refuses
what the settings file rules out before anything is sent.

**Limitations.**

- **Explore loads pages.** A website that changes state on a plain link (some logout or vote
  links) can be affected. Read does not navigate. Hovering makes a page do whatever it does on
  hovering.
- **Typing is not confirmed.** With Read / Write, text entered into a field is not put to the
  user, and a page may save what is typed without a submission.
- **Controls without a recognisable role.** Enter or Space on an element that is not a button,
  link or text box to the browser, and is not marked as keyboard-operable by the page, is
  pressed without the checks for submissions.

## Submission approval and replay protection

**Risk.** An agent sends, changes or deletes data that the user did not intend; a submission
is sent twice; the content changes between approval and sending.

**Mitigation.**

- **Reading, filling and submitting are separate.** Filling never submits and never presses
  Enter: a line break in a text is entered as content.
- **A submission must be declared** by the agent (`browser_submit`, or `intent: "submit"`) and
  needs Read / Write access. A click on a control that submits a form is refused otherwise.
- **Enter in a text box is a submission,** because a page does not say whether Enter sends
  what is written. Two exceptions, where Enter sends nothing: a search box (by type, role or
  search region; for a one-line field also by a name that says search, find or filter), and a
  text box that points to a visible list of options.
- **The user approves.** The popup shows who asks, the control, the website and the beginning
  of what would be sent (never a password). Page-supplied and agent-supplied text is shown as
  quotation, apart from the extension's own words. Deny, or no answer within a minute, means
  nothing is typed or sent.
- **The prompt resists accidental consent.** It opens by itself, which moves the keyboard
  focus from the page into the popup. For its first 0.7 seconds it takes no answer and the
  rest of the popup takes no key or click; Deny comes before Allow in keyboard order.
- **An approval is bound to its request and its content.** The control, the fields of its form
  and the content to be filled are fingerprinted before the user is asked and again after the
  answer, before anything is entered. If the fingerprint or the document differs, nothing is
  sent (`APPROVAL_STALE`). The session is checked again as well. An answer is used once, for
  the request it was given for, within a minute.
- **Replay protection.** A submission id is processed once. Identical content within two
  minutes is refused unless the agent explicitly repeats it. A command id is accepted once per
  connection. An unknown outcome is recorded as `UNCERTAIN` and never resent.
- **A refusal stands.** What the user declined is not asked again for five minutes, and a
  session whose last three requests were declined or unanswered may not ask at all for that
  long. One request waits at a time.
- **The outcome is read from the page** afterwards and reported as `CONFIRMED`, `FAILED` or
  `UNCERTAIN`: what the browser showed, not a confirmation from the site's backend.

How often the user is asked is a setting, general and per session:

| Setting | The user is asked | Class |
|---|---|---|
| Ask every time (default) | About every submission | Enforced while set |
| Automatic | The first time for each control. An Allow then stands for that control (same session, website, kind of request and name) for 15 minutes and at most five submissions a minute. It is held in memory and ends with a pause, a change of access, the tab leaving the site and a restart of the extension | Configurable |
| Do not ask | Never, except for high-impact actions | Configurable |

Actions recognised as destructive, financial or publishing ask under every setting. The strict
profile forces *ask every time*.

**Enforced in.** `policy.ts` (`checkKey`, `needsAsking`, `checkAsk`), `background.ts`,
`submit.ts`, the popup; submission ids in `BrowserService.java`.

**Limitations.**

- **Recognition is best effort.** Outside forms, a control that submits is recognised by its
  English label, and a high-impact control is recognised by its English label everywhere. A control that is not recognised is an ordinary click under
  Read / Write, unless the strict profile is on.
- **"Confirmed by reaction"** means the page behaved as if it accepted, not that the server
  stored anything.
- **Automatic mode.** An Allow is for the control, not for the text: an agent that is misled
  can send other content to the same control within the 15 minutes, and a control is known
  only by its name on that website.
- **Do not ask.** High-impact actions still ask, but for Enter they are recognised only by the
  name of the text box.
- What changes on the page between the second fingerprint and the click is not seen.
- A prompt is text on a screen, written in part by a page or an agent. The control is only as
  good as the user's reading of it.

## Session expiration and revocation

**Risk.** Access outlives its purpose, or continues after the user withdrew it.

**Mitigation.**

- The user chooses a duration when authorizing: until revoked, one hour or eight hours.
- The policy can set a maximum lifetime and an idle limit for every session (see
  [the security policy](#the-security-policy)). The strict profile sets 8 hours and 30 minutes
  unless the file says otherwise.
- **Pause** stops the agent in a tab and refuses new commands until resumed. **Revoke** ends
  the session. **Disconnect** ends every session of an agent. Lowering the level stops what
  needed the higher one. Each takes effect at the running command's next step.
- Closing the tab ends its session; closing the browser ends all sessions.
- `--rotate-token` ends every pairing before its next command.

**Enforced in.** The extension (`endsAt`, `recheck`); sessions are stored in
`chrome.storage.session`.

**Limitations.** What was already dispatched to the page is not undone. A session with no
time limit lasts until the browser closes.

## Screenshot restrictions

**Risk.** A picture shows more than the text tools return: content of an embedded frame from
another site, or anything the policy meant to keep from leaving as an image.

**Mitigation.**

- No screenshot is taken while a frame or embedded file from another origin is in view
  (`SCREENSHOT_BLOCKED`). Enforced.
- `screenshots = off` in the settings file disables screenshots for every agent
  (`SCREENSHOTS_DISABLED`); the strict profile sets it by default. Configurable.
- A screenshot shows the visible viewport of the authorized tab only, and TabGoblin's own
  notice is removed from the page first.

**Enforced in.** `foreignFramesInView` in `interact.ts`, `background.ts`; the policy in the
server and the extension.

**Limitations.** A frame smaller than 8 pixels a side does not block a picture. What a page
shows of another site by other means, such as an image, is in the picture. Text in a picture
is not redacted.

## Sensitive information handling

**Risk.** Credentials or hidden data leave the page in tool output or in logs.

**Mitigation.**

- **Allowlisted output (enforced).** A snapshot or extract contains roles, names, a few states
  and visible text. Scripts, styles, hidden inputs and hidden content are not visited. The
  value of a password or credential-like field is not returned, and such a field cannot be
  filled (`SENSITIVE_FIELD`).
- **Redaction by shape (best effort).** In the text of a snapshot or extract and in every
  address a tool reports, these are replaced by `[redacted]`: a block marked as a private key;
  a token of three encoded parts (the form of a JWT); a credential of 16 or more characters after `Bearer` or `Basic`; a
  value of eight or more characters with letters and digits after a name such as `password`,
  `secret`, `token` or `api_key`; the value of an address parameter of such a name, also
  `code` and `key`; and a user and password in front of a host.
- **Logs without content (enforced).** Server logs and the extension's activity list contain
  command ids, session ids, operation types, durations, outcomes and error categories. They do
  not contain page content, typed text, full addresses, cookies, headers or the token.
- **Editors.** Filling a rich-text or code editor uses events any page script may create. The
  shortcuts sent are fixed; a hidden field is used as an editor's input only when it has no
  name, is keyboard-reachable and sits inside a visible box; the value of an editor's input
  element is not returned.

**Enforced in.** `snapshot.ts`, `extract.ts`, `interact.ts`, `redact.ts`, `Log.java`.

**Limitations.** Redaction is a net with holes: a secret of no known shape passes, as does one
shown under another name or in a picture. A secret that a page displays as ordinary content is
ordinary content to TabGoblin. Do not authorize a tab that shows secrets you do not want an
agent and its model provider to receive.

## Untrusted page content

**Risk.** A page contains text written to steer an agent (prompt injection).

**Mitigation.**

- Every result marks its content as untrusted data, and the server's instructions tell the
  agent not to follow instructions found in pages. Best effort: this is advice to a model.
- Page content cannot change sessions, permissions, pairing or settings: those have no tool
  and change only through the popup. Enforced.
- The notice that TabGoblin draws inside the page lives in a closed shadow root. Page scripts
  cannot read it; its buttons react only to clicks the browser marks as the user's. It can
  pause a session and open the popup, and it can grant nothing: there is no Allow outside the
  popup. It is told a state and fixed words, nothing of a page, an agent or a question.

**Limitations.** TabGoblin cannot keep a model from being misled *within* the access the user
granted. A page could talk an agent with Read / Write access into submitting something. The
access levels, the submission approval and the strict profile exist to bound that.

## Local transport security

**Risk.** A website or another local program connects to the server and drives the browser,
or impersonates the server to the extension.

**Mitigation.**

| Protection | Detail |
|---|---|
| Loopback only | The server binds `127.0.0.1`, one port for the extension and for the agents' processes |
| Origin pinning | The extension's WebSocket handshake must carry this extension's `chrome-extension://` origin, which a web page cannot forge. An agent's process connects on the path `/link` and carries none, and a page cannot make that connection: the browser sends an `Origin` with every WebSocket a page opens |
| Mutual proof | HMAC-SHA256 challenge and response over the pairing token in both directions. The token is not sent, so a process that takes the port cannot drive the browser either |
| Agents' processes prove themselves | A process that attaches to the server proves the pairing token, with a prefix different from the extension's pairing, and a named agent's key as well |
| Version check | A peer of another protocol version is refused with a reason. The version is 1, counted from the release with one connection for every agent |
| Lockout | Ten failed pairings block the extension's connections for a minute; ten wrong proofs from agents' processes block attaching for the rest of that minute |
| Rotation | `--rotate-token` ends every pairing before its next command. The token file is replaced atomically |
| Validation | Every inbound message is parsed into a typed message or dropped |
| Limits | Message size (1 MB to the extension, 8 MB to the server), 20 commands per second per agent, at most 20 commands waiting per tab, a deadline per command |
| Replay | A command id is accepted once per connection |
| No retries | A command is sent once; a timed-out command is cancelled so that it cannot run later |

The token is stored in `~/.tabgoblin/pairing-token` and in the extension's storage,
which content scripts cannot read. It is not logged.

**Enforced in.** `ExtensionServer.java`, `Pairing.java`, `Hub.java`, `Link.java`,
`ExtensionConnection.java`; `pairing.ts`, `protocol.ts`, `background.ts`.

**Limitations.** The connection is not encrypted; it does not leave the loopback interface. A
program that can read the token file can attach as an agent or pair as a browser. The token is
as protected as the user's home folder.

## Blocked sites

**Class.** Configurable. **Risk.** An agent works on a site the user or the organisation never
wants an agent on, because a tab there was authorized by mistake.

**Mitigation.** The settings file names sites no agent may work on, whatever a tab is
authorized for. The product ships no entry.

- **An entry is a domain.** It blocks that domain and every subdomain, on every port, for
  `http` and `https`: `example.org` blocks `mail.example.org:8443` and not `notexample.org`.
  An address that is a number is blocked only by itself. There are no patterns and no paths.
- **The server refuses first.** Before a command is sent it checks the session's authorized
  sites and the address its tab was last reported at; `browser_navigate` to a blocked address
  is refused the same way. `browser_status` still answers.
- **The extension refuses as well,** against where the tab is at that moment. It offers no
  authorization on a blocked site, resumes no session there and adds no such site to one.
- **Fail closed.** If the file exists and cannot be read, or an entry is not a domain, every
  command is refused (`SETTINGS_UNREADABLE`) and the server's panel says what is wrong. A
  missing or empty file blocks nothing.
- **Disclosure.** An agent is told the one site it ran into, and which of its own sessions is
  blocked. It is never given the list.
- A blocked session is not ended; it answers `SITE_BLOCKED` until the site is taken off the
  list. The file is read again when it changes.

**Enforced in.** `BlockedSites.java`, `BrowserService.refuseIfBlocked`; `blockedBy` and
`checkBlocked` in `policy.ts`, `gate` in `background.ts`. Both sides are held to one list of
test cases.

**Limitations.**

- The list governs TabGoblin's tools, not other tools an agent has.
- A session that spans a blocked site and another one is blocked as a whole.
- A page on a site that is not blocked may embed a frame from one that is. Its text is not
  read, as with every cross-origin frame.
- The file is protected by the home folder only. An agent that can run commands as the user
  can edit it.

## The security policy

**Class.** Configurable. **Risk.** Defaults that suit one developer are too permissive for an
organisation or for a sensitive task.

**Mitigation.** The same settings file, `tabgoblin.properties` beside the pairing token, can
restrict what every agent may do. It is a local file; nothing is fetched from anywhere. Every
entry takes something away. None grants anything: a tab is still authorized only by the user's
click.

| Entry | Effect |
|---|---|
| `security.profile = strict` | Every submission is put to the user (*automatic* and *do not ask* are disabled). A click on anything but a same-site link or an expand/collapse control counts as a submission: declared by the agent and approved by the user. A tab is authorized for one named agent, not for *Any agent*. Unless the file says otherwise: no screenshots, a session lasts at most 8 hours and ends after 30 minutes without a command |
| `allowed.sites = …` | Agents work on these domains and their subdomains only. Matching is as for blocked sites |
| `screenshots = off` | No agent takes a picture of a tab |
| `access.max = read` or `explore` | No session has more than this level, whatever it was given |
| `session.max.minutes = N` | A session ends N minutes after it was authorized |
| `session.idle.minutes = N` | A session ends when no command passed its checks for N minutes |
| `audit.log = on` | See [audit logging](#audit-logging) |
| `interfaces = cli` or `mcp` | Agents come by that interface only. With `cli`, no MCP agent is let in: an MCP start ends with the reason before any MCP message, the server refuses an MCP link (`interface_not_allowed`), and an MCP agent that is connected when the file changes is answered `INTERFACE_NOT_ALLOWED` by every tool from then on. With `mcp` the same for commands. Both named, or the entry absent, is both |

- **Enforced twice,** as blocked sites are: by the server before anything is sent, and by the
  extension at the moment of a command. The extension offers no authorization the policy rules
  out. The one exception is `interfaces`, which the server alone enforces: the extension cannot
  tell by which interface a command came, and would have to take the server's word for it.
- **Fail closed.** A value the server does not understand refuses every site
  (`SETTINGS_UNREADABLE`). The exception is `audit.log`: anything other than `on` leaves the
  record off. Minutes are whole numbers from 0 to 10080.
- **Disclosure.** An agent is told what restrictions hold (`browser_status`) and the one site
  it ran into, not which sites are allowed.
- **Immediate.** A change is in force when the file is saved.

**Enforced in.** `BlockedSites.Limits`, `BrowserService.refuseIfBlocked`; `checkLimits`,
`endsAt`, `askUnder`, `checkClick` in `policy.ts`; `gate` and `recheck` in `background.ts`.

**Limitations.**

- **The file is protected by the home folder only.** An agent that runs commands as the user
  can edit it. A policy meant to hold against the user of the machine requires the file and
  its folder to be protected by the operating system or by device management. TabGoblin does
  not do that and has no remote or signed policy.
- Typing is not confirmed, and Explore loads pages, under every profile (see
  [permission levels](#permission-levels-and-capability-enforcement)). `access.max = read`
  rules both out.
- It restricts TabGoblin's tools, not other tools an agent has.
- `interfaces = cli` turns MCP off in this server; it does not take the MCP library out of the
  jar, and the jar, its folder and its variables keep their names (`tabgoblin`,
  `TABGOBLIN_*`). An inventory that looks for the library or the names finds them. A build without
  the library is not made.

## Workspaces and requests for access

**Risk.** A convenience feature becomes a way to obtain access.

**Mitigation.**

- **A workspace is a name.** The user can file tabs of one task under a name. It groups them
  in the popup and is told to an agent with its own sessions. Each tab keeps its own
  authorization, agent, sites, level and expiry; an agent reaches no tab of another agent
  because both are filed together.
- **A request grants nothing.** An agent can ask for a higher level on a session it has, or
  for a tab on another site (`browser_request_access`). The popup shows the agent, the level,
  the site and the agent's reason, cut to 200 characters and shown as quotation. A higher
  level is given by the user's Allow there, never above the policy's maximum. A tab on another
  site cannot be given in the popup: it takes the user's click on that tab, as every
  authorization does.
- The agent is told that the user was asked, and nothing else. Nothing of the site or of a tab
  open there is read or reported before the user authorizes it.
- One request of an agent waits at a time, for ten minutes. A refusal stands for five minutes.
  What could not be granted (a blocked site, a site outside the allowed ones, a level above
  the policy's) is not put to the user.
- The popup opens by itself for a request, with the same 0.7-second hold as for a submission,
  and Deny before Allow.

**Enforced in.** `checkAccessRequest`, `workspaceName` in `policy.ts`; `requestAccess`,
`answerRequest` in `background.ts`.

**Limitations.** A request is text on the user's screen, written in part by an agent that a
page may have misled. Where Chrome cannot open the popup because none of its windows has the
focus, only the toolbar badge shows `?`.

## The server's panel

The server's optional window (`--panel`) is a window of the server's process, not a page.

| Property | Detail |
|---|---|
| No new way in | No port is opened for it and no website can reach it. A program that proves the pairing token can ask for the window to be shown, and for nothing else |
| It is the user's | It shows every agent with its sessions, times and log lines. No tool gives an agent any of it |
| Nothing of a page | A session is shown by its site, level and state, not by its page's title or address |
| It grants nothing | Stop, Kill, and a switch that closes the connection to the extension. It authorizes no tab and changes no level |
| The pairing token is handed over, not shown | A button puts the token on the clipboard. It is not displayed and not logged, and it is removed from the clipboard after a minute if it is still there |
| Ending takes two clicks | Stop and Kill act on the second click within four seconds |
| Memory only | The last 300 log lines are kept in memory for the window |

**Limitations.** Anyone at the desktop can use the window; it asks for nothing before stopping
the server or copying the token. Other programs can read the clipboard while the token is
there, and a clipboard history kept by the system is not emptied. The switch is not a
revocation: sessions stay in the extension while the connection is off.

## Audit logging

**Class.** Configurable, off by default.

With `audit.log = on` in the settings file the server writes one line of JSON for each command
it sent or refused, to `audit.jsonl` beside that file: the time, the agent's id, the session,
the action, the duration in milliseconds, and the outcome with its error category. No page
content, address or entered text is in it, and nothing is sent anywhere. At five megabytes the
file becomes `audit.1.jsonl` and a new one is begun, so at most ten megabytes are kept.

**Enforced in.** `Audit.java`, called from `Log.command`.

**Limitations.** The file is protected by the home folder: a program that runs as the user can
change or delete it. It is a record, not evidence. It is not forwarded anywhere; collecting it
is the organisation's task. It does not record what the user did in the popup.

## Software supply chain

| Aspect | State |
|---|---|
| Extension contents | TypeScript sources bundled with esbuild. No third-party library is in the extension; its build tools are development dependencies with a lockfile |
| Server contents | One jar, which is also the CLI, with the MCP Java SDK, a WebSocket library, a logging binding, and JavaFX for the optional window. Versions are fixed in `pom.xml` |
| Dependency checks in CI | `npm audit` for the extension and the test runner, failing on an advisory of high severity; GitHub's dependency review on pull requests, which covers the server's Maven libraries |
| Release build | Built by a GitHub Actions workflow that the owner starts by hand with a version, after every test suite passed on the tree with that version. Only the publishing job can write to the repository: it commits the version, tags that commit and publishes. A release from `main` is a release; one from another branch is a beta, marked as a pre-release |
| Integrity of a download | `SHA256SUMS.txt` with each release; a GitHub build-provenance attestation for each file (`gh attestation verify`) |
| Components | Two CycloneDX files with each release: the libraries in the server's jar, and the tools the extension is built with |
| Extension identity | The extension's id is fixed by a key in the manifest, and the server accepts WebSocket connections only from that id |

**Limitations.**

- The downloads are **not code-signed** for Windows or macOS; either system may warn.
- The extension is **loaded unpacked** with developer mode on. It is not in the Chrome Web
  Store, is not reviewed by Google, and does not update itself.
- Workflow actions are referenced by version tag, not by commit hash.
- A checksum and an attestation say that a file is what the workflow built, in the run that
  made the tag. The commit they name is the one before the tag's, which differs from it in the
  version only. They say nothing about what the code does.

## What is verified by tests

Each row is a property and the level of test that holds it. "Rules" are the pure functions in `policy.ts`; "DOM" the snapshot, extract and interaction tests under jsdom; "worker" the extension's worker run against a fake Chrome; "Java" the server's tests; "end-to-end" the real extension in a real Chrome, driven through real server processes. How to run them is in [development](development.md#tests).

| Property | Where |
|---|---|
| Only the four permissions; no content script registered for all pages | End-to-end |
| Wrong token, wrong origin, missing origin, other extension id refused | Java, end-to-end |
| The command line offers the server's tools and no other, each with the tool's own schema; a command line that is not understood sends nothing | Java, end-to-end |
| The commands of one name are one agent with its sessions from one process to the next and at once; another name is another agent with no tab; a name held by an MCP-connected agent is refused; a revoked name has no command, and allowed again is a new agent | Java, end-to-end |
| Through the command line a tab needs the user's authorization, a submission the user's approval, and pause, the access level and blocked sites hold | End-to-end |
| A command whose server goes away, that gets no answer in time or whose process is ended reports an unknown outcome, is cancelled in the browser where it can be, and is not sent again | Java |
| Old protocol version refused | Java, worker, end-to-end |
| Pairing lockout, token rotation | Java, end-to-end |
| A browser that comes with a token that is not the server's is told apart from one that has not come: the agent is told that pairing is what is missing, and where the token is, and never the token | Java, end-to-end |
| The server's window comes up by itself when a tool finds no browser and one came with another token: once until something is paired, not for an agent started with `--no-panel`, and not while the connection is switched off | Java |
| After a rotation, an agent's pairing on the old token counts for nothing while it is still open: no other agent is told that the browser is paired | Java, end-to-end |
| Nothing readable before authorization | End-to-end |
| Cross-origin navigation, links, redirects blocked or suspended | Rules, end-to-end |
| Cross-origin frame never read | DOM, end-to-end |
| An action on a blocked site is refused by the server before anything reaches the browser, and by the extension: for the site itself, a subdomain, another port, a session that spans it, and a navigation to it. A name that only looks like it is not blocked | Java, rules, worker, end-to-end |
| The server and the extension give the same answer on what an entry blocks: both are held to one list of cases | Java, rules |
| A session the server has not heard of yet is asked for before anything is sent to it; without an answer nothing is sent | Java |
| A settings file that cannot be read, or has an entry that is no domain, refuses every site and says so; mended, everything works as before | Java, worker, end-to-end |
| No tab on a blocked site is authorized, resumed, or added to a session; a session that is blocked later is marked and not ended, and works again when the site is taken off the list | Worker, end-to-end |
| An agent is told the one blocked site it ran into and never the list; the refusal is logged with its session and without the site | Java, rules, end-to-end |
| The list is not sent to an extension while it still checks the pairing, which an older extension would take for a failed pairing | Java |
| Another agent's session unreachable, forged session id refused | Rules, worker, end-to-end |
| A disconnected agent's sessions end with it; allowed again, it has no tab and its old session id is refused | Rules, worker, end-to-end |
| An agent is known by the id of its key: one that only gives itself another agent's name is told none of that agent's tabs and cannot reach them, whether the owner is connected or gone | Rules, worker, Java, end-to-end |
| A process that proves the pairing token and not an agent's key is not that agent: no proof, a made-up one, one made with the token, a name without a key, and a name that would be another file's | Java |
| Of two processes that hold one key at once, the second is another agent | Java, worker |
| A revoked agent has no tool, running or started again; no key is made for its name; another agent is not touched; allowed again it is a new agent | Java |
| The user's no to an agent with a key is kept beyond the browser's run | Worker |
| An agent's key is not the pairing token, and a proof of the one is no proof of the other; a new token leaves the keys | Java |
| An agent the user disconnected is refused on the server's one connection: the extension names it to the server, runs no command of it however often the server names it, and the server tells that agent alone that it has no browser; a server that names another agent is given nothing of that agent's | Java, worker, end-to-end |
| An agent that is started again with its key is told its tabs by the extension before it calls a tool, also under another name | Java, worker, end-to-end |
| A process that does not prove the pairing token is no agent of the server, and a series of them shuts the door; a program that holds the server's port is not taken for the server | Java |
| Agents of one server travel on its one connection, each with its own sessions; a command, an event and a log line of one agent reach no other, and a command of an agent the server never named runs nowhere | Java, worker, end-to-end |
| When the server's process is gone, a call that was waiting is answered as of unknown outcome and nothing is sent to the browser twice; stopped by the user, no agent starts it anew | Java |
| What was allowed when a command began is checked again right before the page is touched: a tab that moved to another site, an authorization that ran out, a pause, a revocation, a lower level, a disconnected agent, each between two steps of one command | Worker |
| The policy's restrictions are refused by the server before anything is sent, and by the extension at the moment of a command: no screenshots, the highest access level, only the allowed sites; a name that only ends alike is another site | Java, rules, worker |
| The strict profile: a click that may change something needs the agent's declaration and the user's yes; every submission is asked about whatever was set; no tab for *Any agent* | Rules, worker |
| An authorization ends at the policy's longest time and after its time unused, at the command that finds it so and by itself | Rules, worker |
| A restriction in the settings file that cannot be read refuses every site, and is not taken for none | Java, rules |
| An agent is told what the policy restricts and never which sites are allowed | Java |
| Asking for access grants nothing: the session has what it had, no session comes of it, and nothing of a tab on the site asked for is told; only the popup answers; a no stands; one request waits at a time; what the policy rules out is not asked | Rules, worker, Java, end-to-end |
| The popup is brought up for a request, and for none that is refused; a request that has only just appeared takes no answer, and Deny comes before Allow | Worker, end-to-end |
| A workspace gives nothing: an agent reaches no tab of another agent in the same workspace, each tab keeps its level, and its buttons do what each tab's own does, for the tabs of that name only | Rules, worker, end-to-end |
| Refs do not cross documents or sessions; replacements are stale | DOM, end-to-end |
| Passwords, hidden inputs, scripts, hidden content excluded | DOM, end-to-end |
| Hidden form fields not offered as editors; an editor input's value not returned | DOM |
| Editor text never entered twice; an unseen result not reported as success | DOM, editor lab |
| A fill never presses Enter, in a text area or an editor | DOM, end-to-end |
| Enter in a text box needs intent and the user's consent; a declined one is not pressed | Rules, DOM, worker, end-to-end |
| A message sent with Enter gets a verdict, and the same text is not sent twice | DOM, worker, end-to-end |
| A text box is not excused from the question by `aria-expanded`, a missing option, or search wording on a text area | DOM |
| Enter or Space on a control that submits is refused like a click on it | Rules, DOM, worker, end-to-end |
| A key allowed for one element is not pressed on another | End-to-end |
| A prompt that has only just appeared takes no answer, and nothing else in the popup takes a key meanwhile; from the keyboard Deny comes first; the prompt cannot be folded away | Rules, worker, end-to-end |
| What the user declined is not asked again until they take it back; a run of refusals silences a session; one request waits at a time | Rules, worker, end-to-end |
| The prompt names the agent, the control, the site and what would be sent, for every kind of request; a password is never shown in it | DOM, worker, end-to-end |
| Automatic: asked the first time for each control, and the prompt says that an Allow will stand; an Allow does not reach another control, another site, a high-impact action or a control without a name, does not cover a burst, and is gone after a pause, after the tab left the site and after a restart | Rules, worker, end-to-end |
| Read and Explore cannot write; submissions need intent | Rules, worker, end-to-end |
| Collecting takes no more steps, time or size than its limits, whatever is asked; it stops when the session is paused; with Read access it follows no page, and with Explore only a link an ordinary click may press: not a control that submits, not a link to another site; it reads nothing of a page outside the session's sites | Java, worker, end-to-end |
| Hovering needs Explore, presses nothing and does not move the keyboard | DOM, worker, end-to-end |
| Declined or cancelled submission types nothing and sends nothing | End-to-end |
| Duplicate and uncertain submissions not repeated | Java, end-to-end |
| An approval is used once and for its own request: answered again, or made up, it does nothing | Worker |
| Content that changed after the user was asked, a document that is another, and a tab that left its site while the question was open: nothing is sent | Worker |
| Replayed ids, stale deadlines, floods, malformed messages refused | Worker, end-to-end |
| Commands that pile up for one tab are refused beyond twenty, at once | Worker |
| No picture is taken while a frame or a file of another site is in view, also one inside a frame of this site | DOM, worker |
| What looks like a credential is taken out of text and addresses; plain words about passwords and tokens stay; a megabyte of text is gone over in bounded time | Rules |
| Popup requests from a web page or another extension ignored | Worker |
| Page scripts can neither read nor operate the notice in the page | End-to-end |
| The notice offers the way to the popup only while an answer is needed; a click a page makes up does nothing; the worker opens the popup only for a tab whose session has a question waiting, and nothing is answered by it; the page is told a state and nothing of the question | DOM, rules, worker, end-to-end |
| The agent's snapshots, texts and screenshots have nothing of the notice; a screenshot also not while the page is busy and draws late | DOM, worker, end-to-end |
| The notice is told a state and fixed words, and nothing of a page | Rules, DOM, worker |
| Injected page text changes no session or permission | End-to-end |
| The server's panel shows a session's site, access and state, and nothing of its page's title or address | Java |
| Switched off in the panel, the extension is closed and not let in, without that counting as a failed pairing; the agent is told why; switched on, it pairs again | Java |
| A button of the panel that ends the server acts on the second click only; bringing the panel up to date, or choosing a tab in it, sends the server nothing | Java (needs a display) |
| Log lines are kept in memory only, and no more of them than were asked for | Java |
| The pairing token that the panel copies goes to the clipboard and into no log line; it leaves the clipboard again unless something else was copied since | Java (the clipboard's part needs a display) |
| The badge says `ON` only while a connected agent may use an open tab; a server that leaves two heartbeats unanswered is taken for gone | Rules, worker, end-to-end |
| Logs free of token and content | End-to-end |
| The record on disk is written only when the settings ask for it; a line has ids, the action, the time and the outcome and no other field; a value cannot break a line; a file that cannot be written stops no tool; the file is begun anew at its limit | Java |

## Residual risks

These remain after every control above. They are stated so that they can be weighed, not to
be dismissed.

- **Whatever is visible is shared.** Text, screenshots and non-password field values of an
  authorized tab go to the agent, and from there to the agent's model provider. Local
  execution of TabGoblin does not keep that data local, and by itself establishes neither
  confidentiality nor compliance with any corporate policy.
- **Website interactions can change state on the server side.** With Explore, loading a page
  or following a link may have side effects on a badly built site. With Read / Write, clicks
  and typed text act on the application with the user's authority. Controls that TabGoblin
  does not recognise as submissions are not put to the user outside the strict profile.
- **Website content may contain malicious instructions.** TabGoblin marks content as untrusted
  and keeps a page from changing grants. It cannot keep a model from being misled within the
  access it was given.
- **Secrets may appear in ordinary rendered content.** Redaction goes by shape and has gaps. A
  secret a page displays is delivered like any other text.
- **An authorized agent may transmit what it extracted.** To its model provider as a matter of
  course, and anywhere else its other tools reach. That is the same for MCP and for the command
  line: either way the result is given to the agent, and TabGoblin has no say in where the
  agent sends it. A command's output can in addition be kept by whatever runs it: a shell's
  history holds the arguments, and a terminal's or an agent's own log the answers.
- **No isolation within the operating-system account.** An agent with unrestricted access to
  the user's account (a shell, the file system) can read the pairing token and the agents'
  keys, edit the settings file and the audit record, and act as any local agent. TabGoblin
  separates agents that cooperate; it does not confine a program that runs as the user.
- **The user's approval is the last control for writes.** It is as good as the attention it
  gets. The automatic and do-not-ask settings trade that attention for convenience.
- **Blocked sites and the policy restrain TabGoblin's tools only,** and only as far as the
  settings file is protected.
- **A download is what the release workflow built.** Trusting one is trusting this repository
  and GitHub's build machines. The downloads are not signed.
