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

## Agents

Each agent is a separate authenticated connection with its own id. A session has one owner, and
every command is checked against it. Another agent cannot list, read or act on it, and a forged
session id is refused. You can disconnect an agent in the popup; it stays out until allowed again.

## The local connection

| Protection | Detail |
|---|---|
| Loopback only | Servers bind `127.0.0.1` |
| Origin pinning | The WebSocket handshake must carry this extension's `chrome-extension://` id; web pages cannot forge it |
| Mutual proof | HMAC challenge-response over the pairing token in both directions; the token is never sent, so a process squatting on the port cannot drive the browser either |
| Version negotiation | A peer speaking another protocol version is refused with a reason |
| Lockout | Ten failed pairings block new connections to that server for a minute |
| Rotation | `--rotate-token` ends every pairing before its next command |
| Validation | Every inbound message is parsed into a typed message or dropped |
| Limits | Message size (1 MB to the extension, 8 MB to the server), 20 commands per second per agent, per-command deadlines |
| Replay | A command id is accepted once per connection |
| No retries | A command is sent once; a timed-out command is cancelled so it cannot run later |

The token is stored in `~/.browser-context-mcp/pairing-token` and in the extension's storage,
which content scripts cannot read. It is never logged.

## Submissions

- Reading, filling and submitting are separate. Filling never submits, and never presses Enter:
  a line break in a text is entered as content, also when the text is typed key by key.
- A submission must be declared by the agent, needs Write access, and by default your confirmation.
  Destructive, financial and publishing actions always ask.
- You are asked before anything is typed. Declining leaves the page untouched.
- A submission id is processed once. Identical content within two minutes is refused unless
  explicitly repeated. An unknown outcome is recorded as uncertain and never resent.

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
- The in-page indicator lives in a closed shadow root; page scripts cannot read it, and its Pause
  button reacts only to genuine user clicks (it can only restrict, never grant).

What TabGoblin cannot do is keep a model from being misled **within** the access you granted. A
page could talk an agent with Write access into submitting something. That is what the access
levels and the submission confirmation are for.

## Logging

Server logs (stderr) and the extension's activity feed contain command ids, session ids, operation
types, durations, outcomes, error categories and scope violations. They never contain page
content, typed text, full URLs, cookies, headers or the token.

## What is verified by tests

| Property | Where |
|---|---|
| Only the four permissions; no content script registered for all pages | End-to-end |
| Wrong token, wrong origin, missing origin, other extension id refused | Java, end-to-end |
| Old protocol version refused | Java, worker, end-to-end |
| Pairing lockout, token rotation | Java, end-to-end |
| Nothing readable before authorization | End-to-end |
| Cross-origin navigation, links, redirects blocked or suspended | Rules, end-to-end |
| Cross-origin frame never read | DOM, end-to-end |
| Another agent's session unreachable, forged session id refused | Rules, worker, end-to-end |
| Refs do not cross documents or sessions; replacements are stale | DOM, end-to-end |
| Passwords, hidden inputs, scripts, hidden content excluded | DOM, end-to-end |
| Hidden form fields not offered as editors; an editor input's value not returned | DOM |
| Editor text never entered twice; an unseen result not reported as success | DOM, editor lab |
| A fill never presses Enter, in a text area or an editor | DOM, end-to-end |
| Read and Explore cannot write; submissions need intent | Rules, worker, end-to-end |
| Declined or cancelled submission types nothing and sends nothing | End-to-end |
| Duplicate and uncertain submissions not repeated | Java, end-to-end |
| Replayed ids, stale deadlines, floods, malformed messages refused | Worker, end-to-end |
| Popup requests from a web page or another extension ignored | Worker |
| Page scripts cannot operate the indicator | End-to-end |
| Injected page text changes no session or permission | End-to-end |
| Logs free of token and content | End-to-end |

"Rules" are the pure functions in `policy.ts`; "DOM" the snapshot, extract and interaction tests;
"worker" the background worker run against a fake Chrome; "end-to-end" the real extension in your
Chrome.

## What remains your risk

- **Whatever is visible is shared.** Text, screenshots and non-password field values of an
  authorized tab go to your agent and its model provider.
- **Explore loads pages.** A site that changes state on a plain link (some logout or vote links)
  can be affected. Read does not navigate at all.
- **A misled agent.** See prompt injection above. Keep submission confirmation on where a wrong
  submission would hurt.
- **"Confirmed by reaction"** means the page behaved as if it accepted, not that the server stored
  anything.
- **Enter in a message box.** An agent with Write access can press Enter with
  `browser_press_key`. In a chat or comment box that sends the message. The tool cannot tell
  such a box from an editor where Enter starts a new line, so you are not asked first. Only
  Enter in a field of a form is treated as a submission.
- **Wording checks are English.** Recognising submit-like and high-impact buttons outside forms
  depends on their label.
- **Local malware** running as you can read the token file. TabGoblin does not defend against a
  compromised user account.
