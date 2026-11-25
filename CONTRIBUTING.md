# Contributing

TabGoblin is a browser bridge for AI agents: a local server with a CLI and an MCP interface
(`java-server/`, Java 21) and a Chrome extension (`chrome-extension/`, TypeScript, Manifest V3). This page is the short version; build, tests,
conventions and the protocol are in [development](docs/development.md).

## Build and test

You need a JDK 21 or newer, Maven, Node.js 24 and Chrome.

```sh
mvn -f java-server/pom.xml verify              # server: tests, the jar, the jar against MCP
npm --prefix chrome-extension install
npm --prefix chrome-extension run check        # extension: type-check, tests, build to dist/
npm --prefix e2e install
npm --prefix e2e test                          # both parts in a real Chrome
node docs/agents/check-links.mjs               # the documentation's links
node docs/agents/check-personal.mjs            # nothing personal in the files
```

The end-to-end suite needs both parts built. After rebuilding the extension, reload it at
`chrome://extensions`.

## What a change must keep

These decide whether a change can be accepted. The reasons are in the
[security model](docs/security-model.md) and under
[conventions](docs/development.md#conventions).

- **The security boundaries are fixed.** No cookies, headers, storage, tokens, raw HTTP,
  debugger or script evaluation. The extension's permissions stay `activeTab`, `scripting`,
  `storage` and `alarms`. If a feature cannot be made safe, it is left out; a rule is not
  loosened for it.
- **Website-agnostic and library-agnostic.** No selector, hostname, product name or library
  name in product code.
- **Nothing is retried, and success is never assumed.** An unknown outcome is reported as
  unknown.
- **Only allowlisted information leaves the page.** A new output field needs a reason and a
  test that passwords, hidden inputs and scripts stay out.
- **Rules are pure functions** in `policy.ts`, with tests. DOM code takes a document and runs
  under jsdom.
- **A tool's text output is a public contract.** If it changes, update the
  [tool reference](docs/mcp-reference.md) and run the end-to-end suite. A test holds the
  reference to the server's tool definitions.
- **Nothing personal** in a file or a commit message: no home directory, no real mail address.

## Documentation

Each fact has one page, and the others link to it; the
[table of pages](docs/development.md#documentation) says which page owns what. Document what
is implemented and what was measured, and say where it stops. Do not describe planned work as
done.

## Pull requests

- Keep a change small and add a test at each level it touches: rule, DOM, worker, end to end.
- Say in the description what was run and what was not.
- A security-relevant change says which row of
  [what is verified by tests](docs/security-model.md#what-is-verified-by-tests) it adds or
  changes.

Vulnerabilities are reported privately: see the [security policy](SECURITY.md).

Agents that work in this repository start from [AGENTS.md](AGENTS.md).
