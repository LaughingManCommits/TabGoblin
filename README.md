# Browser Context MCP

Lets a local AI agent read and operate **one tab on one website that you authorize**, in your
normal Chrome with your normal login. Website-agnostic: there is no site-specific code.

```text
IntelliJ AI agent ──MCP stdio──> Java MCP server ──ws://127.0.0.1──> Chrome extension (MV3) ──> authorized tab
```

- **Agent** understands the site and decides what to do.
- **Java server** (`java-server/`) exposes nine generic MCP tools and forwards them.
- **Extension** (`chrome-extension/`) performs the browser operations and enforces authorization.

You log in yourself, click the extension icon on the tab, and authorize that origin. The agent
never sees cookies, headers, storage or tokens, and cannot run scripts.

## Build

Requires Java 21+, Maven, Node 24+ and Chrome 120+.

```sh
mvn -f java-server/pom.xml package        # -> java-server/target/browser-context-mcp.jar
cd chrome-extension && npm install && npm run build   # -> chrome-extension/dist
```

## Set up (once)

1. **Load the extension.** Open `chrome://extensions`, enable *Developer mode*, choose
   *Load unpacked* and select `chrome-extension/dist`. Pin its icon to the toolbar.
2. **Add the MCP server to your agent.** In IntelliJ's MCP server settings (AI Assistant or Junie),
   add a stdio server, using the absolute path of the jar:

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

   Any MCP client that can start a stdio server works the same way.
3. **Pair.** Print the pairing token and paste it into the extension popup:

   ```sh
   java -jar java-server/target/browser-context-mcp.jar --show-token
   ```

   The popup shows **Connected** once the agent has started the server.

## Use

1. Open the website and log in as usual.
2. Click the extension icon on that tab, pick **Read** or **Read / Write**, and click **Authorize**.
3. Ask your agent to work with the page.

The popup shows the authorized origin, the access level, what the agent is doing now and its last
five operations (generic descriptions only, never page content or typed text). **Pause** blocks
every command until you resume; **Revoke** ends access. The toolbar badge shows `ON`, `RUN`
(operation in progress), `II` (paused) or `?` (waiting for your confirmation).

| Tool | What it does |
|---|---|
| `browser_status` | Connection, authorized origin, access level, pause state, current tab |
| `browser_snapshot` | Visible page as compact lines with numbered refs: `[12] Button: Save` |
| `browser_extract` | Visible text and headings, pageable with `offset` |
| `browser_click` | Click an element by ref; `intent: "submit"` for submissions |
| `browser_fill` | Enter text into an input, textarea, select or basic contenteditable |
| `browser_scroll` | Scroll the page or a scrollable element, or bring a ref into view |
| `browser_navigate` | Go to an absolute or relative URL inside the authorized origin |
| `browser_screenshot` | Capture the visible viewport as an image |
| `browser_wait_for` | Bounded wait for visible text or an element (or for it to disappear) |

### Cues that there is more to look at

Results tell the agent what they left out and how to reach it:

- `browser_extract` covers the whole loaded page regardless of scroll position and ends its header
  with `continue with offset=N` while text remains.
- `browser_screenshot` returns a note with the image: which pixel range of the page it shows and
  how much lies above and below.
- `browser_snapshot` with `viewport_only` ends with how much is outside the viewport; a truncated
  snapshot says so.
- Snapshots and extracts end with a `Not shown:` line counting collapsed controls (expand, then
  read again) and embedded frames (unreadable).
- `browser_scroll` sets `loadedMore` when the page grew after scrolling, as feeds do.
- Snapshot and extract headers carry a `Scroll:` line (also for an inner scrolling panel) that says
  when more lies below, since content a site loads on scroll is not in the page yet.

`node e2e/agent.mjs` hands the tools to a real model (the `claude` CLI) with questions whose answers
are collapsed, below the fold, or loaded on scroll, and prints the tool calls it made.

### Reading, writing, submitting

| | Read | Read / Write |
|---|---|---|
| snapshot, extract, scroll, screenshot, wait, navigate within the origin | yes | yes |
| click same-origin links and disclosure toggles (`<summary>`) | yes | yes |
| click buttons and other controls, fill fields | no | yes |
| submit | no | only with `intent: "submit"` |

A click counts as a submission when the control submits a form (explicit GET search forms are
exempt), or when a button outside a form is labelled like one (*Save*, *Post*, *Delete*, …). Without
`intent: "submit"` such a click is refused with `SUBMIT_INTENT_REQUIRED`, so the agent has to state
that the user asked for it. With **Ask me before the agent submits anything** ticked (the default),
the popup then asks you to *Allow* or *Deny* each submission; unanswered requests expire after 60
seconds without clicking. Nothing is ever retried automatically: after a timeout or a lost
connection the agent is told the outcome is unknown and to inspect the page.

## Security model

**Not exposed, by construction:** cookies, HTTP headers, `localStorage`/`sessionStorage`,
authentication tokens, request or response bodies, the Chrome debugger, JavaScript evaluation, and
general HTTP requests. There are no tools or protocol actions for them, and the extension requests
only `activeTab`, `scripting`, `storage` and `alarms` — no host permissions, and none of `cookies`,
`webRequest`, `debugger` or `history`.

