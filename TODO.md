# TODO

## Overview

Six packages are open, all asked for by the owner on 2026-11-21: WP-10, disconnecting an agent
ends its authorizations; WP-11, the notice in the page; WP-12, a goblin that acts out what the
agent does; WP-13, a panel for the server; WP-14, nothing personal in the repository, which the
owner called important; and WP-15, an easy install. Of WP-14 the files and the check were done
on 2026-11-22; the history remains, and is the owner's. The other five are not started, and
each waits for the owner's word on its points. New work gets the next number, WP-16.

Done and not listed: WP-1 (the server follows the MCP standard; see
[docs/mcp-conformance.md](docs/mcp-conformance.md)), WP-2 (text with line breaks, typed key by
key), WP-3 (consent that cannot be given by accident: issues A1, A2 and B6), WP-4 (a prompt that says
what is asked: issues B1 to B5 and D1 to D3), WP-5 (a no stands, and
one request waits at a time: issues A3 and A4), WP-6 (Enter as a full submission, with tighter
exceptions: issues C1, C2 and C3), WP-7 (an automatic mode for confirmations),
WP-8 (small things left from that mode) and WP-9 (where the time goes). Numbers are not reused.

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

WP-9 was built as proposed, with the proposals taken for its three points after the owner's
"after that" of 2026-11-21: the extension gives three numbers with each answer (how long the
command ran, waited for its turn, and waited for the user); the report is in `browser_status`
with `diagnostics: true` and in the server's log at `debug`, with no file and no new tool; and
the extension's part is not split into worker and page. What the report cannot tell is in
[docs/tools.md](docs/tools.md#where-the-time-went): the model from the agent's program, and the
extension from the page.

## WP-10: Disconnecting an agent ends its authorizations

Asked for by the owner on 2026-11-21: "i can disconnect agent but then his authorization is still
active, that should also be removed with disconnect". Goal: **Disconnect** next to an agent takes
away what that agent was given, not only its connection.

### What happens today

Read from the source on 2026-11-21 (`disconnectClient` and `allowClient` in `background.ts`).

- **Disconnect** puts the agent's id on the list of agents that are refused, closes its
  connection with code 4403 and cancels what it was doing. Its sessions are not touched: they
  stay in the popup, with their site, their access level and the agent as owner, marked "(not
  connected)".
- **Allow again** takes the id off that list and looks for servers at once. The agent connects
  and has its sessions back as they were, without a click on any tab.
- The end-to-end suite asserts exactly that: in "the user can disconnect one agent; the other
  keeps working", the agent reads its tab again after it was allowed back.
