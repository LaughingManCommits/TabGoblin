# Security model

TabGoblin puts an AI agent into a browser where you are logged in. This page says what the agent
can reach, how that is enforced, what is tested, and what remains your risk.

## What is never exposed

| Not available | Why it cannot leak |
|---|---|
| Cookies, HTTP headers, request and response bodies | No tool, no protocol action; the extension has no `cookies` or `webRequest` permission |
| `localStorage`, `sessionStorage`, IndexedDB | The content script never reads them |
| Tokens and passwords | Password and credential-like fields are never read and cannot be filled or typed into |
| JavaScript execution | There is no evaluate action; commands map to a fixed set of operations |
| Arbitrary HTTP requests | No such tool; the agent can only make the tab navigate inside its sites |
| The Chrome debugger | No `debugger` permission |
| Raw HTML, attributes, hidden content | Results contain role, label, a few states and visible text only |

The extension's permissions are exactly `activeTab`, `scripting`, `storage`, `alarms`. It has no
host permissions: it cannot touch a tab until you click its icon there.

## Who is trusted with what

| Party | Trust | Consequence |
|---|---|---|
| You | Full | Only the popup changes sessions, access levels, pairing and settings |
| The extension and the server | Enforce the rules | Each checks independently where it can |
| The agent | Limited to what you granted | Bound to its own sessions, their sites and their access level |
| The web page | None | Its content is data; its scripts cannot reach the extension |
| Other local software | None without the token | Cannot pair, cannot drive the browser |

## Authorization

A session is **one tab** and **the exact origins you gave it** (scheme + host + port). Subdomains,
other ports and other schemes are different origins.

Enforced twice, independently:

1. **By Chrome.** The `activeTab` grant covers only the tab whose icon you clicked and is
   withdrawn the moment that tab goes to another origin.
2. **By the extension.** Before every command it re-reads the tab's address and checks expiry,
   pause, suspension, scope and access level; the content script checks its document's origin
   again before doing anything. An unknown address fails closed.

Consequences:

- Destinations are checked before navigating. Links leading elsewhere are not clicked. History
  moves go only to entries of the same origin.
- If the tab leaves anyway (a redirect, a script, you), the session is suspended at once. Nothing
  of the new page is read.
- Returning does not resume it. Only your click on that tab does. A redirect or an existing login
  never widens a session; adding a site to a session is a separate, explicit button.
- Frames from another origin are never read, whatever you are logged into there.

## Blocked sites

