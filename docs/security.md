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
  way to the page declines at worst.
- You are asked before anything is typed. Declining leaves the page untouched.
- The prompt shows the beginning of what would be sent: the texts the submission fills in, or
  what the text box holds. It is shown to you in the popup and goes nowhere else. Passwords and
  other credentials are left out. The texts and the names in the prompt come from the page or
  the agent, so they are shown as quotations, apart from the extension's own words.
- A no stands. What you declined is not put to you again for five minutes, and a session whose
  last three requests you declined or did not answer may not ask at all for that long. The popup
  says so on the session, with a way to let it ask again.
- One request waits at a time. A second is refused at once, instead of waiting where you cannot
  see it.
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
| Enter in a text box needs intent and the user's consent; a declined one is not pressed | Rules, DOM, worker, end-to-end |
| A message sent with Enter gets a verdict, and the same text is not sent twice | DOM, worker, end-to-end |
| A text box is not excused from the question by `aria-expanded`, a missing option, or search wording on a text area | DOM |
| Enter or Space on a control that submits is refused like a click on it | Rules, DOM, worker, end-to-end |
| A key allowed for one element is not pressed on another | End-to-end |
| A prompt that has only just appeared takes no answer; from the keyboard Deny comes first | End-to-end |
| What the user declined is not asked again until they take it back; a run of refusals silences a session; one request waits at a time | Rules, worker, end-to-end |
| The prompt names the agent, the control, the site and what would be sent, for every kind of request; a password is never shown in it | DOM, worker, end-to-end |
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
- **Confirmation switched off.** With "Ask me before the agent submits anything" off, an agent
  that declares a submission is not held up by you: that goes for Enter in a message box as for a
  Save button. High-impact actions still ask, but for Enter they are recognised only by the name
  of the text box, which rarely says so.
- **Controls without a recognisable role.** Enter or Space on an element that is not a button,
  link or text box to the browser, and is not in keyboard reach by the page's own marking, is
  pressed without these checks. What it does is up to the page.
- **Wording checks are English.** Recognising submit-like and high-impact buttons outside forms
  depends on their label.
- **Local malware** running as you can read the token file. TabGoblin does not defend against a
  compromised user account.