**Origin authorization.** Authorization is one tab plus one exact origin (scheme + hostname +
port); subdomains are different origins. It is enforced twice: Chrome's `activeTab` grant only
covers the tab you clicked the icon on and is withdrawn by Chrome when that tab leaves the origin,
and the extension re-checks the tab's URL before every command and again inside the page.
Navigation to another origin is rejected up front, links leading elsewhere are not clicked, and if
the tab leaves the origin anyway (a redirect, or you navigating) access is revoked immediately.
Returning to the site does not restore it: you authorize again. Authorization lasts until you
revoke it, the tab closes or leaves the origin, or the browser restarts.

**Local connection.** The server listens on `127.0.0.1` only. The WebSocket handshake is refused
unless its `Origin` is this extension's ID, and both sides then prove knowledge of the pairing token
with an HMAC challenge-response, so the token never crosses the socket and neither a web page nor
another local process on the port can drive the browser. Unpaired connections are closed, messages
are size-limited, every command has a timeout, and the token is never logged. The token is stored
in `~/.browser-context-mcp/pairing-token` and in the extension's storage.

**Page content.** Snapshots contain allowlisted information only — role, label, a few states,
visible text — never raw HTML, attributes, scripts, hidden inputs or hidden content. Values of
password fields and credential-like fields (one-time codes, card numbers, names containing
`password`/`token`/`secret`) are never read, and those fields cannot be filled.

### Limits you should know about

- **Visible content can be sensitive.** Whatever is on screen in the authorized tab (text,
  screenshots, non-password field values) is sent to your agent and its model provider.
- **Read access still navigates.** Navigation and link clicks are HTTP GETs. A site that changes
  state on GET (logout or vote links, for example) can be affected even with read access.
- **Page content is untrusted input** to your agent and may try to steer it. Keep submission
  confirmation on for sites where a wrong submission would hurt.
- The submission heuristic for buttons outside forms is English wording only.
- Top frame only: iframes and closed shadow roots are not read. New tabs and popups opened by the
  site are not followed.
- Complex custom editors may reject generic input; the tool then returns a clear error.
- A page blocked by a native `alert`/`confirm` dialog stops responding until you dismiss it.
- Screenshots need the authorized tab to be the visible tab of its window.
- One authorized tab and one agent at a time. Universal site compatibility is not claimed.

## Verify

```sh
mvn -f java-server/pom.xml test             # routing, WebSocket auth, timeouts, limits
cd chrome-extension && npm run check        # type-check, policy / snapshot / interaction tests, build
cd e2e && npm install && npm test           # full chain against the demo sites, in your Chrome
```

The end-to-end run starts the real server, drives it over MCP stdio, loads the unmodified extension
into your installed Chrome with a temporary profile, clicks its toolbar button, and works through
two structurally different demo sites (`demo-site/`): classic HTML forms, and a div-based
single-page app with ARIA roles, contenteditable and shadow DOM. `HEADED=1 npm test` shows the
browser. `node live.mjs <url> …` runs a read-only smoke check on real websites.

Try the demo sites by hand with `node demo-site/server.mjs` (http://127.0.0.1:8931 and :8932).

## Configuration

| Flag | Environment | Default | |
|---|---|---|---|
| `--port` | `BCMCP_PORT` | `47821` | WebSocket port; set the same port in the popup under *Connection…* |
| `--token-file` | `BCMCP_TOKEN_FILE` | `~/.browser-context-mcp/pairing-token` | Pairing token location |
| `--extension-origin` | `BCMCP_EXTENSION_ORIGIN` | this extension's ID | `any` accepts every `chrome-extension://` origin (token still required) |

Only one server can hold the port. If your IDE starts a second copy, its tools report that the
port is in use.

## Protocol (Java ⇄ extension)

Independent of MCP. After the handshake (`challenge` → `auth` → `auth_ok`):

```json
{ "id": "123", "action": "snapshot", "params": {} }
{ "id": "123", "success": true, "result": {} }
{ "id": "123", "success": false, "error": { "code": "NOT_AUTHORIZED", "message": "…" } }
```

Actions: `status`, `snapshot`, `extract`, `click`, `fill`, `scroll`, `navigate`, `screenshot`,
`wait_for`. The extension also sends `{"type":"event","event":"state",…}` when authorization or
pause changes, and `ping` to keep the connection and its service worker alive.

## Layout

```text
java-server/src/main/java/browsercontext/
  McpMain.java          MCP stdio server and tool definitions
  BrowserService.java   tool arguments -> commands -> rendered results
  WebSocketBridge.java  localhost WebSocket, origin check, pairing
  BrowserSession.java   request correlation, timeouts, no retries
  Pairing.java          token file and HMAC proofs
chrome-extension/src/
  background.ts         WebSocket client, authorization gate, tab tracking, activity, badge
  policy.ts             authorization rules (pure functions)
  content.ts            on-demand content script: fixed set of page operations
  snapshot.ts           DOM snapshot, element refs, visible-text extraction
  interact.ts           click, fill, scroll, wait
  popup.html/.ts/.css   activity panel and controls
demo-site/              two local demo sites on two origins
e2e/                    end-to-end and live checks
```
