# Browser Context MCP

Lets local AI agents read and operate **the tabs and websites you authorize**, in your normal Chrome
with your normal login. Website-agnostic: there is no site-specific code anywhere.

```text
IDE agent ──MCP stdio──> Java MCP server ──ws://127.0.0.1──┐
IDE agent ──MCP stdio──> Java MCP server ──ws://127.0.0.1──┼──> Chrome extension (MV3) ──> authorized tabs
```

- **Agent** understands the site and decides what to do.
- **Java server** (`java-server/`) exposes generic MCP tools, binds them to sessions, and forwards them.
  Each MCP client starts its own server.
- **Extension** (`chrome-extension/`) connects to every running server, performs the browser
  operations and enforces authorization.

You log in yourself, click the extension icon on a tab, and authorize it. That tab becomes a
**session** owned by one agent. The agent never sees cookies, headers, storage or tokens, and
cannot run scripts.

## Build

Requires Java 21+, Maven, Node 24+ and Chrome 120+.

```sh
mvn -f java-server/pom.xml package        # -> java-server/target/browser-context-mcp.jar
cd chrome-extension && npm install && npm run build   # -> chrome-extension/dist
```

## Set up (once)

1. **Load the extension.** Open `chrome://extensions`, enable *Developer mode*, choose
   *Load unpacked* and select `chrome-extension/dist`. Pin its icon to the toolbar.
2. **Add the MCP server to your agent.** In your IDE's MCP server settings add a stdio server,
   using the absolute path of the jar:

   ```json
   {
     "mcpServers": {
       "browser-context": {
         "command": "java",
         "args": ["-jar", "C:/projects/TabGoblin/java-server/target/browser-context-mcp.jar"]
       }
     }
   }
   ```

   Any MCP client that can start a stdio server works the same way, and several can run at once.
3. **Pair.** Print the pairing token and paste it into the extension popup:

   ```sh
   java -jar java-server/target/browser-context-mcp.jar --show-token
   ```

   The popup shows how many agents are connected. `--rotate-token` replaces the token; running
   servers drop the old pairing within a heartbeat and the extension has to be paired again.

## Use

1. Open the website and log in as usual.
2. Click the extension icon on that tab, pick an access level (and, with several agents connected,
   which agent), and click **Authorize**.
3. Ask your agent to work with the page.

### Sessions and agents

Every authorized tab is a session (`s1`, `s2`, …) with one origin, one access level and one owner.

- Several tabs, on the same or different sites, can be authorized at once. With more than one
  session an agent must pass `session` to every tool; nothing depends on which tab is in front, and
  no command switches tabs.
- A session belongs to the agent chosen at authorization, or to the first agent that uses it. Other
  agents cannot see or use it. If an agent's server restarts, the same-named agent gets its sessions
  back; a different agent never inherits them.
- Commands for one tab run one at a time, in order; different tabs run side by side.
- Sessions end when you revoke them, when the tab closes or leaves the origin, when an optional
  expiry passes, or when the browser restarts. They survive a restart of the extension's worker.

### Access levels

| | Read | Explore | Read / Write |
|---|---|---|---|
| snapshot, extract, scroll, screenshot, wait | yes | yes | yes |
| navigate within the origin, back / forward / reload | no | yes | yes |
| follow same-origin links, open tabs and expand/collapse controls, arrow / Tab / Escape keys | no | yes | yes |
| click buttons and other controls, fill and type, Enter and character keys | no | no | yes |
| submit | no | no | only when stated as a submission |

**Read** touches nothing: no request leaves the page because of the agent. **Explore** issues
navigations (HTTP GETs), so a site that changes state on GET, such as a logout link, can be affected.

### Tools

Every tool except `browser_status` takes an optional `session`.

| Tool | What it does |
|---|---|
| `browser_status` | This agent's sessions: id, origin, access level, pause state, page. `diagnostics` adds recent operations |
| `browser_snapshot` | The page as an indented hierarchy with numbered refs. `ref` for one section, `start_line` / `max_lines` to page, `diff` for changes only, `viewport_only`, `interactive_only` |
| `browser_extract` | Structured text: headings, lists, tables, quotes, nested replies, links with refs. `offset` to continue, `outline` to list sections, `ref` to read one, `main_only`, `links` |
| `browser_click` | Click an element by ref; reports the navigation that followed and any new tab |
| `browser_fill` | Enter text, choose an option, or set a checkbox/radio/switch (`"true"` / `"false"`). `method: "type"` sends key events per character; empty text clears |
| `browser_press_key` | Enter, Escape, Tab, Shift+Tab, Space, Backspace, Delete, arrows, Home, End, PageUp, PageDown, or one character |
| `browser_scroll` | Scroll the page or a scrollable element; reports position and whether the page loaded more |
| `browser_navigate` | Open a URL inside the origin, or go `back`, `forward`, `reload` |
| `browser_screenshot` | Capture the viewport, with a note on how much of the page it covers |
| `browser_wait_for` | Wait for text, or for an element to be visible, gone, enabled or disabled |
| `browser_submit` | Fill, submit once, and verify the outcome |