- The documentation says the same: "cuts that agent off from every tab until you allow it again"
  ([user guide](docs/user-guide.md#8-stopping)), "it stays out until allowed again"
  ([security](docs/security.md#agents)).

So while an agent is disconnected nothing reaches its tabs. What the owner noticed is the other
half: the authorizations stand, and one click on "Allow again" brings all of them back.

### Proposal

1. Disconnect ends every session the agent owns, the way **Revoke** ends one (`endSession`): what
   runs is cancelled, the notice in the page goes, what was allowed in the automatic mode is
   forgotten, and the activity list says so.
2. The agent stays refused until allowed again, as today. Allowing gives back the connection and
   nothing else: each tab is authorized again by a click on it.
3. The activity line says how many sessions ended with the agent.

### Decisions for the owner

1. Sessions no agent has taken up yet ("not yet claimed"). Proposal: they stay; they were given
   to no agent.
2. An agent that goes away by itself, because its IDE was closed or its server restarted, gets
   its sessions back today, and a step end to end asserts it. Proposal: unchanged. Only the
   user's Disconnect ends sessions.
3. Whether the button should say what it does when the agent has tabs ("Disconnect and revoke 2
   tabs"), or stay "Disconnect" with the activity line telling it afterwards (proposal).

### Tasks and acceptance

Per the task map, "Change sessions, pairing or the connection": the flow in `background.ts`,
`test/background.test.ts` for it, and the step end to end, which changes: after Disconnect the
agent's sessions are gone from the popup and from the other agent's view, and after "Allow again"
the agent is connected, `browser_status` lists no session, and a command on the old session id
is refused. Then the user guide (section 8), the Agents section of `docs/security.md` and its
table if the property is newly tested, and the pictures of the popup if one of them shows a
disconnected agent. No tool's text changes.

## WP-11: The notice in the page

Asked for by the owner on 2026-11-21: "the notification on the bottom disapears to quickly we
shoul let it slowly fade and allow them to stack maybe we should think redesign for notification
shown on the bottom of the page". Goal: the user can follow in the page what the agent did, not
only catch what it does at this moment.

### What is there today

Read from the source on 2026-11-21 (`showIndicator` in `content.ts`; `setIndicator` and
`hideIndicatorSoon` in `background.ts`; the wording from `activityLabel` in `policy.ts`).

- One pill, fixed at the bottom right of the page, in a closed shadow root: a green dot, one
  line of text and a **Pause** button.
- It holds one line: "Agent: " and what runs ("Agent: Reading page"). A new command replaces the
  text. What a command ended with is not shown; the popup's activity list has that.
- It is taken away 2.5 seconds after a command ended, at once and without a transition. A
  command that starts within those 2.5 seconds keeps it.
- After a pause with its own button it reads "Agent paused", and stays until the next command or
  until the session ends or is suspended.
- It is removed before a screenshot is taken, so that it is never in the picture, and is not part
  of what a snapshot or an extract returns. It can be switched off under *Settings*.

Not measured: how long a line is readable in practice. The owner's word is that it is too short.

### Proposal

1. **Fade.** A line stays for a few seconds after its command ended and then fades out, instead
   of being cut off. Without motion where the system asks for less (`prefers-reduced-motion`).
2. **Stack.** The last few lines are shown one above the other, the newest at the bottom, each
   fading by itself. The line of what runs now keeps the dot and **Pause**; a line of what ended
   says so in the wording the activity list uses ("Read page", or "Clicking element (needs Write
   access)" for one that was refused).
3. **Redesign.** Open; see the decisions. The smallest form of it is points 1 and 2 with the
   pill's look kept.

What a change must keep, whatever it looks like:

- Only the generic wording leaves the worker for the page: nothing of the page's content and no
  entered text, as in the activity list.
- The closed shadow root, and Pause only on a click the user really made. A page script must
  stay unable to read the notice or to operate it; a step end to end asserts that.
- Not in a screenshot, a snapshot or an extract. With a fade, a line that is still fading is
  removed at once before a capture.
- Best effort: the notice never injects anything and never holds up a command.

### Decisions for the owner

1. How long a line stays and how long it fades. Proposal: 4 seconds, then 1 second of fading.
2. How many lines stack. Proposal: three.
3. Whether a line of what ended also says how it ended: done, refused, failed. Proposal: yes,
   with the mark and the short note the activity list gives it, and never the error's own text.
4. How far the redesign goes: the same pill stacked (proposal), or a new look and place. One
   thing a redesign could add: saying in the page that the agent waits for the user's answer in
   the popup. Today only the toolbar badge (`?`) says that.
5. Whether the Settings switch stays one switch for the whole notice (proposal).

### Tasks and acceptance

Per the task map: `content.ts` for the notice, a pure function for which lines show and when
each goes, with its test under jsdom, `background.ts` for when a line is sent (start, and end
with the outcome), and `policy.ts` only if the wording changes. End to end: the two existing
indicator steps keep passing, and a new one shows that a line outlasts its command, that two
commands in a row give two lines, and that a screenshot taken meanwhile has none of them. Then
`docs/images/indicator.png` regenerated and looked at, and the user guide (section 4). No
tool's text changes.

## WP-12: A goblin that acts out what the agent does

Asked for by the owner on 2026-11-21, as a fun feature: "when action is done like scrolling down
wonder if can have little goblin that is doing action on the page like animation". Goal: the
user sees in the page what kind of thing the agent just did, shown by a small figure and not
only said in a line of text.

### What is there today

Read from the source on 2026-11-21.

- The only thing TabGoblin draws in a page is the pill of WP-11: one line of text, no picture
  and no motion (`showIndicator` in `content.ts`).
- The worker tells the page the text of that line and nothing else. The page part does not learn
  which action runs, in which direction a scroll goes, or which element is clicked; it gets the
  command itself separately, in `content.ts`, and answers it.
- The goblin exists as one drawing, `chrome-extension/icons/goblin.svg`: a face of ten shapes
  with ears, eyes, a mouth and a tooth. The toolbar icons are rendered from it, and the popup
  shows the same face. It has no body, arms or legs, and nothing in it moves.

### Proposal

1. A small goblin beside the notice of WP-11, in the same closed shadow root. It plays one short
   animation per kind of action, a second or two long: pulling the page up or down for a scroll,
   pointing for a click, writing for entered text, reading for a snapshot or an extract,
   running for a navigation, waiting for a wait.
2. Which animation plays follows from the action's name, and for a scroll from its direction:
   the same generic facts the activity list already shows. Nothing of the page.
3. Drawn as inline SVG and moved with CSS only: no library, no image loaded from the network,
   no script evaluation.
4. Still where the system asks for less motion (`prefers-reduced-motion`): the goblin then shows
   a pose and does not move.

What a change must keep is what WP-11 lists for the notice: only generic facts reach the page,
the closed shadow root, nothing of it in a screenshot, a snapshot or an extract, and never a
command held up by an animation. One more for this package: the goblin takes no click and no
key, so it cannot be in the user's or the agent's way.

### Decisions for the owner

1. Where the goblin is. Beside the notice, at the bottom of the page (proposal), or at the place
   of the action: next to the element that is clicked, at the edge the page scrolls towards.
   The second is more fun, and more work: it needs the element's position, it must not cover
   what the user reads, and it shows a page script where and when the agent acts. A page script
   sees the click itself anyway, but not today an element that we add beside it.
2. Whether it comes with WP-11 or after it. Proposal: after; it sits in the notice that WP-11
   reshapes.
3. A switch of its own under *Settings*, or the indicator's switch for both (proposal: its own,
   since some will want the line and not the figure).
4. Who draws the goblin, and how much of it. The face that exists can act by itself: look
   down for a scroll, blink for a click, move its ears while it waits. That is the smallest
   form, and needs no new drawing. Pulling, pointing and writing need a body with arms, drawn
   in parts that can move.

### Tasks and acceptance

Per the task map, as for WP-11: `content.ts` for the figure and its animations, a pure function
from an action to its animation with a test, `background.ts` for sending the kind of action with
the line. A check in `test/agnostic.test.ts` terms: no library name comes in. End to end: a
scroll shows the goblin with the scroll's animation and a click another; it is gone from a
screenshot taken meanwhile; a page script can neither read nor operate it; switched off, it
does not appear. Then pictures for the user guide, each one opened and looked at. No tool's
text changes.

## WP-13: A panel for the server

Asked for by the owner on 2026-11-21: "have mcp server start up small panel ui, i think the we
should have headless and ui one were we can see metrics sessions logs etc and have options stop
and kill the server, disconnect agents, etc". Goal: a server can be looked at and stopped from
a small window of its own; without that window it runs as it does today.

### What is there today

Read from the source on 2026-11-21 (`McpMain.java`, `Log.java`, `Timings.java`,
`WebSocketBridge.java`).

- A server has no window. The agent starts it and talks to it over stdin and stdout; stdout
  carries the MCP messages and nothing else. Its options are `--port`, `--token-file`,
  `--extension-origin`, `--show-token`, `--rotate-token` and `--help`, and the `BCMCP_*`
  variables.
- **One server is one agent.** Each agent starts its own server process, on its own port. A
  server knows its own id, name and port, whether the extension is connected, and the sessions
  the extension reports for this agent. It knows nothing of the other agents; only the
  extension sees them all, and its popup is where they are listed and disconnected.
- **Metrics.** Where the time of the last tool calls went (`Timings.java`), read through
  `browser_status` with `diagnostics: true`. Nothing else is counted.
- **Logs.** Lines on stderr, at the level of `BCMCP_LOG`: ids, actions, durations, outcomes and
  error codes; never page content, entered text or the token. They are not kept: where they go
  is up to the agent's program.
- **Stopping.** A server ends when its agent closes stdin. Otherwise the user finds it by its
  port and ends the process ([user guide](docs/user-guide.md#8-stopping)).

### Proposal

1. **Two ways to run, headless as the default.** Agents, CI and machines without a display
   start the server as today. The panel comes with an option (`--panel`, `BCMCP_PANEL=1`), and
   a server that is asked for it where no display exists says so in its log and runs without.
2. **A small desktop window of the server's own process**, built with what the JDK brings
   (Swing): no new dependency and, unlike a page served on localhost, no new port that a
   website could reach.
3. **What it shows**, all of it what this server already holds: the agent's name and id, the
   port, whether the extension is connected and since when; the sessions with their site,
   access level and state; the report of where the time went; and the last few hundred log
   lines, kept in memory for the window.
4. **What it can do:** stop the server in the orderly way, as if the agent had closed it; kill
   it, for one that hangs; and disconnect the extension from this server, which is this agent's
   connection.

### What it cannot do as proposed

- Show or disconnect **other** agents: they are other processes. One window for all servers
  needs either a program of its own that finds them on the port range, as the extension does,
  or a channel between servers; neither exists. The popup stays the place for all agents.
- Keep an agent out. A server that is stopped is usually started again by its agent's program,
  and a connection that is closed is found again by the extension's next scan. Only the popup's
  **Disconnect** keeps an agent out (see WP-10).
- Widen anything. The panel reads and stops; it authorizes no tab and changes no access level.
  Those stay with the popup, where the user's click on the tab is.

### Decisions for the owner

1. One window per server (proposal), or one panel for all servers on the machine. The second is
   what "disconnect agents" suggests, and is a larger package: see above.
2. Desktop window (proposal) or a page on localhost. A page needs the guards the WebSocket has:
   loopback only, the token, the check of the origin.
3. How the panel is asked for when the agent's program starts the server: the option in the
   agent's MCP configuration (proposal), a file the server reads, or a tray icon that every
   server shows and that opens the window.
4. Whether addresses of pages belong in it. `browser_status` shows the agent the address of
   each session's page; the log deliberately has none. Proposal: the site only, as in the popup.
5. What "kill" does that "stop" does not. Proposal: stop cancels what runs and ends in the
   orderly way; kill ends the process at once, and what was in the browser has an unknown
   outcome, which the agent is told as for a lost connection.

### Tasks and acceptance

Per the task map, "Change MCP behaviour of the server" and "Change build wiring": the option in
`McpMain.java`, a class for the window that reads through the same objects as the status tool,
a buffer for the log lines in `Log.java`, and nothing on stdout. Tests: the option is parsed and
refused cleanly without a display; the buffer keeps only what the log may carry; `mvn verify`
still passes `McpConformanceIT` on the built jar, headless. By hand, and said so: the window
itself, on Windows; stop and kill with an agent connected, and what the agent is told. Then the
user guide (running, stopping), `docs/security.md` for what the window shows and can do, and
pictures of it, each one opened and looked at. No tool's text changes.

## WP-14: Nothing personal in the repository

Asked for by the owner on 2026-11-21, as important: "do sanitation, make sure there is nothing in
repo that gives away personal info". Goal: whoever gets the repository learns nothing about its
owner or the owner's machine that the owner did not mean to give.

### Done on 2026-11-22

On the owner's "do wp-14", with the proposal taken for each point that had one. The values
found are not repeated here.

- **The examples.** The folder of the owner's checkout is out of the four configuration
  examples (`README.md`, `docs/installation.md` twice, `docs/user-guide.md`). They say
  `<folder>`, and a sentence beside them says what to write there.
- **The pictures.** All thirteen in `docs/images` were opened. They show the popup, the notice
  in a demo page and Chrome's extensions page with TabGoblin alone: loopback addresses, the
  names of the two test agents, ports, and no folder, account or other extension. None of the
  seventeen PNG files that are tracked holds anything besides its picture (no text chunk).
- **The check.** `docs/agents/check-personal.mjs` fails on a home directory, on a mail address
  outside the example domains and on a link to an agent's session, in the files git tracks or
  would take. It says where and what kind, and not the text. It has tests, a job in CI
  ("Nothing personal") and its command in the
  [runbook](docs/agents/runbook.md#check-that-nothing-personal-is-in-the-files).
- **The rule.** `AGENTS.md` and the conventions in `docs/development.md` say that nothing
  personal goes into a file or a commit message, and that a commit message has no link to a
  session.
- **The searches of 2026-11-21 were run again**, with `git grep` on the tracked files and with
  `git log` on the messages and on every line a commit ever added: nothing besides what is
  listed below. Not found, as before: a home directory, a user name or a machine name, a
  pairing token, a mail address other than test addresses on example domains. The long
  hexadecimal strings are the shared test vector of the pairing and a test token.

### What is still there

In the files, left on purpose until the owner says otherwise:

- **The name of the GitHub account**, twice: in the CI badge of `README.md` and in the clone
  address of `docs/installation.md`. Both are the repository's own address.
- **A holder** in the copyright line of `LICENSE`. A licence needs one.
- **The extension's public key** (`key` in `chrome-extension/manifest.json`). It fixes the
  extension's id, which the end-to-end suite and the documentation use. Not personal; it is
  what makes every build the same extension.
- **The owner's words and the owner's machine** in `TODO.md` and `docs/agents`. Requests are
  quoted as they were written, and the state page and the validation log say what ran where:
  Windows, and which tools were logged in or running. No name, address or folder is among it.

In the history, 61 commits on 2026-11-22, none of them touched:

- **Every commit carries its author's name and mail address**: one address, under two names.
- **48 commit messages end with a link to the session that made them** (`Claude-Session:`),
  besides the `Co-Authored-By:` line.

Not searched: what GitHub keeps besides the repository (the account's profile, the logs of the
CI runs), and the checkouts on the owner's machine outside the tracked files.

### What remains, and is the owner's

1. **The address of commits from now on.** A commit made today still carries the address the
   history has: it comes from the owner's git settings (`user.email`), which a session does not
   change. GitHub gives an account an address that gives nothing away, and can refuse a push
   that carries another.
2. **The history.** A name and an address in a commit, and a link in its message, can be taken
   out only by writing the history anew: every commit gets a new id, the branch is pushed by
   force, and every other checkout is void. Proposal: before the repository is made public,
   and not sooner as long as it is private.

### Decisions for the owner

1. The account's name and the holder in `LICENSE`: stay (as it is now), or go.
2. The history: written anew now, written anew before the repository is made public
   (proposal), or left.
3. Whether the check also reads commit messages. Today it does not: the 48 messages in the
   history would fail it until the history is written anew.
4. The agents' pages (`TODO.md`, `docs/agents`): public with the rest (as it is now), or kept
   out of a repository that is made public.

### Acceptance for what remains

If the history is written anew: the count of commits is the same, no commit carries the old
address or a link to a session, and the owner has pushed. No tool's text changes.

## WP-15: An easy install

Asked for by the owner on 2026-11-21: "add wp 15 for easy install", and what easy means, in the
owner's words: "we have simple way of installing it getting it running so user can use it".
Goal: from nothing to a working TabGoblin in a few simple steps, without building anything.

### What it takes today

Read from [docs/installation.md](docs/installation.md), the runbook and the source on
2026-11-21.

- **Five things to have first:** a JDK 21, Maven, Node 24, Chrome 120 and Git. Then a clone, two
  builds, and seven steps. The page says to allow about ten minutes; how long it takes a new
  user was never measured.
- **The extension is loaded unpacked**, with Chrome's developer mode on. A managed browser
  forbids that.
- **The extension's id is fixed** by the `key` in `chrome-extension/manifest.json`, and the
  server accepts connections from that id only (`DEFAULT_EXTENSION_ORIGIN` in `McpMain.java`;
  `--extension-origin` names another, or `any`).
- **The agent is told an absolute path** to a jar inside the checkout, and needs `java` on its
  path.
- **Pairing** is a 64-character token, printed by `--show-token` in a terminal and pasted into
  the popup. Once; it is kept in the user's home folder.
- **Updating** is pulling and building both parts again. Server and extension must be of the
  same protocol version, and the popup says so when they are not.
- **Nothing is published.** The repository is private; CI builds and tests and keeps nothing;
  the runbook says there is no release procedure and no published artifact.
- The sample output on the installation page is from an earlier build (52 tests; today 64).

### Proposal

Three steps, none of which builds anything, and then it runs.

1. **Add the extension to Chrome**, from the Chrome Web Store: one click, no developer mode. To
   check before anything is built on it: the store gives an extension an id of its own and does
   not take the `key` of the manifest. If so, the server accepts two ids, the store's and the
   one of a build from source, and nothing else.
2. **Add the server to the agent**: one line in the agent's MCP settings, or one command where
   the agent has one, with no checkout and no path into it. For that the server is published,
   as a release that CI builds. Three ways to get to the one line, to choose from: a download
   with the Java runtime inside; a native program; a command that fetches the server and starts
   it, the way most MCP servers are installed.
3. **Pair**, once, and shorter than today: a short code in place of the 64 characters, or the
   popup offering to pair with the server it has found, which the user confirms.

Then the check the page has today: authorize a tab, and ask the agent for `browser_status`.

Updating becomes as simple: the extension updates by itself from the store, the server by the
same line. The installation page is written anew around these steps; the build from source
stays as its second half, for those who work on TabGoblin.

Order: WP-14, then the repository in the open, then a release procedure, then the store.

### Decisions for the owner

1. The repository in the open, and when. Everything else here follows it.
2. The Web Store: a developer account, its fee, and the texts and pictures of the listing.
3. How the server is delivered. Proposal: a download with the Java runtime inside first, since
   it asks for nothing on the machine, and the one command on top of it.
4. Pairing: a short code, a confirmation in the popup, or as it is.
5. Versions. An extension from the store updates by itself; a server does not. Either the
   server is told to update, or the two stay compatible over more than one version. Today they
   must match exactly in the protocol version.
6. What is promised to work. The browser suites have run in Chrome on Windows only.

### Tasks and acceptance

Per the task map: "Change build wiring or CI" for the release, "Change sessions, pairing or the
connection" for the second id and for pairing, the runbook for the release procedure, and
`docs/installation.md` with the root `README.md`. Tests: the server accepts the two ids and
refuses a third (`WebSocketBridgeTest`); the suites end to end keep running against the build
from source. Acceptance, measured and written down: on a machine with Chrome and an agent, and
no JDK, Maven, Node or Git, a person follows the page to a `browser_status` that says
connected; the steps and the minutes are counted. A tool's text changes only where it names
the way to pair.
