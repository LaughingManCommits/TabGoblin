# TODO

## Overview

One package is open: WP-9, where the time goes. It waits for the owner's word on three points.
New work gets the next number, WP-10.

Done and not listed: WP-1 (the server follows the MCP standard; see
[docs/mcp-conformance.md](docs/mcp-conformance.md)), WP-2 (text with line breaks, typed key by
key), WP-3 (consent that cannot be given by accident: issues A1, A2 and B6), WP-4 (a prompt that says
what is asked: issues B1 to B5 and D1 to D3), WP-5 (a no stands, and
one request waits at a time: issues A3 and A4) WP-6 (Enter as a full submission, with tighter
exceptions: issues C1, C2 and C3), WP-7 (an automatic mode for confirmations)
and WP-8 (small things left from that mode). Numbers are not reused.

WP-5 was built differently from its proposal in one point. A limit on how often a session may ask
would have stopped an agent the user is working with: in a chat every message is a request. What
is limited instead is asking after refusals: three in a row, declined or left unanswered.

C4 stays as it was noted: that Enter and Space on a button used to pass without the rules of a
click is read from the source before commit `1f41d8c`, and was never measured.

WP-7 was built as proposed, with the owner's decision for the first of its four questions (ask
once per control, then remember) and the proposals for the other three: the mode is set per
session, with a general setting that sets all; an Allow lasts 15 minutes and covers at most
five submissions a minute; and "Do not ask me" keeps meaning that Enter is not asked about
either. The alternative for the first question, a button "Allow for 15 minutes" in the prompt,
was not built.

Two things were added to WP-7 after its first commit, on going over it once more. The prompt
now says when an Allow will stand ("Automatic is on: after Allow, this passes without asking for
15 minutes."); before, the user allowed more than the prompt told them. And a control without a
name is asked about every time; before, one Allow covered every nameless control of the site.

WP-8 had three points. Two were built as proposed. `browser_status` says in a session's block
when that session asks differently from the general setting. The popup's list of what passes
names the kind of request ("Enter in “Comment”", "clicking “Post comment”"), and its button
says that it ends them all when there are several. The third was left as it is, on the owner's
word of 2026-11-21 ("leave 3"): a control stays known by its name on its site, so that "Save"
on another page of the site passes too. Narrowing it to the address of the page would make a
chat ask again in every conversation. The limit is stated in
[docs/security.md](docs/security.md) and in the user guide.

## WP-9: Where the time goes

Asked for by the owner on 2026-11-21. Goal: when work through TabGoblin is slow, to tell which
part took the time: the agent and its model, the server, or the extension and the page.

### What is measured today

Read from the source on 2026-11-21.

- **Server.** The round trip of each command to the extension, from sending it to its answer.
  One line per command in the log: `command id=17 session=s2 action=click ms=140 outcome=ok`,
  at `BCMCP_LOG=debug`; failures also at `info`. Not in that number: the wait for another call of
  the same session to finish, and the wait for the extension to connect.
- **Extension.** How long each command ran there, the page included, from its turn in the tab's
  queue to its answer. Kept for the last 50; `browser_status` with `diagnostics: true` lists the
  asking agent's last 20 (`s1 click 132ms ok`). In that number: the time the user took to
  answer a prompt. Not in it: the wait in the tab's queue.
- **Nowhere.** The time between two tool calls, which is the agent's and its model's, and the
  whole of one tool call as the agent sees it.

So two of the three can be compared today, by hand, for one call at a time.

### Is the server the only place to measure?

It is the place to collect and to report: only the server sees all three. By itself it can
measure the time between calls, the whole of a call, and the round trip to the extension. It
cannot see inside the round trip. For that the extension gives three numbers with each answer,
the first of which it measures already: how long the command ran, how long it waited in the
tab's queue, and how long the user took to answer. Without the third, a submission that waited
twenty seconds for the user reads as a slow extension.

### Proposal

1. Server, for every tool call: the time since the answer to the previous call; the whole call;
   the wait before the command was sent (no extension connected yet, another call of the same
   session running); the round trip. One place sees a call come and go: the handler in
   `McpMain.java`; the round trip is timed in `ExtensionConnection.java` already.
2. Extension, with each answer: `timing: { ran, queued, asked }` in milliseconds. A field an
   older server ignores; from an older extension the server reports the round trip unsplit.
3. Report, with no new tool: one log line per tool call at `debug`, and in `browser_status` with
   `diagnostics: true` a summary over the last calls, for each part the median and the longest,
   above the list of single calls.
4. Only tool names, session ids, durations and codes are recorded: no address and nothing of a
   page.

### What it cannot tell

- The model from the agent's program. The server sees how long it took until the next call
  came. If the user approves each tool call in that program, their time is in it too.
- The extension from the page. A page that is slow to load and an extension that is slow to
  work look the same in "ran". Splitting that is possible later, in the content script.

### Decisions for the owner

1. May the extension add the three numbers? Proposal: yes. Otherwise the report has one number
   for the browser, the user's answering time included.
2. Where it is read: the status tool with `diagnostics` and the log (proposal), or a file as
   well.
3. Splitting the extension's part into worker and page now, or when the first numbers point
   there (proposal).

### Tasks and acceptance

Per the task map: the rule and the worker for the three numbers, `protocol.ts` and
`Protocol.java` for the field, a class for the server's numbers with its test,
`BrowserServiceTest` for the status text, `docs/tools.md`, the protocol reference in
`docs/development.md`, and a step end to end: a call that waits for the user shows that time
under the user, not under the extension. Changing the status text is a change to a tool's
output.