You can name sites that no agent may work on, whatever a tab is authorized for
([user guide](user-guide.md#blocked-sites)). The list is one line in the server's settings file.
The product ships no entry: the list is yours.

- **An entry is a domain.** It blocks that domain and every subdomain, on every port, for `http`
  and `https`: `example.org` blocks `mail.example.org:8443` and does not block `notexample.org`.
  An address that is a number is blocked only by itself. There are no patterns and no paths.
- **The server refuses first.** Before a command is sent to the browser the server looks at the
  session it is for: the site it was authorized for, every site you added to it, and the address
  its tab was last reported at. If one of them is blocked, nothing is sent. A session that is in
  none of the extension's reports yet is asked for first, and if no answer comes the command is
  not sent. `browser_navigate` to an address on a blocked site is refused the same way.
  `browser_status` still answers.
- **The extension refuses as well.** The server tells it the list. Before every command it checks
  where the tab is at that moment, which the server knows only from the extension's last report,
  and every site of the session. It offers no authorization on a blocked site, resumes no session
  there and adds no such site to one.
- **A list that cannot be read blocks everything.** If the file is there and cannot be read, or an
  entry in it is no domain, every command is refused (`SETTINGS_UNREADABLE`), and the server's
  panel says what is wrong. A slip in the file must not leave open the site it was meant for. A
  file that is not there, or has no entry, blocks nothing.
- **An agent is told the one site it ran into,** and, when it asks for its status, which of its
  own sessions is blocked. It is never given the list. The list is shown to you, in the server's
  panel.
- **A blocked session is not ended.** It stays authorized and answers `SITE_BLOCKED` until you
  take the site off the list; then it works as before. The file is read again when it changes,
  about twice a second at most. The extension is told ahead of the server's next command, and
  within about a second where none comes.
- **Refusals are logged** as scope violations, with the session and without the site.

Where it stops:

- The list governs what TabGoblin does. An agent that has other tools of its own, such as one
  that fetches web pages, is not held back by it.
- A session that spans a blocked site and another one is blocked as a whole, also while its tab
  is on the other one.
- A page on a site that is not blocked may embed a frame from one that is. Its text is not
  read, as no frame of another site is; what it shows is in a screenshot of the tab, as with
  every frame. The list does not filter what a page links to or embeds.
- The settings file has the protection of your home folder and no other. A program that can
  write there can change the list, as it can read the pairing token and the agents' keys.
- An extension from before this list is not told it and does not check it; the server's own
  check holds there too. Such an extension still offers to authorize a blocked site, and the
  tab then answers `SITE_BLOCKED`.

## Agents

All agents are served by one process, and each is a separate authenticated connection to the
extension, with its own id. A session has one owner, and every command is checked against it.
Another agent cannot list, read or act on it, and a forged session id is refused.

**Who an agent is.** An agent's program names its agent to the server with `--agent <name>`
([installation](installation.md#5-tell-your-agent-about-the-server)). The name picks a key: 256
random bits in a file of its own, in the folder `agents` beside the pairing token, made at the
agent's first start. The process the agent starts proves to the server that it holds that key
(HMAC-SHA256 over nonces of both sides, as the pairing does), and the server gives the agent
the id that follows from the key. The extension binds a tab to that id.

- **An agent that is started again is the same agent,** because it holds the same key. Its tabs
  are its own again as soon as the extension has found the server. That is what lets you
  restart an IDE, or the server, without authorizing every tab again.
- **A name gives an agent nothing.** What an agent calls itself is shown to you and decides
  nothing. A session never passes from one id to another. An agent that was started without
  `--agent` has an id for that start only: no tab comes back to it, and `browser_status` tells
  it so.
- **A key has one agent at a time.** Of two processes that hold the same key at once, the first
  is that agent; the second has an id for its start only.
- **The key is not the pairing token.** The extension never holds an agent's key, and an agent's
  process proves its key in words that no proof of the token uses. A new pairing token leaves
  every agent who it was; revoking one agent leaves the pairing and the other agents alone.

**Taking an agent away,** in two places:

- *Disconnect* in the popup. The agent stays out until allowed again, and its sessions end with
  it: what it was running is cancelled, and each of its tabs needs your click again. *Allow
  again* gives back the connection and nothing else. The agent's row says how many tabs a
  Disconnect will end, before you click. For an agent with a key your no is kept over a restart
  of the agent, of the server and of the browser. For an agent without one it holds for the
  agent as it is connected now, since its id never comes again.
- `--revoke-agent <name>` on the server's command line. The agent's key is deleted, so the id it
  had is nobody's, and a mark is left so that no new key is made for the name. Every tool of
  that agent answers `AGENT_REVOKED` from its next call on, whether it runs or is started
  again. `--allow-agent <name>` takes the mark off: the agent is a new one then, with a new id
  and no tab. `--list-agents` lists the names that have a key.

Where it stops:

- **The keys have the protection of your home folder and no other,** as the pairing token has. A
  program that runs as you can read a key and be that agent, or make a key under a new name and
  be a new agent. A new agent has no tab until you authorize one for it. TabGoblin tells
  agents apart that you configured; it does not defend one program of yours against another.
- **Revoking a name does not keep a program out.** A program can come back under another name,
  or with none: as a new agent, with nothing.
- **A tab you authorize for *Any agent* goes to whichever agent uses it first.** Under the
  [strict profile](#the-security-policy) there is no such tab.
- **Tabs of a revoked or vanished agent stay listed** in the popup until you revoke them or
  they run out. No agent can use them.

## The security policy

The server's settings file, `tabgoblin.properties` beside the pairing token, can restrict what
every agent may do ([user guide](user-guide.md#the-security-policy)). It is a file on this
machine, written by you or by whoever manages the machine; nothing is fetched from anywhere.
Every entry takes something away. None gives anything: a tab is still authorized by your click
alone.

| Entry | What it does |
|---|---|
| `security.profile = strict` | Every submission is put to you: the settings *automatic* and *do not ask* are out of force. A click on anything but a link of the site or an expand/collapse control counts as a submission: the agent has to declare it, and you confirm it. A tab is authorized for one named agent, not for *Any agent*. And, unless the file says otherwise: no screenshots, an authorization lasts 8 hours at most and ends after 30 minutes without a command |
| `allowed.sites = …` | Agents work on these domains and their subdomains only. An entry is read as an entry of the list of blocked sites is |
| `screenshots = off` | No agent takes a picture of a tab |
| `access.max = read` or `explore` | No session has more than this level, whatever it was given |
| `session.max.minutes = N` | An authorization ends N minutes after you gave it |
| `session.idle.minutes = N` | An authorization ends when no command passed its checks for N minutes |

- **Enforced twice,** as blocked sites are. The server refuses what it can tell before anything
  is sent. The extension is told the policy and checks it at the moment of a command, against
  where the tab is then; it offers no authorization the policy rules out.
- **A restriction that cannot be read is not taken for none.** A value the server does not
  understand refuses every site (`SETTINGS_UNREADABLE`), as a slip in the list of blocked sites
  does.
- **An agent is told what holds,** in `browser_status`, and the one site it ran into. It is not
  told which sites are allowed.
- **A change is in force as soon as the file is saved.** What was allowed without a question in
  the automatic mode ends when the profile becomes strict.

Where it stops:

- **The file has the protection of your home folder and no other.** An agent that runs commands
  as you can edit it. A policy that an administrator means to hold against the user of the
  machine needs the file, and the folder it is in, to be protected by the system; TabGoblin
  does not do that.
- **Typing is not confirmed.** Under the strict profile a click that may change something is
  confirmed, and so is every submission. Text that an agent enters into a field with Write
  access is not, and a page may save what is typed without a submission.
- **Explore loads pages.** A link is followed without a question under every profile, and a
  site may change something on a plain link. `access.max = read` rules that out.
- **It restricts TabGoblin's tools,** not other tools an agent has.

## The local connection

| Protection | Detail |
|---|---|
| Loopback only | The server binds `127.0.0.1`, for the extension and for the agents' processes |
| Agents' processes prove themselves | The process an agent starts connects to the one server on the port after the agents' eight. Each side proves that it knows the pairing token, with words that differ from the extension's pairing, before a message of the agent's passes; a process that names an agent proves that agent's key as well ([Agents](#agents)). Ten wrong proofs in a minute, and no process is taken for the rest of it. A program that can read the token can become an agent this way, as it could before by starting the jar itself |
| Origin pinning | The WebSocket handshake must carry this extension's `chrome-extension://` id; web pages cannot forge it |
| Mutual proof | HMAC challenge-response over the pairing token in both directions; the token is never sent, so a process squatting on the port cannot drive the browser either |
| Nothing on an unproven word | A server names itself in its first message, before the proof. The extension uses that only to turn away an agent you disconnected; what a server is given depends on the id in its proven answer |
| Version negotiation | A peer speaking another protocol version is refused with a reason. The version is 3. An extension or a server of version 2 is refused as any other: it would hand an agent's tabs on by the agent's name, and know nothing of the security policy |
| Lockout | Ten failed pairings block new connections to that server for a minute |
| Rotation | `--rotate-token` ends every pairing before its next command |
| Validation | Every inbound message is parsed into a typed message or dropped |
| Limits | Message size (1 MB to the extension, 8 MB to the server), 20 commands per second per agent, at most 20 commands waiting for one tab, per-command deadlines |
| Replay | A command id is accepted once per connection |
| No retries | A command is sent once; a timed-out command is cancelled so it cannot run later |

The token is stored in `~/.browser-context-mcp/pairing-token` and in the extension's storage,
which content scripts cannot read. It is never logged. At a rotation the file is replaced in one
step, so that a process reading it finds the old token or the new one and never half of one.

## Submissions

The rules. What you see and click in the popup is in the
[user guide](user-guide.md#5-submissions).

- Reading, filling and submitting are separate. Filling never submits, and never presses Enter:
  a line break in a text is entered as content, also when the text is typed key by key.
- A submission must be declared by the agent, needs Write access, and by default your confirmation.
  Destructive, financial and publishing actions always ask.
- Enter in a text box is a submission. The page does not say whether it sends what is written or
  starts a new line, so it is treated as sending: declared by the agent, allowed by you in the
  popup, which names the text box, sent once, refused as a repeat, and judged by what the page
  does afterwards.
- Two exceptions are pressed without all that, because Enter there submits nothing:
  - A search box: an input of type `search`, an element with the role `searchbox`, or a text box
    inside a search region. A one-line field also counts when its name or placeholder says
    search, find or filter. A text area or an editor never counts by its name.
  - A text box that points to a list of options (`aria-controls`, `aria-owns` or
    `aria-activedescendant`) which exists, is visible and is a list by its role. Enter takes the
    highlighted option. `aria-expanded` alone is not enough.
- Enter or Space on a button or link is a click on it, and no way around the rules for clicks.
- A key is pressed only on the element it was checked on. If the keyboard has moved by the time
  you allow it, nothing is pressed.
- The prompt opens by itself, which moves the keyboard from the page into the popup. That is
  kept, because a request nobody sees runs out after a minute. So that it cannot turn into
  consent, the prompt takes no answer for the first 0.7 seconds, nothing in it is focused but
  the prompt as a whole, and the first stop for Tab is Deny: a key or a click that was on its
  way to the page declines at worst. For those 0.7 seconds the rest of the popup takes no key
  or click either, so that such a key does not press something else there.
- You are asked before anything is typed. Declining leaves the page untouched.
- The prompt shows the beginning of what would be sent: the texts the submission fills in, or
  what the text box holds. It is shown to you in the popup and goes nowhere else. Passwords and
  other credentials are left out. The texts and the names in the prompt come from the page or
  the agent, so they are shown as quotations, apart from the extension's own words.
- How often you are asked is your setting: every time (the default), the first time for each
  control (automatic), or not at all. High-impact actions ask under every setting. In the
  automatic mode an Allow stands for the same control only (the same session, the same website,
  the same kind of request, the same name), for 15 minutes, for at most five submissions a
  minute. It is kept in memory only: it ends with a pause, a change of access, the tab leaving
  the site and a restart of the extension, and the popup shows it with a way to end it. The
  prompt says, before you answer, when an Allow will stand. A control without a name is asked
  about every time: it could not be told from another one without a name.
- A no stands. What you declined is not put to you again for five minutes, and a session whose
  last three requests you declined or did not answer may not ask at all for that long. The popup
  says so on the session, with a way to let it ask again.
- One request waits at a time. A second is refused at once, instead of waiting where you cannot
  see it.
- A submission id is processed once. Identical content within two minutes is refused unless
  explicitly repeated. An unknown outcome is recorded as uncertain and never resent.
- Your answer is for one request, once. It is taken from the request it was asked for, within
  a minute, and an answer to a request that is gone does nothing.
- What you were asked about is what is sent. The content is fingerprinted before you are
  asked: the control, the fields of its form, and what the agent would fill in. After your
  answer, before anything is entered, it is fingerprinted again, and if it is another by then,
  because the page changed it or someone typed, nothing is sent (`APPROVAL_STALE`). The page is
  another document by then: nothing is sent either. What changes in the moment between that
  look and the click is not seen. And the session is checked again after your
  answer: paused, revoked, run out, at a lower level or off its site, the allow comes too late.

## What is checked, and when

Every command is checked when it arrives, and again right before each step that touches the
page: the session exists and is this agent's, it is not paused, suspended or run out, the tab is
on one of its sites at that moment, its access level covers the action, the site is not blocked,
and the security policy allows it. A command can take seconds, and can wait a minute for your
answer: access that ended meanwhile is not used. When you pause or revoke a session, lower its
level or disconnect its agent, what is running in it is cancelled at its next step. The content
script checks its document's site once more by itself, so a tab that has moved between the last
check and the step is not touched either.

## Text entry into editors

Filling a rich-text or code editor ([how](editors.md)) uses events any page script may create:
`beforeinput`, `paste`, key and focus events, and the browser's editing command. It gives an agent
nothing it did not have with Write access:

- The paste carries only the text of the command. The clipboard is neither read nor written, and
  the extension has no clipboard permission.
- The shortcuts sent are fixed: select all, go to the end, Backspace. An agent cannot choose them.
- A hidden field is treated as an editor's keyboard input only if it has no name, is reachable by
  keyboard, is not hidden from assistive technology, and sits inside a visible box. A hidden field
  that a form submits is never offered, and the value of an editor's input is never returned.
- Password and credential-like fields are refused here as everywhere.

## Prompt injection

Web pages can contain text written to steer an agent. TabGoblin's part:

- Every result marks its content as untrusted data, and the server's instructions tell the agent
  not to follow instructions found in pages.
- Page content cannot change sessions, permissions, pairing or settings: those have no tool and
  change only through the popup.
- The notice in the page lives in a closed shadow root; page scripts cannot read it, and its Pause
  button reacts only to genuine user clicks (it can only restrict, never grant). What it is told
  is a state and the fixed words of the activity list. Nothing of a page, of what was typed, of a
  control's name, of a site or of an agent is put into a page this way.

What TabGoblin cannot do is keep a model from being misled **within** the access you granted. A
page could talk an agent with Write access into submitting something. That is what the access
levels and the submission confirmation are for.

## What is taken out before it leaves the page

- **What looks like a credential.** In the text of a snapshot or an extract, and in every
  address a tool reports, these are replaced by `[redacted]`: a block that says it is a private
  key; a token of three encoded parts (the form of a JWT); what follows `Bearer` or `Basic`; a
  value of eight characters or more, with letters and digits, behind a name such as `password`,
  `secret`, `token` or `api_key`; the value of an address's parameter of such a name, also
  `code` and `key`; and a user and password in front of a host. It goes by shape and knows no
  website.
- **Frames of another site, in a picture.** A screenshot is not taken while a frame or an
  embedded file of another site is in view (`SCREENSHOT_BLOCKED`): the picture would show what
  is in it, and its text is never read either. The agent can scroll it out of view.

Where it stops: redaction is a net with holes. A secret of no known shape passes, and so does
one the page shows under another name, or in a picture. A frame smaller than 8 pixels a side
does not hold a picture back. What a page of your own site shows of another site by other
means, such as an image, is in the picture.

## Logging

Server logs (stderr) and the extension's activity feed contain command ids, session ids, operation
types, durations, outcomes, error categories and scope violations. They never contain page
content, typed text, full URLs, cookies, headers or the token. The same holds for what the status
tool says about where the time went: tool names and durations. For its panel the server also
keeps, with a call's times, the id of the session the call ran in; the agent is not told it.

**A record on disk, if you ask for one.** With `audit.log = on` in the settings file the server
writes one line of JSON for each command it sent or refused, to `audit.jsonl` beside that file:
the time, the agent's id, the session, the action, the milliseconds, and the outcome with its
error category. Nothing of a page, of an address or of entered text is in it, and nothing is
sent anywhere. At five megabytes the file becomes `audit.1.jsonl` and a new one is begun, so at
most ten megabytes are kept. It is off unless asked for. The file has the protection of your
home folder: a program that runs as you can change it, so it is a record and no proof.

## The server's panel

A server that is started with `--panel` shows a window of its own; without the option none of it
is loaded. What it shows and how to use it is in the
[user guide](user-guide.md#9-the-servers-panel), how it is built in the
[architecture](architecture.md#the-servers-panel). The rules:

| Property | Detail |
|---|---|
| No new way in | It is a window of the server's process, not a page: no port is opened for it, and no website can reach it. A program that proves the pairing token can ask for the window to be shown, and for nothing else of it |
| It is the user's, and shows every agent | One server, one window: each agent with its tabs, and the times and log lines of all. No tool gives an agent any of it: what an agent is told is its own, as before |
| Nothing of a page | A session is shown by its site, its access level and its state. The title and the address of its page, which the status tool gives the agent, are not shown. The log is the server's log, with the limits above |
| It gives an agent nothing | Stop, kill, and a switch that closes the connection to the extension and refuses it until switched on. It authorizes no tab and changes no access level. A click on a tab shows that tab's metrics and log lines; it changes what the window shows and sends the server nothing |
| The pairing token is handed over, not shown | A button puts the token on the clipboard, for the popup. The token is read at that moment and goes nowhere else: it is not in the window, not in what the window is given to show, and not in the log, which says only that it was copied. It leaves the clipboard after a minute, and when the server is stopped from the panel, if it is still what the clipboard holds |
| Ending takes two clicks | Stop and Kill act on the second click, within four seconds of the first. No button has the keyboard when the window appears |
| Memory only | The last 300 log lines are kept in memory for the window and nowhere else, the line of each tool call among them: its id, session, action, duration and outcome, as under [Logging](#logging). Nothing of TabGoblin's is written to disk for it |

Where it stops:

- **The switch is not a revocation.** The agent's sessions stay in the extension while the
  connection is off, as they do when a server ends, and are the agent's own again when it is
  back with its key (see [Agents](#agents)). To take tabs away, revoke them or disconnect the
  agent in the popup.
- **The popup does not say why.** A server that is switched off refuses the extension before
  any pairing; to the extension it looks like a server that is not running.
- **Anyone at the desktop can use it.** The window asks for nothing before it stops a server
  or copies the token. Someone who can do that can also read the token's file: the button
  opens no door that was shut.
- **The clipboard is the system's.** Other programs can read it while the token is there, as
  they can when the token is copied from a terminal. A history of the clipboard that the system
  keeps is not emptied, and a server that ends within the minute, other than by its Stop
  button, leaves the token where it is.
- **Kill skips the orderly end, and is no stop.** The extension is not told; it finds the
  connections gone. A command that was running has an unknown outcome, and its agent is told
  so. Agents that are still running start the server anew at once.
- **Stop is for all agents.** It ends the one server, and with it every agent's tools, until
  each agent's program connects again.

## What is verified by tests

| Property | Where |
|---|---|
| Only the four permissions; no content script registered for all pages | End-to-end |
| Wrong token, wrong origin, missing origin, other extension id refused | Java, end-to-end |
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
| A disconnected agent's server is turned away on what it says of itself, before any proof, and never counts the extension as connected; a server that names another agent there is given nothing of that agent's | Java, worker |
| An agent that is started again with its key is told its tabs by the extension before it calls a tool, also under another name | Java, worker, end-to-end |
| A process that does not prove the pairing token is no agent of the server, and a series of them shuts the door; a program that holds the server's port is not taken for the server | Java |
| Agents of one server each have their own port and sessions; a command and a log line of one agent reach no other | Java, end-to-end |
| When the server's process is gone, a call that was waiting is answered as of unknown outcome and nothing is sent to the browser twice; stopped by the user, no agent starts it anew | Java |
| What was allowed when a command began is checked again right before the page is touched: a tab that moved to another site, an authorization that ran out, a pause, a revocation, a lower level, a disconnected agent, each between two steps of one command | Worker |
| The policy's restrictions are refused by the server before anything is sent, and by the extension at the moment of a command: no screenshots, the highest access level, only the allowed sites; a name that only ends alike is another site | Java, rules, worker |
| The strict profile: a click that may change something needs the agent's declaration and the user's yes; every submission is asked about whatever was set; no tab for *Any agent* | Rules, worker |
| An authorization ends at the policy's longest time and after its time unused, at the command that finds it so and by itself | Rules, worker |
| A restriction in the settings file that cannot be read refuses every site, and is not taken for none | Java, rules |
| An agent is told what the policy restricts and never which sites are allowed | Java |
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
| The agent's snapshots, texts and screenshots have nothing of the notice; a screenshot also not while the page is busy and draws late | DOM, worker, end-to-end |
| The notice is told a state and fixed words, and nothing of a page | Rules, DOM, worker |
| Injected page text changes no session or permission | End-to-end |
| The server's panel shows a session's site, access and state, and nothing of its page's title or address | Java |
| Switched off in the panel, the extension is closed and not let in, without that counting as a failed pairing; the agent is told why; switched on, it pairs again | Java |
| A button of the panel that ends the server acts on the second click only; bringing the panel up to date, or choosing a tab in it, sends the server nothing | Java (needs a display) |
| Log lines are kept in memory only when the panel is asked for | Java |
| The pairing token that the panel copies goes to the clipboard and into no log line; it leaves the clipboard again unless something else was copied since | Java (the clipboard's part needs a display) |
| The badge says `ON` only while a connected agent may use an open tab; a server that leaves two heartbeats unanswered is taken for gone | Rules, worker, end-to-end |
| Logs free of token and content | End-to-end |
| The record on disk is written only when the settings ask for it; a line has ids, the action, the time and the outcome and no other field; a value cannot break a line; a file that cannot be written stops no tool; the file is begun anew at its limit | Java |

"Rules" are the pure functions in `policy.ts`; "DOM" the snapshot, extract and interaction tests;
"worker" the background worker run against a fake Chrome; "end-to-end" the real extension in your
Chrome.

## What remains your risk

- **Whatever is visible is shared.** Text, screenshots and non-password field values of an
  authorized tab go to your agent and its model provider.
- **Explore loads pages.** A site that changes state on a plain link (some logout or vote links)
  can be affected. Read does not navigate at all.
- **Blocked sites guard against a wrong click and a wandering agent, not against an agent with
  a shell.** The list is a file you can edit, so an agent that runs commands as you can edit it
  too; and it holds back TabGoblin's tools, not other tools the agent has.
- **A misled agent.** See prompt injection above. Keep "Ask me every time" where a wrong
  submission would hurt.
- **"Confirmed by reaction"** means the page behaved as if it accepted, not that the server stored
  anything.
- **What you allowed once, in the automatic mode.** After you allowed "Enter in Message", an
  agent that is misled by a page can send anything there for fifteen minutes: the Allow is for the
  control, not for the text. And a control is known only by its name on that site, as the page
  gives it: after "Save" on one page, "Save" on another page of the site passes too. The time limit, the limit of five a minute, the refusal of a repeat
  and the list in the popup reduce that. They do not remove it. Use this mode where a wrong
  message would be a nuisance, not where it would do harm.
- **Not asking at all.** With "Do not ask me", an agent that declares a submission is not held up
  by you: that goes for Enter in a message box as for a Save button. High-impact actions still
  ask, but for Enter they are recognised only by the name of the text box, which rarely says so.
- **Controls without a recognisable role.** Enter or Space on an element that is not a button,
  link or text box to the browser, and is not in keyboard reach by the page's own marking, is
  pressed without these checks. What it does is up to the page.
- **Wording checks are English.** Recognising submit-like and high-impact buttons outside forms
  depends on their label.
- **Local malware** running as you can read the token file and the agents' keys, and can write
  the settings file. TabGoblin does not defend against a compromised user account.
- **Redaction is by shape.** See [what is taken out](#what-is-taken-out-before-it-leaves-the-page):
  do not count on it to keep a secret that a page shows.
- **A download is what the release workflow built.** Trusting one is trusting this repository
  and GitHub's machines. Its checksum and GitHub's attestation say that it is the file that was
  built there from the release's tag, and nothing about what the code does. The downloads are
  not signed for Windows or macOS.
