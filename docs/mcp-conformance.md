# MCP conformance

What the server implements of the Model Context Protocol, which revision it is measured against,
and how that is checked. Written for WP-1 in [TODO.md](../TODO.md) on 2026-11-21.

## The reference

The server is built on the official Java SDK, `io.modelcontextprotocol.sdk:mcp` 2.2.0. That SDK
implements two generations of the protocol, through two separate APIs:

| Generation | Revisions | SDK packages |
|---|---|---|
| With a handshake (`initialize`), called "legacy" by the newer specification | 2024-11-05, 2025-03-26, 2025-06-18, 2025-11-25 | `io.modelcontextprotocol.server`, `.spec` |
| Stateless, called "modern" | 2026-07-28 | `io.modelcontextprotocol.modern` |

**The server uses the first API and is measured against revision 2025-11-25**, the newest it
speaks. It takes whichever of the four revisions the client asks for, and answers a revision it
does not know with 2025-11-25.

How this is known: read in the SDK's sources (`ProtocolVersions`,
`McpServerTransportProviderBase.protocolVersions()`, `modern/McpSchema`), and seen in the answers
of the built jar.

## Requirements of revision 2025-11-25

For a server on the stdio transport that offers tools and nothing else. "SDK" means the SDK does
it and the server only has to use it as intended.

| Requirement | Status | How |
|---|---|---|
| Answer `initialize` with the revision, the capabilities and the server's name and version | Met | SDK. The name is the one clients have configured, the title is the product's, and the version is read from the build. |
| Take the client's revision if supported, otherwise answer with the newest supported | Met | SDK |
| Messages are single lines; nothing else is written to standard output | Met | `McpMain` hands the real standard output to the transport and points everything else at standard error |
| Logging goes to standard error | Met | `Log` |
| Exit when the client closes the input | Met | `StdinTap` notices the end of input; the SDK does not end the process. The MCP server and the socket are closed in order first. |
| Declare the `tools` capability, and whether the list changes | Met | Declared, with `listChanged` false |
| A tool has a name, a description and an input schema that is a JSON Schema object | Met | `McpMain.toolSpecs` |
| A tool says whether it only reads and whether it can destroy (hints) | Met | `McpMain.tool` |
| A tool has a title for display | Met | `McpMain.TITLES` |
| A tool that fails answers with a result marked `isError`, not with a protocol error | Met | `BrowserService.call` never throws |
| An unknown tool, and an unknown method, are protocol errors | Met | SDK: `-32602` and `-32601` |
| `ping` is answered | Met | SDK |
| A cancelled request stops (`notifications/cancelled`) | Met in part | By hand, in `StdinTap`: this API of the SDK has no handler for it. The call is stopped in the browser. A result that says so is still sent, which the specification advises against and tells the client to ignore. |
| Progress for long requests (optional) | Not used | Gap 2 |
| Structured results with an output schema (optional) | Not used | Gap 4 |
| Log messages to the client (optional) | Not used | The SDK declares the `logging` capability by itself; the server sends nothing through it. See below. |

## A client of the newer generation

A client of revision 2026-07-28 does not start with a handshake. On stdio it should first ask
`server/discover`. The server answers "Method not found" (`-32601`). That revision tells the client
to take any error other than "unsupported protocol version" as the sign of a server of the earlier
generation, and to fall back to the handshake. The answer is checked by the conformance test; a
real client of the newer generation falling back has not been observed.

## What revision 2026-07-28 changes

Read in the specification's changelog and pages on 2026-11-21. For this server:

- No handshake and no session. Every request carries its revision and the client's capabilities.
- `server/discover` is required. It reports the revisions, the capabilities, the server's name and
  version, and the instructions.
- Every result carries a `resultType`.
- `ping` and `logging/setLevel` are gone. **Logging to the client is deprecated**: "New
  implementations SHOULD NOT adopt it; existing implementations SHOULD migrate to logging to
  stderr for stdio transports." This server already logs to standard error only.
- Cancellation and progress are unchanged. Structured results stay, with the advice to keep the
  text next to them.
- A server MAY serve both generations from one process: a request with the newer fields is
  served statelessly, and an `initialize` selects the older behaviour for that process.

The SDK serves the newer revision only through its `modern` API, which answers an `initialize`
with an error. Serving both from one process is not something the SDK does for the stdio
transport: it would take a part of our own in front of the two.

## An open decision

Which generation to serve is the owner's decision, recorded in WP-1:

1. **Stay with the handshake** (today). Works with every client that still sends `initialize`,
   and with newer clients for as long as they fall back.
2. **Serve both.** Needs our own switch in front of the SDK's two APIs, and every tool defined
   for both.
3. **The newer one only.** Clients that only know the handshake stop working.

## How it is checked

`McpConformanceIT` starts the built jar and talks to it over its standard input and output:
handshake, negotiation of the revision, `ping`, the list of tools and what each must have, a tool
that fails, an unknown tool, an unknown method, the probe of a newer client, the exit when the
input is closed, and that every line on standard output is a protocol message. With a stand-in
for the extension it also checks that a cancelled call is stopped where it runs, and that the
extension is told when the server ends.

```sh
mvn -f java-server/pom.xml verify
```

No browser is involved. A call that is cancelled while it runs in a real browser is covered by
the end-to-end suite.

## Done by hand, and why

| Part | Why the SDK is not enough |
|---|---|
| `StdinTap`, end of input | The SDK's transport stops reading; it does not end the process, and the WebSocket port would stay taken |
| `StdinTap`, cancellation | The SDK's API for the earlier revisions has no handler for `notifications/cancelled`, and does not tell a tool which request it is serving |
