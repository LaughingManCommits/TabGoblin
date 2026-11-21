# TODO

## Aftercare: Enter as a submission, and its prompt

**Status:** open, noted 2026-11-21 after a critical look at the work on branch `typed-lines`.
Nothing here is fixed yet. **Owner:** unassigned.

"Checked" means it was run or looked at; "read" means it follows from the source and was not run.

### The consent itself

| # | Issue | How it is known | What to do |
|---|---|---|---|
| A1 | **Allow can be given by accident from the keyboard.** The prompt opens by itself and takes the keyboard away from the page. Nothing is focused, so Space or Enter alone do nothing, but Allow is the first stop for Tab: Tab, then Enter or Space, allows the request. Someone tabbing through a form when the prompt comes up is two keys from consent. | Checked, in a visible Chrome | Make Deny the first stop, or take the buttons out of keyboard reach until the user has moved the mouse or pressed a key deliberately; ignore all input for a moment after the prompt appears, as browsers do for permission prompts |
| A2 | **Allow can be given by accident with the mouse.** The buttons accept a click from the instant they appear, under wherever the pointer was heading. | Read | The same delay as A1 |
| A3 | **Nothing stops an agent from asking again.** After Deny the same request can be made at once, and again, without limit. Repeated prompts wear consent down. | Read: a denial is not remembered | Refuse a request that was just declined without asking again, for some minutes; limit prompts per session |
| A4 | **Only one request is shown.** If two are pending, the second waits unseen and runs out after 60 seconds. | Read: the popup is given the first pending request only | Show how many are waiting, and the next one after an answer |
| A5 | **With "Ask me before the agent submits anything" off, Enter is not put to the user.** That is the meaning of the setting, but the owner asked for a person in the loop for Enter. | Checked, by a test | Owner's decision: leave it, give Enter its own setting, or always ask for Enter |

### What the user is told

| # | Issue | How it is known | What to do |
|---|---|---|---|
| B1 | **The explanation is wrong for a field of a form.** The Enter prompt always says "In a message or comment box, Enter sends what is written". For a field of a form, Enter submits the form for certain, and the prompt should say that. | Read: the popup is not told which of the two it is. Introduced with the prompt. | Pass `form` or `text` to the popup and word each. Small; do this first. |
| B2 | **The prompt does not show what would be sent.** It names the text box, not its content. For a click it does not show the fields either. | Looked at | Show the beginning of the text, as a quotation |
| B3 | **It says "The agent", not which one.** With two agents the user has to look the session's owner up in the list below. | Looked at | Name the agent |
| B4 | **The website shown may not be the one the tab is on.** The prompt shows the session's first site. A session can span several. | Read; not tried with a session over two sites | Show the site the tab is on |
| B5 | **A high-impact prompt does not say why.** For Enter the only evidence is the name of the text box, which rarely contains such a word. | Looked at | Say which word made it high-impact; consider the content as well as the name |
| B6 | **The prompt is not announced to assistive technology.** It is a section with a heading: no role, no live region. | Read, from the markup | `role="alertdialog"` with a label; mind A1 when moving focus |

### The rule

| # | Issue | How it is known | What to do |
|---|---|---|---|
| C1 | **The exception for an open list of options is easy to meet.** `aria-expanded="true"` or any `aria-activedescendant` on the text box is enough. A message box that carries `aria-expanded` for another reason would need neither intent nor consent. | Read; not tried on real products | Require a list the text box points to, that exists and is visible |
| C2 | **The exception for search goes by English words** in the name or the placeholder: search, find, filter, look up, go to, jump to. A message box with such a word is not asked about; a search box named otherwise is. | Checked, by a test of the wording | Narrow the words; prefer the type and role of the box to its name |
| C3 | **Enter is a submission without the rest of what a submission gets.** No submission id, no refusal of a repeat, no verdict of confirmed, failed or uncertain. Pressed twice, it sends twice. | Read | Run a declared Enter through the submission flow: fingerprint the text, refuse a repeat, watch what the page does |
| C4 | **That Enter and Space on a button used to pass without the rules of a click was not measured.** It is read from the source before the change. | Read; the run against the old source was not made | Nothing, unless the claim is needed |

### The look

| # | Issue | How it is known | What to do |
|---|---|---|---|
| D1 | The style for a key (`kbd`) applies to the whole popup and carries the prompt's amber border. | Read | Limit it to the prompt |
| D2 | In the line with the session and its website, the website is as heavy as the name in the question above. Two bold things compete. | Looked at | Set the website in normal weight |
| D3 | The check of twenty pictures was made with a script that was not kept. It cannot be repeated from the repository, and nothing tests what the popup writes for each case. | Checked: the script is gone | A mode of `screenshots.mjs` that pictures the prompt's cases, and an end-to-end step that reads the text of each |

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
