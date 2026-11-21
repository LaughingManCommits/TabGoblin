# TODO

## Overview

Nothing is open. New work gets the next number, WP-9.

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
