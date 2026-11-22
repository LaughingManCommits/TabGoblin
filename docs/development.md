# Development

## Layout

```text
java-server/         the MCP server (Java 21, Maven)
chrome-extension/    the extension (TypeScript, Manifest V3, esbuild)
  src/               sources
  test/              unit tests (node:test, jsdom)
  icons/             goblin.svg and the PNGs rendered from it
  dist/              build output: load this folder in Chrome
demo-site/           three local demo websites on three origins (test fixtures)
e2e/                 end-to-end suite and helper scripts (Puppeteer, your Chrome)
docs/                this documentation, screenshots, example outputs
```

## Build

```sh
mvn -f java-server/pom.xml package                    # tests + java-server/target/browser-context-mcp.jar
cd chrome-extension && npm install && npm run check   # type-check, unit tests, build to dist/
```

After rebuilding the extension, press the reload button on its card in `chrome://extensions`.

## Tests

| Command | What it covers |
|---|---|
| `mvn -f java-server/pom.xml test` | Pairing, origin check, version negotiation, lockout, rotation, correlation, deadlines, cancellation, tool routing, submission ids, client cancel, the server's panel. Six tests of the panel's window need a display and are skipped without one |
| `mvn -f java-server/pom.xml verify` | The same, and then the built jar driven as an MCP client drives it: see [MCP conformance](mcp-conformance.md) |
| `cd chrome-extension && npm test` | Rules (`policy`), protocol validation, snapshot, extract, interactions, submission signals, the notice in the page, and the background worker against a fake Chrome |
| `cd e2e && npm test` | Everything together in your installed Chrome: two real servers, a hand-made protocol agent, three demo sites |
| `cd e2e/editors && npm test` | Text entry into thirteen editor libraries and two plain controls, checked against each editor's own model |

How the end-to-end run works:

- It starts real server processes and speaks MCP to them over stdio, like an IDE does.
- It launches your installed Chrome with a temporary profile, installs the unmodified extension,
  and triggers its toolbar button the way a click does, so Chrome's real `activeTab` grant is used.
- It drives the popup through its real controls.
- `HEADED=1 npm test` shows the browser; `BCMCP_CHROME=<path>` picks another Chrome.

Other scripts in `e2e/`:

| Script | Purpose |
|---|---|
| `node live.mjs <url> …` | Read-only smoke check on real websites |
| `node agent.mjs` | Hands the tools to a real model (the `claude` CLI) with questions that need expanding, scrolling or loading more; prints the tool calls. Costs a few cents. |
| `HEADED=1 node screenshots.mjs` | Regenerates the pictures of the popup and of the notice in `docs/images`, and `docs/examples` |
| `node notice-pictures.mjs` | Pictures the notice in the page in every state, drawn by `notice.ts` in a plain page, to look at |
| `node make-icons.mjs` | Renders the icon PNGs from `chrome-extension/icons/goblin.svg` |

### About the screenshots

The popup pictures are captures of the real popup window, taken through the browser's debugging
interface. Run the script with `HEADED=1`: a visible Chrome gives the popup its real size
(354 × 600), a headless one a different window. `popup-full.png` and `popup-full-light.png` are
the exception: they lay the popup's live content out at full length in an ordinary tab, to show
what is below the fold and what the light theme looks like.

The confirmation prompt has more cases than the documentation shows. `node screenshots.mjs prompts`
pictures all of them, in the dark and the light colour scheme, into `e2e/prompt-pictures/` (not in
git), and prints the text of each: a click, a click on a high-impact control, Enter in a text
box, with a long name, without a name, with a high-impact name, Enter in a field of a form; then a
session on which a no stands, the prompt in the automatic mode, a session in that mode with
one thing that passes and with two, the general setting with each of its three values, and the
panels folded to one line. Look at them after any change to the prompt. The end-to-end suite
reads the same texts, so wording cannot change unnoticed; how it looks, only eyes can tell.

