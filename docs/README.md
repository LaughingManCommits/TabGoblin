# TabGoblin documentation

<img src="../chrome-extension/icons/icon128.png" width="72" alt="TabGoblin">

TabGoblin lets AI agents on your machine read and operate the browser tabs you authorize, in your
own Chrome with your own logins, without handing them cookies, tokens or the ability to run code.

| Document | Read it when you want to… |
|---|---|
| [Installation](installation.md) | build it and get it into Chrome, step by step |
| [User guide](user-guide.md) | authorize a tab, and understand what the popup shows and does |
| [Cheat sheet](cheatsheet.md) | find a command: build, pair, run with the panel, stop, test |
| [Tool reference](tools.md) | know what each tool takes and returns, with real outputs and every error code |
| [Editors](editors.md) | know which rich-text and code editors an agent can fill, and how that works |
| [Architecture](architecture.md) | understand how the pieces fit: processes, protocol, sessions, refs, submissions |
| [Security model](security.md) | know exactly what an agent can and cannot reach, and what is still your risk |
| [MCP conformance](mcp-conformance.md) | know which revision of the protocol the server speaks, and how that is checked |
| [Development](development.md) | build it, run the tests, change it, regenerate the screenshots |

## The idea in one picture

<!-- The same picture is in the root README.md: change both. -->
```mermaid
flowchart LR
  subgraph IDE["Your machine"]
    A1["AI agent<br/>(IDE, CLI)"] -- "MCP over stdio" --> S1["Java MCP server"]
    A2["Another agent"] -- "MCP over stdio" --> S2["Java MCP server"]
  end
  subgraph Chrome["Your Chrome"]
    X["TabGoblin extension"] --> T1["Tab you authorized<br/>session s1"]
    X --> T2["Another authorized tab<br/>session s2"]
    X -. "no access" .-> T3["Every other tab"]
  end
  S1 -- "WebSocket on 127.0.0.1<br/>paired with a token" --> X
  S2 -- "WebSocket on 127.0.0.1" --> X
  %% An empty place at the right edge: GitHub lays its zoom buttons over the bottom right corner of a diagram.
  T3 ~~~ ROOM["&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"]
  style ROOM fill:none,stroke:none
```

- The **agent** understands the website and decides what to do.
- The **server** offers eleven generic tools and passes them on. It knows nothing about any site.
- The **extension** does the work in the page and enforces what you allowed.
- **You** log in, choose the tabs, choose the access level, and can pause or revoke at any time.

## Vocabulary

| Term | Meaning |
|---|---|
| Agent | One MCP client (an IDE's assistant, a CLI). Each starts its own server process. |
| Session | One authorized tab, bound to one agent: `s1`, `s2`, … |
| Origin | Scheme + host + port, e.g. `https://app.example.com`. A session covers the origins you gave it and nothing else. |
| Access level | Read (look), Explore (also navigate and expand), Read / Write (also operate and submit). |
| Ref | The number in front of an element in a snapshot, e.g. `[12]`. Tools act on refs. |
| Suspended | The tab left the session's origins. Nothing is readable until you resume it on that tab. |
| Panel | A small window a server shows when it is started with `--panel`: its sessions, its log, and a button to stop it. See the [user guide](user-guide.md#9-the-servers-panel). |
