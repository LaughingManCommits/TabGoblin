# TODO

## Overview

One package is open: WP-8, three small things left from the automatic mode. Each waits for a
word from the owner, because it changes a text that agents or users read, or is a choice. New
work gets the next number, WP-9.

Done and not listed: WP-1 (the server follows the MCP standard; see
[docs/mcp-conformance.md](docs/mcp-conformance.md)), WP-2 (text with line breaks, typed key by
key), WP-3 (consent that cannot be given by accident: issues A1, A2 and B6), WP-4 (a prompt that says
what is asked: issues B1 to B5 and D1 to D3), WP-5 (a no stands, and
one request waits at a time: issues A3 and A4) WP-6 (Enter as a full submission, with tighter
exceptions: issues C1, C2 and C3) and WP-7 (an automatic mode for confirmations). Numbers are not
reused.

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

## WP-8: Small things left from the automatic mode

Noted on 2026-11-21. None is a fault in a rule. Each is a text that says less than it could, or
a choice that was made by default.

1. **The status tool gives the general setting only.** `browser_status` prints one line,
   "Submissions need user confirmation: …", from the general setting. An agent in a session with
   its own setting reads what holds for the others: "no" while the user is in fact asked the first
   time. Agents need not act on the line, and `docs/tools.md` says a session may differ.
   Proposal: a line in the session's block when its setting differs from the general one. It
   changes a tool's text: `background.ts` (`sessionsFor`), `BrowserService.java`,
   `BrowserServiceTest`, `docs/tools.md`, a step end to end.
2. **The list of what passes names the control, not the kind of request.** "Passes without
   asking: “Comment” (15 min)." The Allow is for Enter in that box, not for a click on something
   of that name, and the popup does not say which. And "Ask about it again" ends all that passes
   in the session, also when two are listed. Proposal: "Enter in “Comment”", "clicking “Post”",
   and "Ask about them again" for several. Changes `popup.ts` (`standingAllows` would give the
   kind), a step end to end, and `docs/images/popup-automatic.png`.
3. **A control is known by its name on its site.** After "Save" was allowed on one page, "Save"
   on another page of that site passes too, in the same session, for the rest of the 15
   minutes. It is stated in `docs/security.md` and in the user guide. Narrowing it to the
   address of the page would make a chat ask again in every conversation, and would not hold on
   sites that change the address while one works; that is why it was left. For the owner to
   decide: leave it, or narrow it.

Acceptance for 1 and 2: the tests of each level that changes, the end-to-end suite, and the
pictures looked at in both colour schemes.
