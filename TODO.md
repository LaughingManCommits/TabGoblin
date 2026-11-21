# TODO

## Overview

| Package | About | Depends on | Suggested order |
|---|---|---|---|
| [WP-7](#wp-7-an-automatic-mode-for-confirmations) | A mode between asking always and never | The owner's decisions | next |

Done and not listed: WP-1 (the server follows the MCP standard; see
[docs/mcp-conformance.md](docs/mcp-conformance.md)), WP-2 (text with line breaks, typed key by
key), WP-3 (consent that cannot be given by accident: issues A1, A2 and B6), WP-4 (a prompt that says
what is asked: issues B1 to B5 and D1 to D3), WP-5 (a no stands, and
one request waits at a time: issues A3 and A4) and WP-6 (Enter as a full submission, with tighter
exceptions: issues C1, C2 and C3). Numbers are not reused.

WP-5 was built differently from its proposal in one point. A limit on how often a session may ask
would have stopped an agent the user is working with: in a chat every message is a request. What
is limited instead is asking after refusals: three in a row, declined or left unanswered.

C4 stays as it was noted: that Enter and Space on a button used to pass without the rules of a
click is read from the source before commit `1f41d8c`, and was never measured.

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
- WP-5, which is done: the memory of a no, and the limit on asking after refusals.
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
