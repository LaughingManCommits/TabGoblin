# Architecture

TabGoblin has three parts, and one rule that shapes all of them: **the agent understands websites;
TabGoblin only provides generic browser primitives and enforces what the user allowed.** There is
no site-specific code, selector, parser or workflow anywhere.

## Components

```mermaid
flowchart TB
  subgraph agentp["Agent process (IDE or CLI)"]
    AG["AI agent"]
  end
  subgraph serverp["Java server process: one per agent"]
    TAP["StdinTap<br/>end of input, client cancel"]
    MCP["McpMain<br/>MCP stdio, tool definitions"]
    SVC["BrowserService<br/>arguments → commands → results"]
    BR["WebSocketBridge<br/>127.0.0.1, origin check, pairing"]
    CONN["ExtensionConnection<br/>correlation, deadlines, ordering"]
  end
  subgraph ext["Chrome extension (Manifest V3)"]
    BG["background.ts<br/>connections, sessions, gate, flows"]
    POL["policy.ts<br/>rules as pure functions"]
    POP["popup<br/>the user's controls"]
    CS["content.ts<br/>injected on demand"]
    DOM["snapshot / extract / interact / submit"]
  end
  PAGE["Authorized tab"]

  AG -- "JSON-RPC over stdio" --> TAP --> MCP --> SVC --> BR --> CONN
  CONN -- "WebSocket, protocol v2" --> BG
  BG --> POL
  POP -- "runtime messages" --> BG
  BG -- "tabs.sendMessage" --> CS --> DOM --> PAGE
```

| Part | Responsibility | Does not |
|---|---|---|
| Agent | Understand the site, plan, summarise | Touch the browser except through tools |
| Java server | Expose tools, validate arguments, bind calls to sessions, time out, cancel, remember submission ids, log | Know any website, summarise, hold page content |
| Extension background | Connect to all servers, own sessions, check every command, drive navigation and submissions, keep the activity feed | Trust the page, run agent code |
| Content script | Read the DOM into allowlisted text, perform one fixed operation per request | Persist anything, talk to anyone but the background |
| Popup | Show state, take the user's decisions | Decide anything itself |

## Processes and ports

Each MCP client starts its own server process over stdio. A server binds the first free port of
eight, counting up from `--port` (default 47821), on `127.0.0.1` only. The extension tries every
port of that range that has no live connection, so each agent is one WebSocket.

```mermaid
sequenceDiagram
  participant E as Extension
  participant S as Server
  Note over S: bound to 127.0.0.1, Origin must be the extension's id
  E->>S: WebSocket handshake
  S->>E: challenge { nonce, versions: [2] }
  E->>S: auth { nonce, proof = HMAC(token, "client:"+sn+":"+cn), version: 2 }
  S->>E: auth_ok { proof = HMAC(token, "server:"+sn+":"+cn), clientId, clientName }
  Note over E,S: both sides proved they know the token, which never crossed the socket
  E-->>S: ping every 20 s (also keeps the service worker alive)
```

A server that offers no common protocol version is refused (close code 4406). Ten failed pairings
lock a server's port for a minute. A rotated token is checked at every heartbeat and before every
command, so stale pairings end at once.

## A command, end to end

```mermaid
sequenceDiagram
  participant A as Agent
  participant S as Java server
  participant B as Extension background
  participant P as Content script
  A->>S: tools/call browser_click { ref: 12, session: "s1" }
  S->>S: validate arguments, take the session's turn
  S->>B: { id, action: "click", session, params, deadline }
  B->>B: id seen before? rate limit? deadline passed?
  B->>B: resolve session and owner
  B->>B: gate: expired? paused? suspended? tab URL in scope? access level?
  B->>P: describe ref 12
  P-->>B: link / expander / submits form / label
  B->>B: policy.checkClick
  B->>P: click ref 12
  P-->>B: dispatched
  B->>B: settle: new document? route change? left the site? new tab?
  B-->>S: { id, success, result }
  S-->>A: tool result
```

Ordering: the server sends one command per session at a time; the extension queues per session as
well. Different sessions run in parallel. Nothing is retried, anywhere.

## Sessions

A session is one authorized tab bound to one agent.

| Field | Meaning |
|---|---|
| `sessionId` | `s1`, `s2`, … the handle agents use |
| `authorizationId` | Identity of the user's grant |
| `clientId`, `clientName` | The owning agent; empty until claimed |
| `tabId`, `frameId` | The tab, top frame |
| `origins` | Every origin the user authorized for it |
| `mode` | `read`, `explore`, `write` |
| `documentId`, `generation` | Identity of the current document and its snapshot count |
| `paused`, `suspended`, `expiresAt` | Lifecycle |