A snapshot looks like this:

```text
[5] Main
  [6] Heading (h1): Settings
    [7] Section: Profile
      [8] Textbox: Display Name (required)
      [9] Button: Save (submits form)
    [13] Table: Plans
      Row: Plan | Price
```

### Reading large pages

Results are bounded and say how complete they are:

| Status | Meaning |
|---|---|
| `COMPLETE` | Everything loaded was returned and the page was scrolled to its end |
| `PARTIAL` | Something was left out on purpose or is collapsed: one section, the viewport, closed sections |
| `TRUNCATED` | Cut at the size limit; the result says how to continue |
| `BLOCKED` | Part of the page cannot be read: a frame from another origin |
| `UNKNOWN` | Not scrolled to the end, so a site that loads on scroll may have more |

Typical route through a long document: `browser_extract` with `outline`, then one section at a time
by `ref`. For a feed: scroll until `browser_scroll` stops reporting `loadedMore`. Summarising is
left to the agent; the server does none.

### Submitting

`browser_submit` is the only way to send or change data that reports what happened. Its steps:

```text
PREPARED -> FILLED -> SUBMITTING -> VERIFYING -> CONFIRMED | FAILED | UNCERTAIN
```

- **Before the click** it resolves every ref, fills the given fields, checks the browser's own form
  validation, and refuses content identical to a submission of the last two minutes unless
  `repeat` is set. Up to this point it can be cancelled and nothing was sent.
- **You are asked** in the popup when *Ask me before the agent submits anything* is on (the
  default), and always for destructive, financial or publishing actions. No answer within 60
  seconds means nothing is sent.
- **After the click** it watches the page for a few seconds. `CONFIRMED` needs evidence: the
  `expect_text` you named appearing on the page (verified by content), or the page reacting as if
  it accepted, e.g. fields cleared, a status message, a new page (verified by reaction). An error
  alert or a field marked invalid makes it `FAILED`. No signal makes it `UNCERTAIN`.
- **Never twice.** A `submission_id` is processed once; a timeout or lost connection is recorded as
  `UNCERTAIN` and not resent. Nothing is retried automatically, anywhere.

A click or Enter that would submit is refused unless the agent states `intent: "submit"`.

**What cannot be undone:** a dispatched click, key press, fill or submission. Pause, revoke and
cancellation stop operations at the next safe point, which for a submission is the moment before
the click. After that the outcome is observed, not reversed.

### The popup

Connected agents (with *Disconnect*), sessions with their access level, *Pause* and *Revoke*, the
current operation and the most recent ones with their outcome, and any submission waiting for your
answer. Entries are generic descriptions; page content and typed text never appear. The toolbar
badge shows `ON`, `RUN`, `II` (all sessions paused) or `?` (waiting for you).

While an agent works, a small indicator with a *Pause* button appears in the page. It is not part of
the page content the agent sees, page scripts cannot read or operate it, and it can be switched off.

## Security model

**Not exposed, by construction:** cookies, HTTP headers, `localStorage`/`sessionStorage`,
authentication tokens, request or response bodies, the Chrome debugger, JavaScript evaluation, and
general HTTP requests. There are no tools or protocol actions for them, and the extension requests
only `activeTab`, `scripting`, `storage` and `alarms`.

**Origin authorization.** A session is one tab plus one exact origin (scheme + hostname + port);
subdomains are different origins. It is enforced twice: Chrome's `activeTab` grant only covers the
tab you clicked the icon on and is withdrawn by Chrome when that tab leaves the origin, and the
extension re-checks the tab's URL before every command and again inside the page. Destinations are
checked before navigating; history moves go only to entries of the same origin; links leading
elsewhere are not clicked. If the tab leaves the origin anyway (a redirect, or you navigating), the
session ends at once. Returning does not restore it, and redirects or existing logins never widen it.

**Frames.** Frames of the same origin are read as part of the page. A frame from another origin is
never read, whatever you are logged into there; the result says that part is blocked.

**Agents.** Sessions are bound to the agent that owns them, checked on every command. You can
disconnect an agent; it stays out until you allow it again.

**Local connection.** Servers listen on `127.0.0.1` only. The handshake is refused unless its
`Origin` is this extension's ID, and both sides then prove knowledge of the pairing token with an
HMAC challenge-response, so the token never crosses the socket and neither a web page nor another
local process can drive the browser. Protocol versions are negotiated; messages are validated,
size-limited and rate-limited; commands carry a deadline and an id that is accepted once; ten failed
pairings lock new connections out for a minute; the token is never logged.

**Page content.** Results contain allowlisted information only — role, label, a few states, visible
text — never raw HTML, attributes, scripts, hidden inputs or hidden content. Values of password
fields and credential-like fields are never read, and those fields cannot be filled or typed into.
Page content is marked as untrusted data in every result and cannot change sessions, permissions or
settings: those change only through the popup.

