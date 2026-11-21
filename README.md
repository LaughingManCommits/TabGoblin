# TabGoblin

[![CI](https://github.com/LaughingManCommits/TabGoblin/actions/workflows/ci.yml/badge.svg)](https://github.com/LaughingManCommits/TabGoblin/actions/workflows/ci.yml)

<img src="chrome-extension/icons/icon128.png" width="64" align="left" alt="">

Lets AI agents on your machine read and operate **the browser tabs you authorize**, in your own
Chrome with your own logins. Agents get eleven generic browser tools over MCP; they never get your
cookies, tokens or the ability to run code, and they reach only the tabs and websites you chose.

<br clear="left">

```text
IDE agent ──MCP stdio──> Java MCP server ──ws://127.0.0.1──┐
IDE agent ──MCP stdio──> Java MCP server ──ws://127.0.0.1──┼──> TabGoblin extension ──> authorized tabs
```

<img src="docs/images/popup-sessions.png" width="354" alt="The TabGoblin popup with two sessions"> <img src="docs/images/popup-confirm.png" width="354" alt="The popup asking to allow a submission">

## What it does

- **Sessions.** Each tab you authorize is a session with one website, one access level and one
  owning agent. Several tabs and several agents work side by side and cannot reach each other.
- **Access levels.** Read looks, Explore also navigates and expands, Read / Write also operates.
- **Reading.** A structured snapshot with numbered elements, and structured text with an outline;
  both bounded, and both say how complete they are.
- **Acting.** Click, fill, type, press keys, scroll, navigate, go back, wait, take screenshots.
- **Submitting.** Declared by the agent, confirmed by you, sent once, and verified against the
  page: confirmed, failed or uncertain, with the evidence.
- **Control.** Pause or revoke a session, disconnect an agent, watch what happens. If a tab leaves
  its website the session is suspended until you resume it.
- **Website-agnostic.** No site-specific code anywhere; the agent supplies the understanding.

## Quick start

Requires Java 21+, Maven, Node 24+ and Chrome 120+.

```sh
mvn -f java-server/pom.xml package
cd chrome-extension && npm install && npm run build
```

1. Load `chrome-extension/dist` as an unpacked extension at `chrome://extensions`.
2. Add the server to your agent's MCP settings:

   ```json
   {
     "mcpServers": {
       "tabgoblin": {
         "command": "java",
         "args": ["-jar", "C:/projects/TabGoblin/java-server/target/browser-context-mcp.jar"]
       }
     }
   }
   ```

3. Run the jar with `--show-token` and paste the token into the popup.
4. Open a website, click the goblin on that tab, pick an access level, and press **Authorize**.

The [installation guide](docs/installation.md) walks through each step with what you should see.

## Documentation

| | |
|---|---|
| [Installation](docs/installation.md) | Build the server and the extension, load it in Chrome, connect your agent, pair |
| [User guide](docs/user-guide.md) | Authorize tabs, the popup, submissions, troubleshooting |
| [Tool reference](docs/tools.md) | Every tool with real outputs, completeness, every error code |
| [Editors](docs/editors.md) | Which rich-text and code editors can be filled, how, and what was measured |
| [Architecture](docs/architecture.md) | Processes, protocol, sessions, refs, navigation, submissions |
| [Security model](docs/security.md) | What an agent can reach, how it is enforced, what remains your risk |
| [Development](docs/development.md) | Build, tests, demo sites, conventions, protocol reference |

## Verify

```sh
mvn -f java-server/pom.xml test         # 52 tests
cd chrome-extension && npm run check    # 105 tests, type-check, build
cd e2e && npm install && npm test       # 81 steps in your Chrome, against three demo sites
cd e2e/editors && npm install && npm test   # text entry into 14 real editor libraries
```

## Limits worth knowing

- Whatever is visible in an authorized tab is sent to your agent and its model provider.
- Page content is untrusted input and may try to steer an agent within the access you granted.
  Keep submission confirmation on where a wrong submission would hurt.
- Each time a tab changes website Chrome withdraws the extension's access, so a session spanning
  two websites needs one click from you per move.
- Frames from another website and closed shadow roots are not read.
- Rich-text and code editors are filled without real keystrokes, which a page script cannot
  produce. Fourteen common editor libraries are tested ([results](docs/editors.md)); editors that
  draw to a canvas, such as Google Docs, are out of reach.
- There is no hover. Content that a page shows only while the mouse is over something (CSS
  `:hover`) cannot be brought up: only a real pointer or Chrome's debugger sets that state, and
  the debugger is excluded by design. Menus that also open on click or keyboard focus work.
- Recognising submit-like and high-impact buttons outside forms relies on English labels.
- Not yet tried with IntelliJ's own agent: the tools are verified with a generic MCP client and
  with the `claude` CLI.

Some technical names predate the product name and are kept for compatibility: the jar and MCP
server (`browser-context-mcp`), the token directory, and the `BCMCP_*` variables.

## Licence

[MIT](LICENSE).