```mermaid
stateDiagram-v2
  [*] --> Active: user authorizes the tab
  Active --> Paused: Pause
  Paused --> Active: Resume
  Active --> Suspended: tab leaves its origins
  Suspended --> Active: user resumes on that tab, or adds the site
  Active --> [*]: revoked, agent disconnected by the user, tab closed, expired, browser closed
  Paused --> [*]: revoked, agent disconnected by the user, tab closed, expired
  Suspended --> [*]: revoked, agent disconnected by the user, tab closed, expired, re-authorized
```

**Ownership.** A session belongs to the agent chosen at authorization, or to the first agent that
uses an unclaimed one. Every command is checked against the owner. If the owner's server is gone
and an agent with the same name connects, it inherits the session (an IDE restarting its server);
no other agent ever does.

**Disconnect.** When the user disconnects an agent in the popup, the sessions that are that
agent's end with it: those it owns, and those a former self of the same name left behind, which
it could have taken up with its next command (`sessionsOfAgent` in `policy.ts`). A session no
agent has taken up yet stays. So nothing waits for *Allow again*, and nothing is left for an
agent of the same name to inherit. An agent that goes away by itself keeps its sessions, as
above.

**Why "suspended" exists.** Chrome withdraws the `activeTab` grant whenever a tab changes origin,
and only a user click on the extension's icon gives it back. So after any cross-origin move the
extension cannot read the tab, whatever its own rules say. Keeping the session (owner, access
level, submission history) and requiring one click to resume is the most a session can survive.

**Persistence.** Sessions live in `chrome.storage.session`: they survive the service worker being
stopped and restarted, and are gone when the browser closes.

## Element refs

A snapshot gives listed elements a number. Three properties make refs safe to act on:

1. **Identity.** A ref is tied to one DOM element. The same element keeps its ref across
   snapshots; a replacement gets a new one.
2. **Staleness.** Before acting, the element must still be connected, visible, and carry the same
   role and name it had when listed. Otherwise the command fails with `STALE_REF`.
3. **No reuse.** Numbers are never handed out twice in a browser run, and every live session draws
   from its own block, so a ref from another document or another tab resolves to nothing.

## Reading a page

The content script walks what is actually rendered, in document order, and emits allowlisted
information only. Scripts, styles, hidden inputs and hidden content are never visited.

```mermaid
flowchart LR
  DOM["DOM"] --> W["walkVisible<br/>display, visibility, opacity,<br/>clipping, closed details,<br/>shadow roots, same-origin frames"]
  W --> SNAP["snapshot.ts<br/>roles, names, states,<br/>containers → indentation,<br/>refs, paging, diff"]
  W --> EXT["extract.ts<br/>headings, lists, tables,<br/>quotes, nested articles,<br/>outline, sections"]
  SNAP --> C["assess → Completeness"]
  EXT --> C
```

- **Snapshot** answers "what is here and what can I act on": an indented hierarchy with refs.
- **Extract** answers "what does it say": structured text, bounded, with an outline.
- **Completeness** is computed for every result: `TRUNCATED` (cut at the size limit), `BLOCKED`
  (a cross-origin frame), `PARTIAL` (one section, the viewport, or collapsed controls), `UNKNOWN`
  (not scrolled to the end), `COMPLETE`.

Frames of the same origin are read through `contentDocument` as part of the page. Frames of another
origin have no readable document from the page's origin and are reported as blocked.

## Navigation

| Kind | How | Outcome reported |
|---|---|---|
| URL | Destination resolved and checked against the session's origins, then `tabs.update` | `new-document`, `same-document`, `timeout`, `redirected` |
| Back / forward | In the page, to a specific entry of the Navigation API, which lists only this origin's entries | as above, or `NAVIGATION_BLOCKED` when there is none |
| Reload | `tabs.reload` | `new-document` |
| Click, key | After dispatch the tab is watched until it settles | `none`, `same-document`, `new-document`, `left-origin`, `openedNewTab` |

The browser's own back button is deliberately not used: it skips history entries that were opened
without a user gesture, which is every page an agent opened, and can jump straight out of the site.

## Submissions

```mermaid
stateDiagram-v2
  [*] --> PREPARED: refs resolve, allowed, not a duplicate
  PREPARED --> [*]: declined, unanswered or cancelled - nothing typed
  PREPARED --> FILLED: user allows, fields filled
  FILLED --> FAILED: form validation rejects - nothing sent
  FILLED --> SUBMITTING: click dispatched
  SUBMITTING --> VERIFYING
  VERIFYING --> CONFIRMED: text visible, or the page reacted as if it accepted
  VERIFYING --> FAILED: error alert or field marked invalid
  VERIFYING --> UNCERTAIN: no conclusive signal
```

