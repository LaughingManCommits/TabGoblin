# TODO

## Overview

| Package | About | Depends on | Suggested order |
|---|---|---|---|
| [WP-4](#wp-4-a-prompt-that-says-what-is-asked) | What the prompt tells the user, and how it looks | | 2 |
| [WP-5](#wp-5-requests-one-at-a-time-and-not-again-after-a-no) | Asking in order, and not again after a no | | 3 |
| [WP-6](#wp-6-enter-as-a-full-submission-with-tighter-exceptions) | Enter gets what other submissions get | | 4 |
| [WP-7](#wp-7-an-automatic-mode-for-confirmations) | A mode between asking always and never | WP-5, WP-6, and the owner's decisions | 5 |
| [WP-1](#wp-1-follow-the-mcp-standard-with-the-official-sdk) | The server and the MCP standard | | **1: next, by the owner's word on 2026-11-21** |

Done and not listed: WP-2 (text with line breaks, typed key by key) and WP-3 (consent that cannot
be given by accident: issues A1, A2 and B6). Numbers are not reused.

WP-4 to WP-6 come from a critical look at the work on Enter as a submission, on 2026-11-21. Their
issues keep the letters they were noted under (A1 ... D3). In the tables, "checked" means it was
run or looked at; "read" means it follows from the source and was not run.

## WP-4: A prompt that says what is asked

**Status:** open, not started. **Owner:** unassigned.

### Goal

From the prompt alone the user knows who asks, what would be done, where, and with what. Every
sentence in it is true for the case at hand.

### Issues

| # | Issue | How it is known |
|---|---|---|
| B2 | The prompt names the text box, not its content: it does not show what would be sent. For a click it does not show the fields either. | Looked at |
| B3 | It says "The agent", not which one. With two agents the user has to look the session's owner up in the list below. | Looked at |
| B4 | The website shown is the session's first site. A session can span several, so it may not be the one the tab is on. | Read; not tried with a session over two sites |
| B5 | A high-impact prompt does not say why. For Enter the only evidence is the name of the text box, which rarely contains such a word. | Looked at |
| D1 | The style for a key (`kbd`) applies to the whole popup and carries the prompt's amber border. | Read |
| D2 | In the line with the session and its website, the website is as heavy as the name in the question above. Two bold things compete. | Looked at |
| D3 | The check of twenty pictures was made with a script that was not kept. It cannot be repeated from the repository, and nothing tests what the popup writes for each case. | Checked: the script is gone |

### Tasks

1. Done: the prompt for a field of a form says that Enter submits the form (B1).
2. Name the agent (B3), with the id added when two agents have the same name, as in the lists.
3. Show the website the tab is on (B4). Try it with a session over two sites.
4. Show what would be sent (B2): the beginning of the text in the box for Enter; for a click, the
   fields the submission fills. As a quotation, as plain text, with a limit (proposal: 120
   characters). Never a password field. This is shown to the user only; nothing new reaches the
   agent.
5. Say which word made a prompt high-impact (B5).
6. Limit the key style to the prompt (D1); set the website in normal weight (D2).
7. Make the check repeatable (D3):
   - a mode of `e2e/screenshots.mjs` that pictures the prompt's cases in both colour schemes,
     into a folder outside `docs/`;
   - an end-to-end step that reads the prompt's text for each case: a click, Enter in a text box,
     Enter in a field of a form, no name, a long name, a high-impact name.

### Acceptance

- Each case's text is asserted end to end.
- The pictures of all cases were looked at in both colour schemes after the last change.
- `docs/images/popup-confirm*.png` are regenerated, and `docs/user-guide.md` describes the parts
  of the prompt.

## WP-5: Requests one at a time, and not again after a no

**Status:** open, not started. **Owner:** unassigned.

### Goal

A no is final for a while, and the user is never asked about something they cannot see.

### Issues

| # | Issue | How it is known |
|---|---|---|
| A3 | After Deny the same request can be made at once, and again, without limit. Repeated prompts wear consent down. | Read: a denial is not remembered |
| A4 | If two requests are pending, only the first is shown. The second waits unseen and runs out after 60 seconds. | Read: the popup is given the first pending request only |

### Tasks

1. Remember a denial: for the same control in the same session (kind of request and name), refuse
   with `SUBMIT_DENIED` without asking again, for a time (proposal: 5 minutes). The message tells
   the agent that the user declined and that asking again will not help.
2. Limit how often a session may raise a prompt (proposal: 3 a minute). Beyond that, refuse.
3. One request at a time. Proposal: while one is pending, another is refused at once with an error
   that says so, rather than queued. A queue would have to fit inside the server's 95 seconds for
   a submission, and a request that waits unseen is what A4 is about.
4. Tell the user in the popup when requests were refused for these reasons, in the activity list.

### Acceptance

- A request that was just declined does not raise a second prompt (worker test, end-to-end).
- A burst of requests raises at most the allowed number of prompts (worker test).
- A second request while one is pending is refused with its own error code, documented in
  `docs/tools.md`.

## WP-6: Enter as a full submission, with tighter exceptions

**Status:** open, not started. **Owner:** unassigned.

### Goal

A declared Enter gets what every other submission gets: sent once, and a verdict. The exceptions
that let Enter through unasked cannot be met by accident.

### Issues

| # | Issue | How it is known |
|---|---|---|
| C1 | The exception for an open list of options is easy to meet: `aria-expanded="true"` or any `aria-activedescendant` on the text box is enough. A message box that carries `aria-expanded` for another reason needs neither intent nor consent. | Read; not tried on real products |
| C2 | The exception for search goes by English words in the name or the placeholder: search, find, filter, look up, go to, jump to. A message box with such a word is not asked about; a search box named otherwise is. | Checked, by a test of the wording |
| C3 | Enter is a submission without the rest: no submission id, no refusal of a repeat, no verdict of confirmed, failed or uncertain. Pressed twice, it sends twice. | Read |
| C4 | That Enter and Space on a button used to pass without the rules of a click is read from the source before the change. It was not measured. | Read |

### Tasks

1. **C3.** Run a declared Enter through the submission flow: a submission id, a fingerprint of the
   text in the box, refusal of the same content within two minutes unless repeated on purpose, and
   a verdict from what the page does afterwards (the box emptied, the text appearing elsewhere).
   Decide the tool surface first: `browser_press_key` returning the verdict when `intent` is
   `submit`, or `browser_submit` taking a text box and "by Enter". The second keeps one tool for
   submissions. Either changes a tool's result: `docs/tools.md` and the end-to-end suite.
2. **C1.** Require a list that the text box points to (`aria-controls`, `aria-owns` or
   `aria-activedescendant`), that exists, is visible, and is a list of options by its role.
   `aria-expanded` alone is not enough.
3. **C2.** Go by the type and role of the box first (`type="search"`, `role="searchbox"`, inside
   `role="search"`). Decide which words remain, if any, and whether they apply to text areas and
   editors at all. List the cases the decision rests on.
4. See which boxes are exempt today: run the editor lab with `VERBOSE=1` and note for each editor
   whether its Enter was asked about. None of them is a search box.
5. C4 needs nothing, unless the claim is to be relied on. Then run the new tests against the
   source before commit `1f41d8c`.

### Acceptance

- The same text sent twice by Enter is refused the second time (end-to-end).
- The result of a declared Enter carries a verdict (end-to-end), and `docs/tools.md` describes it.
- A message box with `aria-expanded="true"` and no list is asked about (unit test); a text box with
  an open list of options is not.
- The exceptions are listed in `docs/security.md` as they then are.

## WP-7: An automatic mode for confirmations

**Status:** proposed by the owner on 2026-11-21. **Needs the owner's decisions before work
starts.** **Owner:** unassigned.

### Goal

Something between asking about every submission and asking about none. The user is asked when it
matters; what they have just allowed is not asked again each time.

### What there is today

One setting for everything: "Ask me before the agent submits anything", on or off. Off still asks
for high-impact actions. With Enter now a submission, "on" means a prompt for every message an
agent sends in a chat.

### Proposal

A setting with three values instead of two:

| Value | The user is asked |
|---|---|
| Ask every time (default) | About every submission |
| Automatic | The first time for each control; after an Allow, the same control passes for a while |
| Do not ask | Only about high-impact actions, as today's "off" |

In Automatic:

- **The same control** means: the same session, the same website, the same kind of request (a
  click, or Enter) and the same name. A text box whose name changed is another control.
- **For a while** means a fixed time after the Allow (proposal: 15 minutes).
- **Always asked, whatever was allowed before:** a high-impact action; a control not allowed yet;
  more submissions passing unasked than a limit allows (proposal: 5 a minute).
- **What was allowed is forgotten** when the time is up, when the session is paused, revoked or
  suspended, when its access level changes, and when the extension's worker restarts. It is never
  stored.
- **It is visible.** The popup lists what currently passes unasked, with the time left and a
  control to forget it. The activity list marks what was allowed automatically.

The rule is a pure function in `policy.ts`, like the others: no model, nothing about websites.

### What it must not do

- Carry an Allow to another session, another website or another control.
- Apply to high-impact actions.
- Survive a restart, or outlast its time.

### The risk, stated plainly

What the user allowed once is what injected text would use. After "Enter in Message" was allowed,
an agent that is misled by a page can send anything there for fifteen minutes. The time limit, the
limit per minute, the refusal of repeats (WP-6) and the list with its forget control reduce that;
they do not remove it. `docs/security.md` has to say so under what remains the user's risk.

### Depends on

- WP-3, which is done: an Allow that can be given by accident must not be remembered.
- WP-5: the limits on asking, and the memory of a no.
- WP-6: repeats are refused, so that an Allow is not a licence to send the same thing again.

### Decisions for the owner

1. **What Automatic means.**
   - (a) Ask once per control, then remember (the proposal above).
   - (b) Never remember by itself: the prompt gets a second button, "Allow for 15 minutes", and
     only that remembers. Consent stays something the user gives each time they want it.
   - (c) Both: the button always, the mode for those who choose it.
2. **Per session or for everything.** Proposal: per session, so that a chat can be on Automatic
   while a bank stays on asking every time. Today's setting is for everything.
3. **The numbers:** how long an Allow lasts, and how many may pass unasked in a minute.
4. **Enter with "Do not ask" (A5).** Today a declared Enter is then not put to the user. Keep
   that, or always ask about Enter unless the mode is Automatic and the box was allowed.

### Tasks, once decided

1. The rule and its tests in `policy.ts`.
2. The worker: what is remembered, and when it is forgotten.
3. The popup: the setting, the list of what passes unasked, the mark in the activity list.
4. `docs/user-guide.md`, `docs/security.md`, `docs/tools.md`, and the pictures.
5. End to end: asked the first time, not the second, asked again after the time, after a pause,
   for another control, and for a high-impact name; the limit per minute.

### Acceptance

- Each of the cases in task 5 passes end to end.
- Nothing that was allowed is left after a restart of the worker (end-to-end).
- The risk is stated in `docs/security.md`.

## WP-1: Follow the MCP standard, with the official SDK

**Status:** in progress since 2026-11-21: tasks 1 and 2 are done. **One decision is the owner's**
(below). **Owner:** unassigned.

### Goal

The server stays on the official MCP Java SDK (`io.modelcontextprotocol.sdk:mcp`, 2.2.0 today) and
does everything the way the protocol specification and the SDK intend. Where it does something by
hand that the standard now covers, it uses the standard. Where it is missing something a client may
expect, it adds it. No framework is introduced.

"The standard" means, in this order: the MCP specification revision that the SDK version in
`pom.xml` implements, the SDK's own documented usage, and ordinary Java and Maven conventions.

### What pinning the reference showed

The full account is in [docs/mcp-conformance.md](docs/mcp-conformance.md). In short:

- SDK 2.2.0 implements two generations of the protocol through two APIs: the revisions with a
  handshake, up to 2025-11-25, and the stateless revision 2026-07-28. The server uses the first,
  and is measured against 2025-11-25.
- A client of the newer revision is told to fall back to the handshake when a server answers its
  first request with an error. This server does.
- Gap 3 was wrong: logging to the client is deprecated in 2026-07-28, with the advice to log to
  standard error, which the server does. It is dropped.
- Gap 1 stays by hand: the SDK's API for the earlier revisions has no handler for a cancelled
  request. What can improve is that a cancelled call still sends a result.

### Decision for the owner: which generation to serve

1. **Stay with the handshake** (today, and the default until decided). Works with every client
   that sends `initialize`, and with newer clients for as long as they fall back.
2. **Serve both.** The specification allows it. The SDK does not do it for the stdio transport:
   it needs a switch of our own in front of the SDK's two APIs, and each tool defined for both.
3. **The newer one only.** Clients that only know the handshake stop working.

Gaps 4, 5 and 6 are worth doing either way, and carry over to the newer API.

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
| 1 | A cancelled call still answers | `StdinTap` stops the call, by hand, because this API of the SDK has no handler for `notifications/cancelled`. A result that says "cancelled" is then sent. | The specification advises sending nothing for a cancelled request. See whether the handler can end without a result; otherwise leave it, as the client is told to ignore it. |
| 2 | No progress for long calls | `browser_submit` can wait 95 seconds for the user's confirmation in silence | Send `notifications/progress` when the client gave a progress token |
| 4 | Results are JSON printed as text | `browser_click`, `browser_scroll`, `browser_navigate`, `browser_fill`, `browser_wait_for`, `browser_submit` return a JSON string in a text block | Declare an output schema and return structured content, with the text kept for older clients |
| 5 | Tools have no title | Annotations are built with a null title | Give each tool a human-readable title |
| 6 | Server identity is hard-coded and off-brand | `serverInfo("browser-context-mcp", "0.2.0")` in code, the version repeated from `pom.xml` | Name and title that match the product; the version read from the build |
| 7 | Shutdown is abrupt | `System.exit(0)` 200 ms after input ends | Close the server and the WebSocket in order, then exit; the same path for Ctrl+C |
| 9 | Java naming is not conventional | Package `browsercontext`, Maven groupId `browsercontext` | A reverse-domain package and groupId |

### Tasks

1. Done: the reference is pinned and each requirement marked, in `docs/mcp-conformance.md`.
2. Done: `McpConformanceIT` starts the built jar and drives it as a client would. It runs with
   `mvn verify`, also in CI. Not done: cancelling a call there, which needs a browser and is left to
   the end-to-end suite; and the MCP Inspector, which was not tried.
3. **Close the gaps**, one commit each, each with a test. Done: 8 (a mistyped option is refused).
   Order for the rest: 7 (shutdown), 5 and 6 (metadata), 1 (cancellation), 2 (progress),
   4 (structured results).
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