The picture of the server's panel, `docs/images/server-panel.png`, is not a capture: a class
among the server's tests, `PanelPictures`, draws the panel in six states with the server's own
code, without a window. The command, and what to look at in the real window besides, is in the
[runbook](agents/runbook.md#look-at-the-servers-panel).

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main`, on every pull request, and when it is
started by hand:

| Job | Runs on | Does |
|---|---|---|
| Java server | Linux | `mvn verify`: compile, test, build the jar, check the jar against the protocol. Without a display: the tests of the panel's window are skipped |
| Chrome extension | Linux | `npm ci` and `npm run check`: type-check, unit tests, build |
| End to end | Windows | Builds both parts and runs the end-to-end suite in the runner's Chrome, headless |
| Editors | Windows | Builds both parts and runs the editor lab, tab in front |
| Nothing personal | Linux | Runs the tests of `docs/agents/check-personal.mjs` and then the check on the files |

The end-to-end job runs on Windows because that is where the suite is developed.

## The editor lab

`e2e/editors` holds one page per editor library (Monaco, CodeMirror 5 and 6, Ace, TipTap, Lexical,
Slate, Quill, Draft.js, TinyMCE, CKEditor 5, Trix, Editor.js, plus a plain textarea and a plain
editable region as controls). The libraries are ordinary npm dependencies of that folder, bundled
on the fly, so nothing is downloaded at test time and the versions are pinned.

Each page exposes the editor's own model as `window.__lab.get()`. The run enters text through the
whole chain and compares the model with what was asked for: fifteen checks per editor.

```sh
cd e2e && npm install         # the test runner, shared with the end-to-end suite
cd editors && npm install     # the editors
npm test                      # tab in front
BACKGROUND=1 npm test         # tab in the background while the agent works
ONLY=monaco,quill npm test    # some editors
CHECKS=lines,indent npm test  # some checks
VERBOSE=1 npm test            # also print what the tool answered each time
node lab.mjs                  # just serve the pages, to look at them
node live.mjs                 # the same idea on public demo pages of the editors' makers
```

The run fails when a check ends as `SILENT`: the editor does not hold the text, but the tool
reported success. An honest `fail` does not fail the run; it is a documented limit. Results and
their meaning are in [Editors](editors.md).

To add an editor: a fixture in `fixtures/` that creates it in `#host` with the text
`Initial content` and calls `ready(get)`, and an entry in `FIXTURES` in `lab.mjs`. Nothing in
the extension may refer to it.

## The demo sites

Three fixtures, each on its own port and therefore its own origin. Nothing in the extension or the
server knows about them.

| Site | Port | What it exercises |
|---|---|---|
| A, classic HTML | 8931 | Forms, a search form, a server-side form post, validation, collapsed sections, dynamic content, a password field, a redirect to another origin, a link that opens a new tab |
| B, single-page app | 8932 | `div`-based controls with ARIA roles, client-side routing, contenteditable, a custom checkbox, shadow DOM, a list that loads more on scroll, an inner scrolling area |
| C, documentation | 8933 | Nested headings, lists, a data table, a nested discussion, a same-origin frame, a frame from another origin, a "load more" button, text addressed to AI agents |

Run them by hand with `node demo-site/server.mjs`.

## Conventions

- **No website-specific code.** If a change needs a selector, hostname or product name, it does
  not belong here.
- **No library-specific code either.** An editor or widget is recognised by what it is in the DOM
  (an editing host, an EditContext, a role), never by a library's name, class names or attributes.
  The editor lab names libraries; the product does not, and a test (`agnostic.test.ts`) keeps it so.
- **Rules are pure.** Anything that decides whether something is allowed goes into `policy.ts` as
  a function without `chrome.*` or DOM access, with a test.
- **DOM code is pure too.** `snapshot`, `extract`, `interact`, `editor`, `submit` and `notice`
  take a document and run under jsdom.
- **Fail closed.** An unknown tab address, an unparseable message or a missing owner means no.
- **Nothing is retried.** A command is sent once; unknown outcomes are reported as unknown.
- **Only allowlisted information leaves the page.** New output fields need a reason and a test
  that hidden content and credentials stay out.
- **Errors are for the agent.** Each has a stable code and says what to do next.
- **The server's panel takes away and gives nothing,** and shows nothing of a page. The rules
  are in the [security model](security.md#the-servers-panel); what it shows is decided in
  `PanelModel`, without a window, so that a test can hold them.
- **Nothing personal in the repository.** No home directory, no mail address outside the example
  domains, no link to an agent's session, in a file or in a commit message. A path in an example
  is written with a placeholder (`<folder>`). A check keeps the files so
  ([runbook](agents/runbook.md#check-that-nothing-personal-is-in-the-files)); pictures and commit
  messages it does not read.

## Documentation

Each fact has one page; every other page links to it. Before writing something down, find the
page that owns it:

| Page | Owns |
|---|---|
| [README](../README.md) | What TabGoblin is, the quick start, the list of pages. It sums up and links |
| [Installation](installation.md) | Setting it up, and what goes wrong while doing that |
| [User guide](user-guide.md) | What the user sees and does: the popup, sessions, submissions, stopping, the server's panel, and what the popup's messages mean |
| [Tool reference](tools.md) | What each tool takes and returns: every text an agent reads, every error code |
| [Editors](editors.md) | Which editors can be filled, how, and what was measured |
| [Security model](security.md) | The rules: what is enforced where, what is tested, what remains a risk |
| [Architecture](architecture.md) | How it is built: processes, flows, where things are |
| [MCP conformance](mcp-conformance.md) | Which revision of MCP the server speaks, and how that is checked |
| Development, this page | Build, tests, CI, conventions, the messages between server and extension |
| [Cheat sheet](cheatsheet.md) | The commands at a glance, one line each. It explains nothing and names the page that does; a command is changed there when it changes in its own page |
| [Runbook](agents/runbook.md) | Commands by outcome, each with what success looks like |
| [State](agents/state.md), [validation log](agents/validation-log.md), [TODO](../TODO.md) | Records: what is open, what was run and when, what is planned |

- A page for users names what they see, not the code's classes and functions.
- How something came about, and what a run measured on a given day, goes into the validation
  log and into git, not into a page that explains.
- A number that a run produces (a count of tests, a size) goes stale: state it where a command
  beside it checks it, and nowhere else.
- After an edit, check the links and that nothing personal got in
  ([runbook](agents/runbook.md#check-the-documentation-links)).

## Adding a tool

1. Add the action to `ACTIONS` and its minimum access level to `REQUIRED` in `policy.ts`.
2. Implement the page operation in `interact.ts` (or a new pure module) and route it in `content.ts`.
3. Route the action in `runCommand` in `background.ts`.
4. Add the tool in `BrowserService.java` (argument validation) and `McpMain.java` (definition).
5. Test at each level: rule, DOM, routing, end to end.

## Protocol reference

Version 2. Typed in `Protocol.java` and `protocol.ts`; independent of MCP.

```json
{ "type": "challenge", "nonce": "…", "versions": [2] }
{ "type": "auth", "nonce": "…", "proof": "…", "version": 2 }
{ "type": "auth_ok", "proof": "…", "version": 2, "clientId": "c-1a2b3c4d", "clientName": "…" }

{ "id": "17", "action": "click", "session": "s2", "params": { "ref": 12 }, "deadline": 1700000000000 }
{ "id": "17", "success": true, "result": {}, "timing": { "ran": 132, "queued": 0, "asked": 0 } }
{ "id": "17", "success": false, "error": { "code": "NOT_AUTHORIZED", "message": "…" } }

{ "type": "cancel", "id": "17" }
{ "type": "client", "name": "IntelliJ IDEA" }
{ "type": "event", "event": "sessions", "data": { "sessions": [] } }
{ "type": "event", "event": "activity", "data": { "id": "17", "session": "s2", "action": "click", "ms": 132, "code": "ok" } }
{ "type": "ping" }   { "type": "pong" }
```

On a connection the server sends `auth_ok` before anything else, and may send a command or
`client` right behind it. Taking the connection for its paired one and sending `auth_ok` are one
step for the server's other threads (`WebSocketBridge.authenticate`): an extension that holds
`auth_ok` is connected for every tool call from then on, and none is told `NOT_CONNECTED`. The
agent's name is in `auth_ok` if the server knows it by then, and follows as `client` if it
learns it later; an agent names itself with its first tool call.

The extension takes the messages of a connection in the order they came. One that arrives while
it still checks the proof in `auth_ok` waits for that, and is then a message like any other.
Without a valid `auth_ok` before it, any other message is a failed pairing (4401).

`timing` comes with every answer, failed ones too, in milliseconds: how long the command ran in
the extension, how long it waited before that for its turn in the tab's queue, and how much of
the running was waiting for the user's answer. The server cannot see inside the round trip; with
these it says where the time of a tool call went (`Timings.java`,
[tools.md](tools.md#where-the-time-went)). The field is optional: an older server ignores it, and
without it the server counts the round trip whole.

| Close code | Meaning |
|---|---|
| 4401 | Pairing failed, timed out, or the token was rotated |
| 4403 | The user disconnected this agent |
| 4406 | No common protocol version |
| 4409 | Replaced by a newer connection |
| 4429 | Too many messages |

Two codes of the WebSocket standard are used as well: 1001 ("going away") when a server ends in
order, or when its connection is switched off in [its panel](architecture.md#the-servers-panel);
1009 when a message is larger than the receiver takes.

Proofs are `HMAC-SHA256(token, "client:" + serverNonce + ":" + clientNonce)` and the same with
`"server:"`, hex-encoded. A shared test vector is asserted in both `PairingTest.java` and
`pairing.test.ts`.

## Names

The product is TabGoblin. Some technical names predate it and are kept so existing setups keep
working: the jar and MCP server name (`browser-context-mcp`), the Java package (`browsercontext`),
the token directory (`~/.browser-context-mcp`) and the `BCMCP_*` environment variables.

The Java package and the Maven group, both `browsercontext`, do not follow the convention of a
reversed domain name. That is left as it is, decided on 2026-11-21:

- Nothing outside this repository sees either name. The jar is not published; it is run by its
  path.
- A conventional name needs a domain or an account name, which is the owner's to choose.
- The change touches every Java file and the jar's entry point, for no change in behaviour.

If the jar is ever published, rename then, in one commit that does nothing else.