Verification compares a baseline taken just before the click with what the page shows afterwards:
occurrences of the expected and submitted text outside the fields it was typed into, new
`role="alert"` messages, fields with `aria-invalid`, new `role="status"` messages, whether the
fields were cleared or the form is gone, and whether the URL or document changed. The verdict is a
pure function (`judgeSubmission`) of those signals.

A fingerprint of the content (a hash, computed in the page) recognises an identical repeat. The
server remembers every `submission_id` and never sends one twice; a timeout or lost connection is
recorded as `UNCERTAIN`.

## Cancellation

| Trigger | Effect |
|---|---|
| User pauses, revokes or lowers access | Running and queued operations of that session stop at their next safe point |
| MCP client sends `notifications/cancelled` | `StdinTap` interrupts the tool call; the server sends `cancel` to the extension, and sends no answer for that call |
| Server times out waiting | The server sends `cancel`, so the command cannot run later |
| Agent's server disconnects | Its operations are cancelled |
| User disconnects an agent | Its operations are cancelled, a question it has put to the user is withdrawn, and its sessions end |
| Tab closes or leaves its site | The session ends or is suspended; its operations stop |

A safe point is any moment before something is dispatched to the page. For a submission the last
one is immediately before the click. What was dispatched is never undone.

## A call that takes long

A submission can wait up to a minute and a half, most of it for the user's answer in the popup.
A client that sent a progress token with the call is told every three seconds that it is still
running, and for a submission that it may be waiting for the user. The server does not know how
far the call is: what it reports is the time the call has run.

## How a server ends

A server ends when its MCP client closes the input, on Ctrl+C, or on a signal to stop. Each time
the same happens, in this order, and within two seconds or the process ends anyway:

1. The MCP server is closed, so that nothing new is taken on.
2. The socket is stopped. The extension gets the close code for "going away" (1001) and drops
   that agent at once, instead of finding the connection gone.
3. The process exits with code 0.

A command line that is not understood starts nothing: the reason and the usage text go to
standard error, and the exit code is 2.

## The server's panel

