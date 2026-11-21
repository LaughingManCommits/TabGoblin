# TODO

## WP-2: Text with line breaks, typed key by key

**Status:** open, found 2026-11-21. **Owner:** unassigned.

`browser_fill` with `method: "type"` and a line break in the text is not among the fifteen lab
checks. A temporary check (`fill('one\ntwo', { method: 'type' })`, not kept) gave, with the tab in
front:

| Editor | Editor holds | Tool said |
|---|---|---|
| Draft.js | `one`, `t`, and a page error (`removeChild`) | mismatch |
| Trix | `onetwo` | mismatch |
| Editor.js | one block instead of two; the lab reads it as `onetwo` | **success** |
| the other twelve | `one`, `two` | success |

In a background tab the same three fail, each reported as a mismatch.

What is known about the causes:

- Trix draws a new paragraph in the next animation frame. Keys typed by the tool arrive faster
  than frames, so the key after Enter is placed by the page as it was before the paragraph.
- Editor.js leaves Enter to the browser while it does not know which block is the current one
  (read in its source). It appears to learn that from a delayed handler of selection changes,
  so an Enter typed right after the first characters comes too soon; this was not measured. The
  browser then breaks the line inside the block. Whether the saved block keeps that break was
  not looked at: the lab's reader for this editor drops markup.
- Draft.js: not investigated.

Tasks:

1. Add the check to the lab for good (sixteen checks; the counts in `docs/editors.md`,
   `docs/development.md` and the root `README.md` change with it).
2. In a visible tab, give the editor an animation frame after an Enter that is typed as part of a
   text, as it has between two keystrokes of a person. Measure whether that settles Trix.
3. Decide what to do for an editor that takes Enter only after a pause; do not wait blindly.
4. Look at what Editor.js saves in that case, and make the tool's report match it.


## WP-1: Follow the MCP standard, with the official SDK

**Status:** open, not started. **Owner:** unassigned.

### Goal

The server stays on the official MCP Java SDK (`io.modelcontextprotocol.sdk:mcp`, 2.2.0 today) and
does everything the way the protocol specification and the SDK intend. Where it does something by
hand that the standard now covers, it uses the standard. Where it is missing something a client may
expect, it adds it. No framework is introduced.

"The standard" means, in this order: the MCP specification revision that the SDK version in
`pom.xml` implements, the SDK's own documented usage, and ordinary Java and Maven conventions.

### Where we already conform

Keep these as they are; each gets a check in task 1 so that it stays true.

| Rule | How it is met |
|---|---|
| stdio: stdout carries protocol messages only, logs go to stderr | `McpMain` hands the real stdout to the transport and points everything else at stderr |
| stdio: the server exits when the client closes its input | `StdinTap` |
| A failed tool call is a result with `isError`, not a protocol error | `BrowserService.call` never throws; `McpMain.toMcp` |
| Tools declare read-only and destructive hints | `McpMain.tool` |
| Tool arguments are validated before anything is done | `BrowserService` |
| The tool list does not change at run time, and the server says so | `tools(false)` |

### Gaps to close

Found by reading `McpMain` and `BrowserService`. Each one starts with a check against the
specification, because some of these were written from memory of the protocol and not looked up.

| # | Gap | Today | Standard way |
|---|---|---|---|
| 1 | Cancellation is hand-made | `StdinTap` reads the input stream on the side to find `notifications/cancelled`, and matches calls by tool name and arguments | Use the SDK's own cancellation if 2.2.0 has it; keep `StdinTap` only for what the SDK still lacks |
| 2 | No progress for long calls | `browser_submit` can wait 95 seconds for the user's confirmation in silence | Send `notifications/progress` when the client gave a progress token |
| 3 | No protocol logging | Diagnostics go to stderr only | Declare the `logging` capability and send log notifications at the level the client sets, in addition to stderr |
| 4 | Results are JSON printed as text | `browser_click`, `browser_scroll`, `browser_navigate`, `browser_fill`, `browser_wait_for`, `browser_submit` return a JSON string in a text block | Declare an output schema and return structured content, with the text kept for older clients |
| 5 | Tools have no title | Annotations are built with a null title | Give each tool a human-readable title |
| 6 | Server identity is hard-coded and off-brand | `serverInfo("browser-context-mcp", "0.2.0")` in code, the version repeated from `pom.xml` | Name and title that match the product; the version read from the build |
| 7 | Shutdown is abrupt | `System.exit(0)` 200 ms after input ends | Close the server and the WebSocket in order, then exit; the same path for Ctrl+C |
| 8 | Unknown command-line flags are ignored | A mistyped `--show-tokn` silently starts a server | Reject unknown flags with the usage text and a non-zero exit code |
| 9 | Java naming is not conventional | Package `browsercontext`, Maven groupId `browsercontext` | A reverse-domain package and groupId |

### Tasks

1. **Pin the reference.** Record which specification revision SDK 2.2.0 implements. Go through the
   server-side requirements of that revision (lifecycle, stdio transport, tools, cancellation,
   progress, logging) and mark each one met, not met or not applicable. Correct the table above
   where the specification says otherwise.
2. **Add a conformance check to the build.** A test that starts the real jar and drives it as a
   client would: initialize, list tools, call one, cancel one, close the input, and assert on
   stdout purity and the exit. If the MCP Inspector can run headless, add it to CI as well.
3. **Close gaps 1 to 8**, one commit each, each with a test. Order: 7 and 8 (small, no protocol
   change), 5 and 6 (metadata), 1 (cancellation), 2 and 3 (notifications), 4 (structured results).
4. **Gap 4 needs care.** Agents read today's text results. Keep the text identical, add the
   structured form next to it, and run the end-to-end suite before and after.
5. **Decide gap 9 separately.** Renaming the package touches every file and the jar's entry point.
   Do it last, as one mechanical commit, or record here why it is left.
6. **Update the documentation:** `docs/tools.md` for result shapes and titles,
   `docs/architecture.md` for cancellation and shutdown, `docs/development.md` for the
   conformance check.

### Acceptance

- Every server-side requirement of the pinned specification revision is marked met or not
  applicable, in this file or in `docs/`.
- The conformance check runs in CI and passes.
- `mvn test`, the end-to-end suite and the editor lab pass unchanged.
- No tool's text output changed, unless the change is listed here.

### Out of scope

- A framework on top of the SDK. Looked at and set aside: the starters wrap this same SDK, and the
  server is too small to gain from them.
- A remote (HTTP) transport. The server is a local subprocess; that is a separate decision.
- The Chrome extension and the protocol between it and the server.
