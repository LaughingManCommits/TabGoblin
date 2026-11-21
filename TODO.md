# TODO

## Overview

| Package | About | Depends on | Suggested order |
|---|---|---|---|
| [WP-4](#wp-4-a-prompt-that-says-what-is-asked) | What the prompt tells the user, and how it looks | | 2 |
| [WP-5](#wp-5-requests-one-at-a-time-and-not-again-after-a-no) | Asking in order, and not again after a no | | 3 |
| [WP-7](#wp-7-an-automatic-mode-for-confirmations) | A mode between asking always and never | WP-5, and the owner's decisions | 5 |

Done and not listed: WP-1 (the server follows the MCP standard; see
[docs/mcp-conformance.md](docs/mcp-conformance.md)), WP-2 (text with line breaks, typed key by
key), WP-3 (consent that cannot be given by accident: issues A1, A2 and B6) and WP-6 (Enter as a
full submission, with tighter exceptions: issues C1, C2 and C3). Numbers are not reused.

C4 stays as it was noted: that Enter and Space on a button used to pass without the rules of a
click is read from the source before commit `1f41d8c`, and was never measured.

WP-4 and WP-5 come from a critical look at the work on Enter as a submission, on 2026-11-21. Their
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
- WP-6, which is done: repeats are refused, so that an Allow is not a licence to send the same
  thing again.

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