With `--panel` (or `BCMCP_PANEL=1`) a server shows a window of its own; without it nothing of the
window's code is loaded. What the user sees and can do there is in the
[user guide](user-guide.md#9-the-servers-panel). How it is built:

- **It is in the server's process and reads the server's objects.** No port is opened for it,
  no file is written and nothing is sent anywhere. Once a second the window asks for a
  `PanelModel`, a record made from what the status tool also reads (`WebSocketBridge`,
  `Timings`) and from the last lines `Log` has kept.
- **What it shows is decided without a window.** `PanelModel` is plain data and is tested
  without a display. `Panel` draws it and sends back one of three commands, a sealed type:
  the connection on or off, stop, kill. `McpMain` carries them out.
- **Stop is the same end as every other.** It runs the steps under "How a server ends". Kill
  halts the process with exit code 1 and runs none of them: the extension finds the connection
  gone instead of being told.
- **The switch holds the connection off.** The server closes the extension's connection with
  the code for "going away" and refuses the next handshake, before any pairing proof is
  looked at, until it is switched on. A refused handshake is not a failed pairing and counts
  nothing towards the lockout. The extension keeps looking for servers every half minute, as
  it does for any server that is not reachable, so switching on needs nothing in the popup:
  with the real extension it was back after 14 seconds, and the agent's session with it.
  Meanwhile a tool call is answered `NOT_CONNECTED` with words that say where it was switched
  off, and the popup says *Disconnected*: the extension is not told why.
- **The log is kept only for the window.** Asked for its panel, a server keeps its last 300
  lines in memory from its first line on. They are the lines it writes to standard error, at
  the level `BCMCP_LOG` sets, except that info and warning lines are kept even where
  `BCMCP_LOG` silences them. Without the option nothing is kept.
- **No display, no panel.** Where there is no display, or JavaFX cannot start, the server logs
  `panel not shown reason=…` and runs as it does without the option. Both were run: without a
  display on Linux (`reason=no_display`), and with a jar from which the native files had been
  taken out, as a stand-in for a system the jar has none for. There JavaFX prints a trace of
  its own to standard error before the server's line (`reason=RuntimeException`); the server
  ran on and ended with exit code 0.
- **Two kinds of window.** On Windows the window has no frame of the system's: a rounded body
  with its own shadow, see-through around it, moved by its header. Everywhere else the same
  body fills a window with the system's frame. The reason is a measurement, not a taste: on
  Linux (in the Linux subsystem of Windows) the see-through window was there for the system and
  drew nothing, and the framed one drew. `Panel.floats` decides, and a test holds it. In both
  kinds a request to close the window puts it away instead: the server ends by its button, or
  by its agent.
- **The window's icon is drawn, not loaded.** The goblin comes from the shapes of
  `chrome-extension/icons/goblin.svg`, written out in `Panel.java`, for the header and for the
  icon the taskbar shows. A window takes an icon only as a picture that holds its pixels as
  bytes; a drawing comes as one number per pixel and is passed over without a word, which
  leaves Java's own icon on the taskbar. The icons are therefore copied into the kind that is
  taken, and a test holds that.
- **The log follows its last line** unless the user reads in it: nothing is written while some
  of it is marked or while it is scrolled up. Where the last line is, is known only after new
  lines were laid out, so the view is brought down each time their height changes.
- **JavaFX 21** is in the jar with its native part for Windows on x64, Linux on x64 and macOS
  on Apple silicon; the jar is 17.6 MB with it, and was 7.1 MB. A jar holds one set of native
  files per system, because those for Intel and for ARM have the same names. JavaFX is loaded
  from the class path, which it reports with one warning line on standard error at the start.
  On Java 26 four more lines follow, of Java's own: a method that JavaFX uses for drawing is
  to be removed in a future release. The jar's manifest allows its code native access
  (`Enable-Native-Access`), which newer Javas otherwise warn about as well. The 21 line of
  JavaFX is the one that runs on Java 21; newer lines need a newer Java.

## The service worker

Manifest V3 stops an idle background worker. TabGoblin is built for that:

- All durable state is in `chrome.storage.session` (sessions, activity) and `chrome.storage.local`
  (token, settings); the worker can be killed at any time.
- While any agent is connected, the 20-second heartbeat keeps it alive.
- With no connection it sleeps; an alarm every 30 seconds, the popup, or switching tabs wakes it to
  look for servers.
- After a restart, operations that were mid-flight are gone, and submissions that had been
  dispatched are marked `UNCERTAIN`.

## The notice in the page

In the bottom corner of an authorized tab a bar says what the agent does there, and above it a
pill for each thing it just did. The worker tells the page two things and nothing else
(`setNotice` in `background.ts`):

| Sent | When | Carries |
|---|---|---|
| A state | A command starts (`working`), the user is asked (`asking`), a session is paused or resumed (`paused`, `idle`) | For `working`, what runs, in the words of the activity list |
| A line | A command ends | The activity list's words for it, and for one that did not run through the short note for its error code (`endedLine` in `policy.ts`) |
| `off` | The session ends or is suspended, a screenshot is about to be taken, or the setting is switched off | Nothing |

The page keeps the time (`notice.ts`): a line stays four seconds and fades for one, three lines
at most, and the notice leaves the page with its last line when nothing runs. The worker sets
no timer for it, since it may be asleep by the time a line has to go. Sending is best effort:
it never injects the content script and never holds up a command. The notice is drawn in a
closed shadow root, and only its Pause button takes the pointer; a click on Pause counts only
when the browser marks it as the user's.

It is two panes. The bar holds the goblin, the words and Pause; it is one row high whatever
happens, and it is what stays in the corner. The pills float above it, each as wide as its
words, with nothing drawn around the two. So what stays is small, and what passes covers no
more of the page than its own text.

The look is the popup's: its colours, its round marks, and the goblin of its header, drawn from
the shapes of `icons/goblin.svg` with nothing fetched. The goblin stands bare on the bar, with no
tile and no edge of its own. It shows the state through one class alone (its outline glows green
while working and amber when the user is asked, and its eyes are closed when paused); it learns
nothing about what the agent does beyond that. What each action looks like is not shown; that
is WP-12.

## Where things are

```text
java-server/src/main/java/browsercontext/
  McpMain.java             entry point, tool definitions, port selection
  StdinTap.java            end of input, client-side cancellation
  Timings.java             where the time of the last tool calls went
  PanelModel.java          what the server's panel shows at a moment, without a window
  Panel.java               the panel's window (JavaFX); panel.css in the resources is its look
  BrowserService.java      tool arguments → commands → results, submission ids
  WebSocketBridge.java     localhost endpoint, origin check, pairing, lockout, limits
  ExtensionConnection.java correlation, deadlines, cancellation, per-session ordering
  Protocol.java            typed messages, error categories
  Pairing.java             token file, rotation, HMAC proofs
  Log.java                 diagnostics without content; the last lines, kept for the panel
chrome-extension/src/
  background.ts            connections, sessions, gate, navigation, submissions, activity
  policy.ts                every rule, as pure functions
  protocol.ts              typed messages and their validation
  content.ts               fixed set of page operations; holds the notice in the page
  notice.ts                the notice in the page: what it shows at a moment, and how it is drawn
  snapshot.ts              rendered-DOM walk, roles, names, refs, hierarchy, completeness
  extract.ts               structured text, outline, sections
  interact.ts              click, fill, type, keys, scroll, wait
  editor.ts                text entry into rich-text and code editors
  submit.ts                baseline and signals around a submission
  popup.html / .ts / .css  the user's controls
  panels.ts                which panels of the popup fold, and what a folded one says
```