### Limits you should know about

- **Visible content can be sensitive.** Whatever is on screen in an authorized tab (text,
  screenshots, non-password field values) is sent to your agent and its model provider.
- **Page content is untrusted input** to your agent and may try to steer it. The tools keep it from
  changing permissions; they cannot keep a model from being misled within the access you granted.
- The submission and high-impact wording checks for buttons outside forms are English only.
- `CONFIRMED` by reaction means the page behaved as if it accepted, not that the server stored
  anything. Name `expect_text` whenever the result should be visible.
- Closed shadow roots are not read. New tabs opened by a site are reported but not followed;
  authorize them separately.
- Complex custom editors may reject generic input; the tool then returns a clear error.
- A page blocked by a native `alert`/`confirm` dialog stops responding until you dismiss it.
- Screenshots need the session's tab to be the visible tab of its window.
- Up to eight agents at once (one port each). Universal site compatibility is not claimed.

## Verify

```sh
mvn -f java-server/pom.xml test             # protocol, pairing, sessions, cancellation, submissions
cd chrome-extension && npm run check        # type-check, rules / snapshot / extract / interaction tests, build
cd e2e && npm install && npm test           # full chain against the demo sites, in your Chrome
```

The end-to-end run starts real servers for two agents, drives them over MCP stdio, loads the
unmodified extension into your installed Chrome with a temporary profile, clicks its toolbar button,
and works through three structurally different demo sites (`demo-site/`): classic HTML forms with a
server-side form post, a div-based single-page app, and a documentation site with frames and a
nested discussion. `HEADED=1 npm test` shows the browser. `node live.mjs <url> …` runs a read-only
smoke check on real websites, and `node agent.mjs` hands the tools to a real model.

Try the demo sites by hand with `node demo-site/server.mjs` (http://127.0.0.1:8931 to :8933).

## Configuration

| Flag | Environment | Default | |
|---|---|---|---|
| `--port` | `BCMCP_PORT` | `47821` | First of eight ports; each server takes the first free one. Set the same first port in the popup under *Connection…* |
| `--token-file` | `BCMCP_TOKEN_FILE` | `~/.browser-context-mcp/pairing-token` | Pairing token location |
| `--extension-origin` | `BCMCP_EXTENSION_ORIGIN` | this extension's ID | `any` accepts every `chrome-extension://` origin (token still required) |
| | `BCMCP_LOG` | `info` | `debug`, `info`, `warn` or `off`. Logs go to stderr: command ids, sessions, operation types, durations, outcomes, error categories, scope violations. Never content, typed text or the token |

## Protocol (Java ⇄ extension)

Independent of MCP; version 2. Typed on both sides (`Protocol.java`, `protocol.ts`).

```json
{ "type": "challenge", "nonce": "…", "versions": [2] }
{ "type": "auth", "nonce": "…", "proof": "…", "version": 2 }
{ "type": "auth_ok", "proof": "…", "version": 2, "clientId": "c-1a2b3c4d", "clientName": "…" }

{ "id": "17", "action": "click", "session": "s2", "params": { "ref": 12 }, "deadline": 1700000000000 }
{ "id": "17", "success": true, "result": {} }
{ "id": "17", "success": false, "error": { "code": "NOT_AUTHORIZED", "message": "…" } }
{ "type": "cancel", "id": "17" }
{ "type": "event", "event": "sessions", "data": { "sessions": [] } }
```

Actions: `status`, `snapshot`, `extract`, `click`, `fill`, `press_key`, `scroll`, `navigate`,
`screenshot`, `wait_for`, `submit`. The extension sends `sessions` events when authorization
changes and `activity` events as commands finish, and `ping` to keep the connection and its
service worker alive. After a worker restart it reconnects and its sessions are still there.

## Layout

```text
java-server/src/main/java/browsercontext/
  McpMain.java             MCP stdio server, tool definitions, port selection
  BrowserService.java      tool arguments -> commands -> rendered results, submission ids
  WebSocketBridge.java     localhost WebSocket: origin check, pairing, lockout, limits
  ExtensionConnection.java request correlation, deadlines, cancellation, per-session ordering
  Protocol.java            typed protocol messages
  Pairing.java             token file, rotation, HMAC proofs
  Log.java                 diagnostics without content
chrome-extension/src/
  background.ts            agent connections, sessions, gate, navigation, submissions, activity
  policy.ts                authorization and safety rules (pure functions)
  protocol.ts              typed protocol messages and validation
  content.ts               on-demand content script: fixed set of page operations
  snapshot.ts              hierarchy snapshot, element refs, completeness
  extract.ts               structured text, outline, sections
  interact.ts              click, fill, type, keys, scroll, wait
  submit.ts                what the page showed before and after a submission
  popup.html/.ts/.css      agents, sessions, activity, confirmations
demo-site/                 three local demo sites on three origins (test fixtures)
e2e/                       end-to-end, live-site and real-agent checks
```
