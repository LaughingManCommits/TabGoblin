# TODO

## Overview

Nineteen packages are listed. The newest is WP-31, the CLI and MCP as two adapters side by side over one core, and a switch in the settings file that turns MCP off, asked for on 2026-11-27: a design, not started. Before it, WP-30, the documentation gone over for the CLI and MCP as two interfaces of one browser bridge, asked for and built on 2026-11-25. Before that, WP-29, the tools as commands of a terminal for an agent without MCP, asked for and built on 2026-11-25. Four were asked for by the owner on 2026-11-21: WP-12, a goblin that
acts out what the agent does; WP-13, a panel for the server; WP-14, nothing personal in the
repository, which the owner called important; and WP-15, an easy install. Two on 2026-11-22:
WP-16, a page that shows how TabGoblin differs from other tools; and WP-17, a new token at every
start, and nothing connected on an old one, which was built and then cut back to what helps
with a pairing: see below. Of WP-14 the files and the check were done on
2026-11-22; the history remains, and is the owner's. WP-13 was built on 2026-11-22 on the
branch `server-panel` and waits for the owner's review; its entry says what is there and what
is open. WP-12 and WP-16 are not started, and each waits for the owner's word on its points.
WP-15 was built and committed on 2026-11-23, on the branch `easy-install`: a download, a setup
command and a release by a tag. Its first release, 0.2.0, is out since the same day.
WP-18, filed on 2026-11-22, is the aftercare of that panel and a pass over the
documentation. WP-19, filed on the same day on the owner's word, is one server for all agents
in place of one for each; it is built and merged. WP-20, filed on
the same day, is a list of blocked sites in the server; the owner decided its points, and it is
built and merged. WP-21, filed on the same day, is what the first test on the public repository
showed: three faults, mended and merged. WP-22, filed on the same day, is a skill for the
tools for each of three agents, and a command of the jar that installs one; it is built and
merged. WP-23, on 2026-11-23, was the documentation's pictures as SVG in place of PNG, for a
proxy at the owner's work that holds back PNG files from GitHub. It was built, and the owner
dropped it the same day: the proxy holds back SVG as well. Nothing of it is in the repository,
and its number is not used again. WP-17 was gone over on 2026-11-23, decided by the owner and
built that day on the branch `new-token-each-start`; the owner then had the new token at
every start taken out again and kept what helps when the browser has to be paired. WP-24,
filed on 2026-11-23, is a performance test between the extension and the server; its points
are decided, and it is not started: the owner said not yet. WP-25, filed the same day, is
release notes that say what changed; it is to come with the next release, and is not started.
WP-26, filed the same day, is access that ends by itself when it is not used; it is not
started. WP-27, asked for on 2026-11-24, is security hardening and developer features in
fourteen points, in three priorities; its entry has the gap analysis, the backlog, what was
built and what was left. WP-28, filed on 2026-11-24, is the ports that Windows can keep back, so
that no server has one; what it says is mended, and the way around it was built on
2026-11-24 with the entry's own proposals taken for its decisions: it has not run on a machine
whose ports are kept back. New work gets the next number, WP-32.

Done and not listed: WP-1 (the server follows the MCP standard; see
[docs/mcp-conformance.md](docs/mcp-conformance.md)), WP-2 (text with line breaks, typed key by
key), WP-3 (consent that cannot be given by accident: issues A1, A2 and B6), WP-4 (a prompt that says
what is asked: issues B1 to B5 and D1 to D3), WP-5 (a no stands, and
one request waits at a time: issues A3 and A4), WP-6 (Enter as a full submission, with tighter
exceptions: issues C1, C2 and C3), WP-7 (an automatic mode for confirmations),
WP-8 (small things left from that mode), WP-9 (where the time goes), WP-10 (disconnecting an
agent ends its sessions) and WP-11 (the notice in the page: a bar, and pills of what ended).
Numbers are not reused.

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
[docs/security-model.md](docs/security-model.md) and in the developer guide.

WP-9 was built as proposed, with the proposals taken for its three points after the owner's
"after that" of 2026-11-21: the extension gives three numbers with each answer (how long the
command ran, waited for its turn, and waited for the user); the report is in `browser_status`
with `diagnostics: true` and in the server's log at `debug`, with no file and no new tool; and
the extension's part is not split into worker and page. What the report cannot tell is in
[docs/tool-reference.md](docs/tool-reference.md#where-the-time-went): the model from the agent's program, and the
extension from the page.

WP-10 was asked for by the owner on 2026-11-21 ("i can disconnect agent but then his
authorization is still active, that should also be removed with disconnect") and built on
2026-11-22, on the owner's "go with that build it", as proposed in its first two decisions:
Disconnect ends the agent's sessions the way Revoke ends one, "Allow again" gives back the
connection and no tab, a session that no agent has taken up stays, and an agent that goes away
by itself keeps its sessions. Three things differ from what was filed. The agent's row says
how many tabs it has, so that what a Disconnect ends can be read before the click; the filing
had only the activity line afterwards. The sessions that end are those the agent owns and
those a former self of the same name left behind, which it could have taken up with its next
command. And a reason was found that the filing did not have: a session whose owner is not
connected passes to an agent of the same name, so the tab of a disconnected agent could be
taken by a second instance of the same program. That was run against the source as it was: the
second agent got the page. What Disconnect still does not do is hold over a new start of the
agent's server; that is in WP-17. The rule is in [docs/security-model.md](docs/security-model.md#agent-identity-and-authentication).

WP-11 was asked for by the owner on 2026-11-21 ("the notification on the bottom disapears to
quickly we shoul let it slowly fade and allow them to stack maybe we should think redesign for
notification shown on the bottom of the page") and built on 2026-11-22. Its fourth decision, how
far the redesign goes, was the owner's on that day: "maybe the pillbox should be infobox with
pills in it?", and then "okay go with that build it". The other four went by their proposals: a
line stays four seconds and fades for one, three lines at most, a line says how its command
ended, and the one switch under Settings is for all of it.

What is in the page now is two panes in the bottom corner. A bar says what the agent is at (what
runs, idle, paused, or that the user's answer is needed in the popup) and has Pause; it is one
row high and stays where it is. Above it float pills, one for each command that just ended, the
newest at the bottom. It came to that in three steps, each on the owner's word:

- **The sketch** had the row with Pause on top of a box. Built, it went to the bottom: a box in
  the bottom corner grows upwards, and Pause on top would have moved with every line.
- **The look.** While the first form was being looked at: "we want modern, fun and something
  that fits the theme of our app". So it has the popup's colours and round marks, and the
  goblin of the popup's header in the bar, which shows the state: it glows green in pulses
  while the agent works, amber when the user is asked, and has its eyes closed when paused.
  That was the face of the extension's icon then (`icons/goblin.svg`, since replaced by the pixel
  goblin of `art/mascot.ts`), and no new drawing. It uses part of what WP-12 lists
  as its smallest form; acting out each action is still WP-12. It first stood on a dark tile
  with a ring around it, as in the popup's header; on the owner's word, "the little goblin
  should be have no background and border", it stands bare, and what lights up is its outline.
- **Two panes.** On the size of it: "i wonder if we should split it 2 planes?", and "was hoping
  you tell me if that is better?". It is: drawn both ways and set side by side, the bar stays
  one size where the box grew, and with three pills about a third less of the page is covered.
  So nothing is drawn around bar and pills, and it is not the "infobox with pills in it" of
  the first word any more. The limit of three pills, which the owner asked after ("like 5
  maybe, we dont want it be oversized"), stayed at three.

Three more things changed, read from the source as it was and not run on it. The page keeps the
time of a line, not the worker, which may be asleep by then. A pause is said in the notice
however it was made; before, only the page's own button said "Agent paused", and that stayed
after the session was resumed in the popup. And a session that is only paused has no notice;
before, the pill stayed after a pause by its own button. How it works is in
[docs/architecture.md](docs/architecture.md#the-notice-in-the-page).

## WP-12: A goblin that acts out what the agent does

Asked for by the owner on 2026-11-21, as a fun feature: "when action is done like scrolling down
wonder if can have little goblin that is doing action on the page like animation". Goal: the
user sees in the page what kind of thing the agent just did, shown by a small figure and not
only said in a line of text.

### What is there today

Read from the source on 2026-11-21, and brought up to WP-11 on 2026-11-22.

- The only thing TabGoblin draws in a page is the notice of WP-11: a bar with the goblin's face
  and a row of text, and pills of text above it (`notice.ts`).
- The face shows the state and nothing of the action: a glow that pulses and a blink now and
  then while anything runs, an amber glow and a look upwards when the user is asked, closed
  eyes when paused. It is the same whether the agent reads, clicks or scrolls.
- The worker tells the page a state, the words for what runs and a line for what ended, and
  nothing else (`setNotice` in `background.ts`). The page part does not learn which action
  runs, in which direction a scroll goes, or which element is clicked; it gets the command
  itself separately, in `content.ts`, and answers it.
- The goblin is drawn in pixels in `art/goblin.ts`: the toolbar icons, the popup's logo, the
  notice's face and the server panel's sprite sheet, a goblin in full, 22 pixels high, with eight
  animations (idle, working, reading, walking, sleeping, confused, waiting, guarding). The notice
  shows the face only, and the state through its glow and its eyes.

### Proposal

1. The goblin in the notice's bar, in the same closed shadow root. It plays one short
   animation per kind of action, a second or two long: pulling the page up or down for a scroll,
   pointing for a click, writing for entered text, reading for a snapshot or an extract,
   running for a navigation, waiting for a wait.
2. Which animation plays follows from the action's name, and for a scroll from its direction:
   the same generic facts the activity list already shows. Nothing of the page.
3. Drawn as inline SVG and moved with CSS only: no library, no image loaded from the network,
   no script evaluation.
4. Still where the system asks for less motion (`prefers-reduced-motion`): the goblin then shows
   a pose and does not move.

What a change must keep is what holds for the notice: only generic facts reach the page, the
closed shadow root, nothing of it in a screenshot, a snapshot or an extract, and never a
command held up by an animation. One more for this package: the goblin takes no click and no
key, so it cannot be in the user's or the agent's way.

### Decisions for the owner

1. Where the goblin is. In the notice's bar, where it is now (proposal), or at the place of
   the action: next to the element that is clicked, at the edge the page scrolls towards.
   The second is more fun, and more work: it needs the element's position, it must not cover
   what the user reads, and it shows a page script where and when the agent acts. A page script
   sees the click itself anyway, but not today an element that we add beside it.
2. Settled: it comes after WP-11, which is built. The bar it sits in is there.
3. A switch of its own under *Settings*, or the indicator's switch for both (proposal: its own,
   since some will want the line and not the figure).
4. Who draws the goblin, and how much of it. The face that exists can act by itself: look
   down for a scroll, blink for a click, move its ears while it waits. That is the smallest
   form, and needs no new drawing. Pulling, pointing and writing need a body with arms, drawn
   in parts that can move.

### Tasks and acceptance

Per the task map, "Change the notice in the page": `notice.ts` for the figure and its
animations, a pure function from an action to its animation with a test, `background.ts` for
sending the kind of action with the state. A check in `test/agnostic.test.ts` terms: no library name comes in. End to end: a
scroll shows the goblin with the scroll's animation and a click another; it is gone from a
screenshot taken meanwhile; a page script can neither read nor operate it; switched off, it
does not appear. Then pictures for the developer guide, each one opened and looked at. No tool's
text changes.

## WP-13: A panel for the server

Asked for by the owner on 2026-11-21: "have mcp server start up small panel ui, i think the we
should have headless and ui one were we can see metrics sessions logs etc and have options stop
and kill the server, disconnect agents, etc". Taken up on 2026-11-22 with "have option to run
headless server or with small sever admin screen showing the mentioned things", "make sure the
server pannel is modern and matches our style", and, of the first attempt in Swing, "you are
pro java developer that knows the latest tech". Goal: a server can be looked at and stopped
from a small window of its own; without that window it runs as it did.

**Built on 2026-11-22, on the branch `server-panel`. Not merged; it waits for the owner's
review.** What the user sees is in the [developer guide](docs/developer-guide.md#the-servers-panel),
the rules in [security-model.md](docs/security-model.md#the-servers-panel), the build in
[architecture.md](docs/architecture.md#the-servers-panel).

### What is there

- **Two ways to run.** Without an option a server has no window and loads nothing of one. With
  `--panel` or `BCMCP_PANEL=1` it shows one window, for its one agent. Without a display it
  says `panel not shown reason=no_display` and runs as without the option.
- **What the window shows:** the agent's name, id and port; whether the extension is connected,
  since when, or why not; the sessions with site, access level and state; where the time of the
  last calls went, as four bars; the server's last 300 log lines.
- **What it can do:** stop the server in order, kill the process, and switch the connection to
  the browser off and on. Stop and Kill take two clicks.
- **Its look** is the popup's: the same colours, cards, pills and switch, and the goblin bare as
  in the page's notice, with its eyes closed while the connection is switched off.

### Where it differs from what was filed

1. **JavaFX, not Swing.** The proposal was "what the JDK brings, no new dependency". The first
   attempt was Swing, painted by hand, and the owner turned it down. JavaFX gives a stylesheet
   and the popup's look. The price: a new dependency, a jar of 17.6 MB where it was 7.1 MB,
   native files unpacked into `.openjfx` in the home folder, and lines of JavaFX's and Java's
   own on standard error at the start.
2. **A switch, not a button, for the connection.** The filing said "disconnect the extension
   from this server". Closed once, the extension's next look for servers would undo it within
   half a minute. So the switch closes the connection and refuses the extension until it is
   switched on again, and the agent is told why. It is still no revocation: see below.
3. **A tool's text changed**, where the filing expected none: `browser_status` and the
   `NOT_CONNECTED` error say that the user switched the connection off, and where.
   `docs/tool-reference.md` has it, and the end-to-end suite was run.
4. **Two kinds of window.** Without a frame on Windows, in the system's frame elsewhere,
   because the frameless one drew nothing on Linux. The owner saw that before the session did.

### What it does not do

- Show or disconnect **other** agents: they are other processes. The popup stays the place for
  all agents. One panel for all servers would be a package of its own.
- Keep an agent out, or take its tabs. A stopped server is usually started again by its agent's
  program, with its connection switched on; and while the connection is off the agent's tabs
  stay authorized in the extension, as for any server that ends. Only the popup revokes and
  disconnects.
- Tell the popup why. A server that is switched off looks to the extension like one that does
  not run: the popup says *Disconnected: is the MCP server running?*. Saying "switched off in
  the server's window" there needs a new close code in the protocol, on both sides.
- Follow the system's light or dark setting. It is dark, as the popup is in its dark scheme.

### What was seen, and what was not

- **Windows 11, Java 21 and Java 26:** the built jar with its window. The controls were pressed
  in the real window through the system's accessibility interface: the switch, Stop (exit code
  0) and Kill (exit code 1). The taskbar's button was pictured alone: it shows the goblin.
- **With the real extension, on Windows:** switched off, the agent's tools say so and the
  extension is not let in, also not when the popup is opened; switched on, it was back by
  itself after 14 seconds with the agent's session, and a snapshot worked; Stop ended a server
  that a real MCP client held, with nothing but protocol on its standard output.
- **Linux:** Ubuntu 26.04 in the Linux subsystem of Windows, Java 21: the framed window with
  the whole panel was seen, and the server ended in order. Its buttons were not pressed there.
- **Not run:** macOS; any other Linux desktop; the panel in CI, whose runner has no display
  (six tests are skipped there); a screen reader, beyond reading what the window offers one;
  a screen that is scaled.

### Open, for the owner

1. **Whether the cost of JavaFX is right:** 10 MB more in the jar, files in `.openjfx`, and the
   warning lines on standard error. The lines go to the agent's log of the server, not to the
   agent.
2. **Whether the popup should say why** a server is switched off (a protocol change, see above).
3. **macOS and other Linux desktops.** They get the framed window. Someone with such a machine
   has to look once; the runbook says at what ("Look at the server's panel").
4. **The panel's tests in CI.** They need a display. A virtual one on the Linux runner would run
   them there; it was not tried, because it cannot be tried on this machine.
5. **A name on the taskbar.** The button shows the goblin and the window's title; the name the
   system gives the program is Java's, because Java is the program. A name of its own needs a
   launcher, which is WP-15's subject.

## WP-14: Nothing personal in the repository

Asked for by the owner on 2026-11-21, as important: "do sanitation, make sure there is nothing in
repo that gives away personal info". Goal: whoever gets the repository learns nothing about its
owner or the owner's machine that the owner did not mean to give.

### Done on 2026-11-22

On the owner's "do wp-14", with the proposal taken for each point that had one. The values
found are not repeated here.

- **The examples.** The folder of the owner's checkout is out of the four configuration
  examples (`README.md`, `docs/installation.md` twice, `docs/developer-guide.md`). They say
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

- **Five things to have first:** a JDK 25 (21 when this was read; 25 since 2026-11-25), Maven, Node 24, Chrome 120 and Git. Then a clone, two
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
- **Nothing is published.** The repository is public since 2026-11-22; CI builds and tests and keeps nothing;
  the runbook says there is no release procedure and no published artifact.
- The sample output on the installation page is from an earlier build (52 tests; today 64).

### Decided since it was filed

- **No Chrome Web Store, ever: TabGoblin's releases are its own.** The owner on 2026-11-23: "i
  think we would always be our own releases never on chrome web store". What follows from it:
  the extension is loaded unpacked, with Chrome's developer mode on, for good; a browser whose
  administrator forbids that cannot use TabGoblin; and the extension does not update by
  itself. What falls away: a second id for the extension, and a server that has to work with
  an extension of another version, since both parts come from one release. Step 1 of the
  proposal below, and decisions 2 and 5, are overtaken by it.
- **The repository is in the open** since 2026-11-22 (decision 1).
- **Pairing stays as it is:** the token is pasted once. A new token at every start was built
  and taken out again on 2026-11-23 (WP-17); a short code or a confirmation in the popup was
  not asked for (decision 4).

Measured on 2026-11-23, on Windows with Java 26, for a download with the Java runtime inside
(decision 3): the jar needs the modules `java.base`, `java.desktop`, `java.net.http`,
`java.sql`, `jdk.jfr` and `jdk.unsupported`; a runtime of those, made with `jlink`, is 50 MB
unpacked and 33 MB as a zip; the jar's `--help` runs on it. Not tried on it: a server, and its
window.

### What was built

On 2026-11-23, on the owner's word ("okay lets build wp 15 with the cd release"), on the branch
`easy-install`, which is made from `new-token-each-start`. What was run is in the validation
log.

- **A download for each system** (`release/bundle.sh`): one folder, `tabgoblin`, with a Java
  runtime of the six modules the jar uses, the jar, the extension, a command `tabgoblin` that
  starts the server for a person, a page that says what to do, and the licence. It is about
  50 MB packed, a zip for Windows and a tar for Linux and macOS, and it unpacks over an older
  one, so that an update changes no path. The script refuses to pack a server that does not
  start on the runtime it made.
- **`--setup <agent>`** (`Setup.java`), for `claude-code`, `codex` and `copilot`. It puts
  the agent's skill in its place and prints what is left, with the server's own paths: the
  line that tells the agent about the server, which is the agent's own command for that; the
  extension's folder, with the clicks that load it; and the command for the server's window,
  to pair. It runs no other program and writes nothing but the skill. The help of a download
  says that `tabgoblin` stands for the long command.
- **A release by a tag** (`.github/workflows/release.yml`): the suites, then the three
  downloads, each made on its own system, then the release, with checksums and GitHub's
  attestation of where each download was built. Only the last job may write, and it runs only
  for a tag. Started by hand the workflow publishes nothing.
- **The pages:** the installation guide begins with the download, and the build from source is
  its second half; the runbook says how a release is made.

### What is open

- **The first release is out: 0.2.0, on 2026-11-23,** by the owner's tag. The workflow had run
  once before, started by hand, which publishes nothing; that run cancelled the CI run for the
  merge it came after, and the two are in groups of their own since. For the tag every job
  passed and the last one published: three downloads, their checksums, and GitHub's
  attestation, of which the one for the Windows download was asked for and is there.
- **Nobody has used a download of the release.** They are as GitHub's machines made them. The
  ones that were used were made on this machine and in its Linux subsystem.
- **The download for macOS was made on GitHub's machine and never used.** The script that makes
  it starts the server on the runtime it made, and that passed there. The one for Linux was
  made and used in Ubuntu under Windows' Linux subsystem, without Java: setup and the server
  as an agent starts it. Its window was not seen there; the server's log said it had shown it.
- **On Linux a server started in a terminal with `--panel` ended when the terminal was
  closed,** in the one try there was, with a terminal made up for it. The command says that
  the server stays until it is stopped. That is the one server's start (WP-19), which had not
  been tried on Linux; a start that the terminal's end does not reach would mend it.
- **The lines for Codex and Copilot were not run.** They are each agent's own command as its
  documentation had it on 2026-11-23; neither agent is on this machine. The one for Claude
  Code was run, in Command Prompt and in PowerShell, against a configuration made for the
  purpose, and what it stored was read.
- **Setup prints the line and does not run it.** The user pastes one line. Running the agent's
  command for them was left out: it is another program's, and could not be tried for two of
  the three.
- **The downloads are not signed.** Windows and macOS may warn. Signing takes certificates,
  which cost money every year.
- **A download carries JavaFX for all three systems,** as the jar does: a few megabytes more
  than each needs.
- **The acceptance as it was filed has not been done:** a person, on a machine with Chrome and
  an agent and nothing else, following the page to a status that says connected, with the
  steps and the minutes counted. It needs a release to download.

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

## WP-16: A page that shows how TabGoblin differs from other tools

Asked for by the owner on 2026-11-22: "we need to make doc showing how we differ from the
competition and how they work vs us with nice diagrams". Goal: a reader who knows another way
of putting an agent into a browser sees, in pictures, how that way works, how TabGoblin works,
and what follows from the difference, for it and against it.

### What is there today

Read from the documentation on 2026-11-22.

- **No page names another tool.** The one product of that kind in the documentation is the
  driver of our own end-to-end suite.
- **What sets TabGoblin apart is said in pieces, and never against anything:** the first
  paragraph and "Limits worth knowing" of the root `README.md`, and "What is never exposed"
  and "What remains your risk" in [docs/security-model.md](docs/security-model.md).
- **Diagrams.** Seven, all in Mermaid: the idea in one picture in `docs/README.md`, and six in
  `docs/architecture.md`. The root `README.md` has the idea as two lines of text. The thirteen
  pictures in `docs/images` are captures of the popup and of Chrome; none is drawn.
- **Nothing is known here about the other tools.** No session has read their documentation or
  tried one of them for this. Where this package names a product, it is from memory.

### Proposal

1. **A page of its own, `docs/comparison.md`**, with a line in the table of `docs/README.md`
   and of the root `README.md`.
2. **Compared by the way of working, with products as examples.** What an agent can reach
   follows from how a tool gets at the browser, and several products share each way. The ways,
   as far as memory goes; which product belongs where is the package's first task:
   - a browser of the tool's own, started for the agent and driven through an automation
     protocol (Playwright MCP, tools built on Puppeteer, browser-use);
   - the user's browser, entered through its debugger (Chrome DevTools MCP, extensions that
     ask for the `debugger` permission);
   - an agent that is part of the browser, or of an extension by the maker of the model
     (Claude in Chrome, browsers with an agent built in);
   - a browser in the cloud, to which the logins have to be brought;
   - the whole screen: pictures of the desktop, and the mouse and the keyboard.
3. **The same questions put to each way**, in one table: whose browser it is and where the
   logins are; how access is given and how far it goes (a tab and its site, a site, the
   browser, the machine); what the agent can get at (the page's text, script, cookies and
   storage, the network, other tabs); what happens before something is sent; what the user
   sees and can stop; which agents can use it; what it takes to install.
4. **What the others can do and TabGoblin cannot**, in the same table and with the same
   weight: hover, script, the network, frames from another site, editors drawn on a canvas,
   running without a person at the browser. A tool that starts its own browser is the right
   one for testing a site in CI; TabGoblin is not, and the page says so.
5. **Pictures.** One per way of working, all drawn alike: the same shapes in the same places
   for the agent, the tool, the browser, the logins and the user, so that the eye finds what
   differs. One picture of reach alone: what lies around a page (its script, the cookies, the
   other tabs, the network, the machine), and how far each way goes into it. And one
   sequence: something is sent with TabGoblin, and with a tool that drives the debugger.
6. **Each statement has its source.** About another product: a link to its documentation or
   its source, and the date it was read. For an extension, the permissions in its manifest:
   they can be read and are nobody's opinion. About TabGoblin: a link to the page that owns the
   fact, and no second wording of it.
7. **No verdict, and no adjectives.** The page says what each way reaches and what it is for.

### Decisions for the owner

1. Which products, and how many. Proposal: one or two per way of working, and the two or three
   nearest to TabGoblin (an extension in the user's own browser, for any agent) in more depth.
2. Products by name, or the ways of working without names. Proposal: by name. A page without
   names cannot be checked and helps nobody choose; a page with names goes out of date, and
   its makers may object to it.
3. Read only, or also tried. Proposal: each product read, and the nearest two or three
   installed and given one small task on the demo sites. The page says of each which it was.
4. How the pictures are made. In Mermaid, as the rest of the documentation: text in the page,
   drawn by GitHub, nothing to keep; but two diagrams cannot be held to one layout, and each
   looks as the viewer draws it. Or drawn (SVG in `docs/images`, in the popup's colours, for
   light and dark): they look as they are meant to, and each has to be made, opened and kept
   by hand. Proposal: drawn for the ways of working and for the reach, since "nice" is the
   owner's word and the comparison lives from pictures that are alike; Mermaid for the
   sequence.
5. How much of it goes into the root `README.md`. Proposal: the one picture that sets the ways
   side by side, and a link.
6. How it is kept true. The other tools change and do not tell us. Proposal: the page carries
   the date of its last reading, and is read again before a release; the listing in the store
   (WP-15) takes its words from it.

### Tasks and acceptance

Per the task map, "Edit documentation": the page, its lines in the two tables, and the
pictures. No product code changes and no tool's text. Acceptance: every statement about
another product has its source and its date, and the page says of each product whether it was
tried or read; every statement about TabGoblin links to the page that owns it; what TabGoblin
cannot do is in the table, the list of "Limits worth knowing" at least; each picture was
opened and looked at, in both colour schemes if it is drawn, and the validation log says so;
the link check and the check for what is personal pass.

## WP-17: A new token at every start, and nothing connected on an old one

Asked for by the owner on 2026-11-22: "our tokens should be random on start up, i started up
the mcp and agent conencted automatically, any connected agent without the latest token should
be killed". Goal as it was filed: a server that starts is not connected to the browser on
something that was agreed before.

**That is not what the repository has.** On 2026-11-23 it was built as the owner decided it
that day, and committed on the branch `new-token-each-start`. Asked then whether it had been a
necessary feature, the session said no, and the owner decided: "lets only have the parts that
are usefull and remove the rest". The token is made once and kept, as before. What stays is
what helps when the browser has to be paired.

### Why the new token went

- **It kept out less than it seemed to.** Since there is one server for all agents (WP-19), the
  process an agent starts proves itself to the server with the token, so the token has to be
  in its file. A program that runs as the user can read it there and become an agent of the
  running server, with a new token at every start as without.
- **What it did buy:** nothing was connected after a start without the user. Before, and now
  again, a server that starts has the browser within half a minute, and its agents the tabs
  that were authorized for their names.
- **What it cost:** a pairing at every start of a server. A server ends with its last agent,
  so with one agent at a time that was once for every session of the agent.

### What stays

- **The agent is told what is missing, and where the token is** (`BrowserService`
  `pairingHelp`). Three cases are told apart: no browser has come, which as a rule is one on
  its way; a browser came with a token that is not the server's, so pairing is what is
  missing; the browser is paired with the server and has only not found this agent yet. The
  token is in the server's window where that is open, and printed by `--show-token` otherwise.
  The server's instructions and the three skills say that no tool pairs the browser.
- **The server notes a browser that came with another token** (`ExtensionConnection.turnedAway`),
  which is how it tells the first two cases apart.
- **The window comes up by itself** when a tool finds no browser and one came with another
  token (`Hub.unpaired`): once until something is paired. That is after `--rotate-token`, or
  after a token that was mistyped. `--no-panel`, or `BCMCP_PANEL=0`, keeps it from that for an
  agent. Where no browser has come, no window comes.
- **The window says the step at its top** while it is so: *Pair the browser with this server*,
  with a button **Copy token**, and its status line says *Not paired: the browser has another
  token*.
- **The popup** says *Paste the server's current token to connect*, with an amber dot, in the
  place of *Pairing failed: check the token* with a red one; and the text over its field names
  the server's window beside the command.
- **A pairing on an older token counts for nothing while it is still open**
  (`WebSocketBridge.pairedOnCurrentToken`). The suite found that after a rotation an agent was
  told that the browser was paired with the server, because another agent's pairing had not
  ended yet.
- **The token's file is replaced in one step** at a rotation, and a process that runs reads
  it again for three seconds after a change, whatever the file's time says.

### What was built and taken out

A new token at every start of the one server, and of a process that serves its agent alone;
`--show-token` saying whether its token was a running server's; a window that came up whenever
a tool found no browser; and the suites' scripts reading the token after the start. It is all
in the branch's first commit, for whoever wants to see how it was done; the second takes it
out.

### What is open

- **The goal as it was filed is not met,** by the owner's choice: a server that starts is
  connected on the pairing that was made before.
- **Seen on Windows only,** with Java 21. On Linux and macOS the window that comes up by
  itself was not tried.
- **The window that comes up by itself was seen with a made-up browser,** a program that
  answers the server's challenge with a proof that is none. Not with the owner's own extension
  after a real rotation.
- **One click with a code to compare,** in the place of the pasting, was put to the owner and
  not chosen.

## WP-18: Aftercare of the server's panel, and the documentation gone over

Asked for by the owner on 2026-11-22, when WP-13 was done: "make aftercare wp, after you commit
this do docs scan make sure it is up to date concise, usser/ dev friendly, also uses seperation
of responsibilities on it with references/links to correct doc".

### Part 1: the documentation

Every page that is not a record (`README.md`, `AGENTS.md`, `docs/*.md`, the runbook) is read
against four questions:

1. **Up to date.** Each claim against its source: a command against `package.json`, `pom.xml`
   or `ci.yml`; a path against the tree; a count against a run; a text of a tool or of the popup
   against the code that writes it.
2. **Concise.** What a reader does not need is taken out. Records of how something came about
   belong in git and in the validation log, not in a page that explains.
3. **For its reader.** The user's pages say what to do and what happens, without the code's
   names; the developer's pages say where things are and how to check a change.
4. **One home for each fact.** The table in `AGENTS.md` ("Memory") and the row "Edit
   documentation" in its task map say which page owns what. A fact that stands in two pages
   stays in its owner and becomes a link in the other.

Acceptance: the link check and the personal check pass; what was changed, and what was looked
at and left, is in the validation log. The backlog, the state page and the validation log are
records and are not rewritten.

**Done on 2026-11-22, on the branch `docs-pass`.** Every page was read whole and
its claims checked against the source. What came of it, in short; the list is in the
validation log:

- **Out of date, and set right:** a count of tests and three sizes in the installation guide
  that were several versions old; "fourteen editor libraries" in four places, where the lab has
  thirteen and two plain controls; three error codes that the tool reference did not have;
  three source files that the file map did not have; two close codes missing from the protocol
  reference; and the panel's new tests, which had the version written into them and so broke
  the runbook's check for a change of version.
- **Said once now, with links from the rest:** how to install and pair (the installation
  guide; the developer guide had both again), what the popup's messages mean (the developer guide; the
  installation guide had three of them again), and the server's panel, which stood at length in
  four pages: what the user sees in the developer guide, the rules in the security model, the build
  in the architecture, the commands in the runbook.
- **New:** a section in `docs/development.md`, "Documentation", that says which page owns what.
  `AGENTS.md` points to it instead of listing the owners itself.
- **Added for the panel,** on the owner's question whether it needs better documentation: what
  a user needs before the window is there and when it puzzles. A jar from before the panel does
  not start at all with `--panel`; what each sentence of the line with the dot means; several
  agents, several windows; two rows of troubleshooting.
- **Looked at and left:** the developer guide and the security model both state the rules for
  submissions, one for the user and one as rules; they now point to each other and were not
  merged. Two sentences in `docs/editors.md` speak of "the fourteen" editors; what they count
  could not be checked without a run of the lab.

### Part 2: what the panel left behind

The decisions are the owner's and stand under WP-13, "Open, for the owner": the cost of JavaFX,
whether the popup says why a server is switched off, macOS and other Linux desktops, the
panel's tests in CI, a name on the taskbar. What needs no decision:

- **Kill with an agent connected was not tried.** Kill was pressed on a server that had no
  client and no extension. What the agent's program reports when its server is gone at once,
  and what the popup shows then, is not known. Stop was run with both.
- **A server that cannot take its first port prints a stack trace** of the socket library
  before it takes the next one, and JavaFX prints one of its own when it cannot start. Neither
  is the server's line, and both go to the agent's log of the server.
- **The window takes the keyboard when it appears.** No button in it has it then; the user's
  typing still stops going where it went.
- **On Linux the title in the panel is not bold** and the frame shows the system's own icon,
  as far as the one picture from the Linux subsystem tells. Not looked into.
- **A tool call made right after the connection was switched off may wait ten seconds** before
  it is told so. Read in the source, not timed: the wait that is meant for a server that has
  just started is taken once more when the extension is gone, also when it is the panel that
  keeps it out (`awaitExtension` in `BrowserService.java`).
- **GitHub's zoom buttons lie over the bottom right corner of a diagram that spans the column.**
  The picture in the two READMEs has two empty places there now. In the architecture page the
  buttons cover the lower "Content script" box of "A command, end to end"; the upper one is
  whole. The other four diagrams of that page were not all looked at.
- **The six tests of the window do not run in CI.** A virtual display on the Linux runner
  would run them and, with them, the jar's native part for Linux; it cannot be tried on this
  machine.

### Part 3: asked for by the owner after the merge

All on 2026-11-22, on the branch `aftercare`, in two commits made on the owner's word. What
was run is in the validation log.

- **A simple command for the panel, and a page of commands.** "how do i run with single command
  the server with ui panel", then "we need like cheat sheet md with all the important
  commands". The developer guide's section on the panel opens with the command now, and
  `docs/cheatsheet.md` has the important commands on one line each, with the page that
  explains each under its table.
- **The panel can copy the pairing token.** "the server pannel should means to copy access
  token to clipboard". A **Copy** button puts the token on the clipboard and nowhere else: not
  into the window, not into the log. It leaves the clipboard after a minute, and at Stop, if it
  is still what the clipboard holds.
- **The panel keeps its controls in view.** Found while the button was added, and not asked
  for: with six tabs or more, the list of sessions pushed the switch, Stop and Kill out of the
  bottom of the window, where they could not be reached. Now three sessions are listed and the
  rest counted, the window is as high as the screen allows, and the part between the header
  and the controls scrolls where even that is not enough.
- **The extension shows what is so.** "the extension should refresh and not show stale state,
  check if it still connected to a server". Two things were stale. The badge said `ON` for an
  authorized tab whether or not an agent was connected; it says `OFF` now when nobody is there
  to act. And a server that hangs stayed "connected" for good, because the heartbeat's answers
  were never counted; now two in a row without an answer take the server for gone, within a
  minute, and it is found again when it answers.

- **A server that is started again has its tabs at once.** "the server when stoped with
  connection client session, and started again does not session as active in sever tab but the
  tab goblin shows it it has active connection to server", and then: should the server say "i
  have session" when the heartbeat is back? On the branch `restart-keeps-tabs`. A server makes
  a new id at each start, and its tabs come back to it by its agent's name alone. It learned
  that name only with the agent's first tool call, and a server started by hand never had one:
  so the popup showed the tab, and the panel of the new server did not. Now the name is taken
  from the agent's opening message, a server started by hand is called *Started by hand*, and
  the extension makes the tabs the new server's own the moment it pairs, or its name arrives,
  and tells it so. It is the extension that says so, not the server: a tab's authorization is the user's grant and is
  kept there, and a server that could claim one would be a way around the user's click.

- **A server started by hand says that no agent's work shows in it.** Seen with the owner on
  2026-11-22, while a session walked through GitHub with the tools: a server started by hand
  with its panel stood beside the agent's own server, which ran without a window. The owner
  authorized a tab for the first, which no agent can use, and then watched its panel for the
  agent's sessions and times: "claude is conencted to the mcp via the mcp yet it still showed
  no session at the server", "still where the time went metrics is empty". Nothing was wrong,
  and nothing on the screen said so. Then: "do the fixes please". On the branch
  `by-hand-panel`. The panel of such a server now has a box under its status line that says no
  agent talks to it and where an agent's tabs and tool calls are; its two cards say *for this
  server* and *no agent talks to this server*, and under a tab that is authorized for it,
  that no agent can use the tab. The developer guide and the cheat sheet say that the command is
  for looking at the panel, and how to have it on the agent's server.
- **A disconnected agent's server is left alone.** Seen in the same panel: its log filled with
  `extension connected` and `extension disconnected … code=4403`, a pair every few seconds,
  and its status line changed for a moment each time. The extension cannot know whose server
  holds a port before it connects, so it paired with the server each time it looked at the
  ports, and closed it again. Now a server says who it is in its first message, and the
  extension turns a disconnected one away on that, before it has proven anything: the server
  never counts it as connected and logs nothing. What a server says there gives it nothing;
  that still takes the id in its proven answer. It needs both parts: with an older extension
  or an older server it is as it was.
- **The picture in the two READMEs has more room at its right edge.** Read through TabGoblin on
  GitHub: the one empty place did not keep the zoom buttons off "Every other tab". There are
  two now. Not seen on GitHub yet: that needs a push.
- **The card of the times is called Metrics.** The owner, of the panel: "where the time went"
  "should be names metrics". Its line at the side says what the metrics are of: *time of the
  last 12 calls*. The status tool's report keeps its heading.
- **The panel's log has a line for every tool call.** The owner: "log also does not show any of
  the actions take by the agent session". Two causes. The window looked at was the server
  started by hand, as above. And in the agent's own window the log had the calls that failed
  and none that worked: a call that went through is written at debug only. It is kept for the
  panel now whatever the level, and standard error is as it was.
- **A tab that is open to any agent is marked.** Found in the walk: the owner had authorized a
  tab for any agent, every server lists such a tab, and the panel of the server started by
  hand said under it that no agent can use it; the session then used it. The line speaks of
  that server's own tabs only now, and an open tab carries *any agent* in every panel.

Left open by this part:

- **One server for all agents** is what the owner then asked for ("we should only allow one active
  server"). It is filed as WP-19, and replaces the first of WP-13's decisions, whether one
  panel should show every server. Until it is built, a server started by hand stays a server
  of its own that no agent uses.
- The popup still counts a server that was started by hand as an agent: *1 agent connected*,
  and it offers the server when a tab is authorized. The extension knows a server by the name
  it gives itself and no more.
- The box of a server started by hand was read in the real window on Windows, not connected to
  a browser: the owner's extension was connected to no server at the time. Connected, and
  with a tab, it was drawn and tested, not seen in the real window.
- The copy button was pressed in the real window on Windows only. The clipboard on Linux and
  macOS was not tried.
- `OFF` is a new word on the toolbar, chosen by the session: it is the owner's to keep or to
  change. The popup's own wording is unchanged.
- While a server hangs, its agent's tool calls get no answer, as before: the extension notices,
  the agent's program does not.
- A screen lower than the window was drawn, not seen: no machine with one was at hand.

## WP-19: One server, and every agent connected to it

Asked for by the owner on 2026-11-22, at the end of a session in which a server started by
hand was taken, five times, for the server the agent uses: "we should only allow one active
server"; before that, "when you start it up have it kill the prior session then this one will
take over"; and, asked which rule is meant: "sessions says you can have multiple agents
connected, and each agent can have access only to one own tab not same tab as others, only one
agent may work on a given tab, only one instance of the server may be started". Goal: there is
one TabGoblin server on the machine. Agents connect to it, each has its own tabs, and its one
window shows what all of them do.

### What happens today

Read from the source and seen on 2026-11-22.

- **A tab already has one agent.** A session is one tab, one website, one access level and one
  owning agent, and every command is checked against the owner (`canUse` and `resolveSession`
  in `policy.ts`). A tab that the user authorized for any agent is the first agent's that uses
  it, and no other's after that. So three of the owner's four sentences say what is there.
- **The fourth is not so: there is a server for each agent.** Each agent's program starts the
  jar as a child of its own and talks to it through that child's input and output. Up to
  eight run at once, each on a port of its own, and the extension connects to each. "2 agents
  connected" in the popup is two server processes.
- **A server that a person starts in a terminal is one more,** with no agent, which nothing can
  use. Its window shows no agent's tabs, times or calls; since the third part of WP-18 it
  says so.
- **An agent cannot be handed to another server.** It talks through the pipes of the process
  it started. When that process ends, the agent has no tools until its program starts the
  server anew, which in Claude Code is the user's Reconnect under `/mcp`. Seen at 15:56: the
  owner ended the session's server and started one by hand, and the session's tools were
  gone. Seen at 15:59, after the Reconnect: the new server had its tab at once, by the
  agent's name, and its window showed the tab, the times and the calls.

### What the request runs into

- **How a server is started is the agent's program's to say:** a command, run as a child, one
  for each agent. So "one instance" cannot mean that a second start is refused, or that it
  ends the first: either way an agent is left without its tools. The process an agent starts
  has to stay, and pass its agent's messages on to the one server.
- **The one server belongs to no agent.** Today a server ends when its agent closes it, so
  that no process is left holding a port. One server for all ends when the last agent has
  gone, or by the user's Stop, and an agent's program may end the process it started without
  asking.
- **Processes that talk to each other are a new way in.** Today the only connection is the
  extension's, on the loopback address, with a proof of the pairing token in both directions.
  A connector's has to be held to the same.

### Proposal

1. **The first process that starts is the server; every later one is a connector.** A process
   looks for a running server before it becomes one. If it finds one, it proves that it knows
   the pairing token, is given the same proof, and from then on only passes its agent's
   messages back and forth. If it finds none, it is the server, and serves its own agent as
   today.
2. **Inside the one server an agent is what a server is today:** an id, a name, a port to the
   extension, its sessions, its times. The extension and its protocol stay as they are; it
   sees one connection for each agent, as now. An agent's tabs are its own as before, and no
   tool tells an agent anything of another.
3. **One window, for the user:** every agent with its tabs and its metrics, and one log that
   names the agent in each line. Run by the user, the jar is the server if there is none; if
   there is one, it brings that server's window up and ends.
4. **When the server's process ends while agents are connected, a connector takes its place,**
   which is the owner's "this one will take over". The agents' tabs come back to them by
   their names, as after a restart today. A call that was running has an unknown outcome and
   is reported so.

### Decisions for the owner

On 2026-11-22 the owner answered the first and said of the rest: "okay do your
recommendations". So the proposals stand, the click on a tab among them, which is built first
and in today's window.

1. Whether an agent may have several tabs, as today, or one. Decided by the owner on
   2026-11-22: several, as today ("a agent can own multiple tabs"). A tab has one agent, and
   an agent reaches no tab of another.
2. What the one window shows of several agents. Everything of each (proposal): it is the
   user's window, and the popup shows every agent's tabs and activity already. The owner's
   idea for it, of 2026-11-22: "make the session clickable if you click that then see metrics
   and logs for that session, if dont click we see, the average metrics and logs all agents".
   What that needs, read from the source: the times of a call are kept without its session
   (`Timings.Call`), and a call that names no session is logged as `session=-`; both have to
   carry the session the call ran in. With nothing chosen, the shares are those of all calls
   together, not a mean of each agent's percents, which would count an agent with two calls
   like one with two hundred. Lines that belong to no session, such as a connection made or
   lost, show with nothing chosen. The list has to reach every tab then; today it lists
   three. The first step does not wait for one server: in today's window, a click on one of
   the agent's tabs.
3. When the server ends. With its last agent, or by Stop (proposal). Or it stays until the
   user stops it, which leaves a process behind when every agent has gone.
4. What the jar does when the user runs it while a server runs. It brings the window up and ends
   (proposal). Or it is refused with a line that says which server runs.
5. Ports. One for each agent inside the one server, as today (proposal: the extension does
   not change). Or one port for all, which is a new version of the protocol.
6. How it goes together with WP-17, a new secret at every start. With one server "the latest
   token" has one meaning, and WP-17's first decision falls away; its others stay.

### What was built

On 2026-11-22, on the branch `one-server`; merged by the owner the same day. What was run is
in the validation log. The proposals stand, with what building them showed:

- **The click on a tab came first,** in the window as it was: every tab is in the list, which
  scrolls, a click shows that tab's metrics and log lines, and the corner of the card says
  which is chosen. The extension says in each answer which session a command ran in. With
  several agents an agent's heading can be clicked the same way.
- **The server is a process of its own.** The proposal had the first process that starts be
  the server. Built so, the server would end with the agent whose program happened to start
  first. So that agent's process starts the server as a separate process and is a pipe to it
  like every other; the server ends three seconds after its last agent has gone.
- **A process that cannot have the server serves its agent alone,** as before, and says so in
  its log: where another program holds the server's port, or the server cannot be started.
- **The jar that the user runs with `--panel`** brings the window up and returns. Without an
  option it is what an agent starts, and waits; only the option decides, so that an agent's
  program that runs the jar in a terminal of its own is not turned away.
- **A server started by hand is no agent any more.** The name *Started by hand*, its tab that
  nobody could use and its panel that showed nobody's work, which the third part of WP-18
  explained in the panel, are gone: a server without an agent has no port to the extension,
  and its window says that it waits for one.
- **Kill is no stop.** Agents that still run start the server anew at once, which is what
  they do when its process is gone. Stop tells them that it is a stop. The window's line
  under the buttons does not say so yet.
- **Found by the first run with real processes:** six servers that the conformance check had
  started were still running forty minutes later. That check ends each process at once, and
  the server took a broken connection for none at all. It now takes it for the agent's going.

Not built: nothing tells the user in the window that the jar on disk is newer than the server
that runs; an agent that connects after a rebuild is served by the server that was there.

### Tasks and acceptance

A package of its own size: it changes what the architecture page calls a server. The server:
finding a running server and becoming a connector (`McpMain.java`), the connection between
them and its proof (`Pairing.java`, a counterpart to `WebSocketBridge.java`), several agents
in one process (`BrowserService`, `WebSocketBridge`, `Timings` and `Log` are one for a process
today), the ending and the taking over, and the window for several agents (`PanelModel`,
`Panel`). The extension: nothing, if the ports stay. Tests: a second start is a connector and
its agent's tools work; two agents through one server each reach their own tab and not the
other's; a connector without the token is refused, and so is one from another machine's
address; the server's process is ended and a connector takes over, with the tabs back by name
and the running call reported as unknown; run by the user with a server running, the jar ends
and the window is up. End to end: the suite's two agents through one server, and every step
that ends or restarts a server. Then `docs/architecture.md` (processes, how a server ends),
`docs/security-model.md` (the local connection, the panel's rules, what remains your risk), the user
guide's sections on stopping and on the panel, the cheat sheet, the diagram in the two
READMEs, and the conformance check, which starts the jar as an agent does.

## WP-20: Blocked sites

Asked for by the owner on 2026-11-22: "deny URL domain basically we can created blocked sites,
this should be properties, any action tried on site is blocked by the mcp server". Goal: the
user names sites that no agent may work on. Whatever a tab is authorized for, an action on such
a site is refused by the server before it reaches the browser.

### What happens today

Read from the source on 2026-11-22 (`BrowserService.java`, `Agent.java`; `summarize`,
`addOrigin` and `resolveSession` in the extension).

- **There is only yes, by a click.** A site is open to an agent when the user authorizes a
  tab on it, for that exact origin. Nothing says "never this site": a click on the wrong tab,
  or on *Add this site* for a session that left its site, is all it takes.
- **The server knows no website,** by the constraint in `AGENTS.md`, and decides nothing about
  one. It passes the address of a navigation on as it was given, checked for length only. The
  extension decides whether the address is on the session's site.
- **The server does know where each session is:** the extension reports every session with its
  origin, the other origins the user added to it, and the address of its page. And every tool
  call but the status goes out through one method (`BrowserService.send`).
- **Settings are options and variables,** given where the agent's program starts its process.
  There is no settings file. The pairing token is the only thing kept, in the folder
  `.browser-context-mcp` of the user's home folder.
- **One server serves every agent** since WP-19, and runs for as long as one of them does.

### What the request runs into

- **The constraint against websites in product code.** A list of blocked sites is the user's
  data and not code: the server ships none and names none. Its tests use the example domains.
- **A block that only the server knows is a trap of the kind WP-19 removed.** The popup would
  show a tab as authorized, nothing would work in it, and the reason would stand in an agent's
  answer. The popup has to say that a site is blocked, where the user authorizes it.
- **The server's view of a session is the last report.** A tab cannot leave its site without
  the session being suspended, so the report is good for the site. It is not for a session
  that spans several sites, of which the tab may be on any: such a session has to count as
  blocked when any of its sites is.
- **A server that runs for hours has to see a changed list** without being stopped, which
  would cost every agent its tools.
- **A file the user can edit, an agent that runs commands as the user can edit.** The list is a
  guard against a wrong click and a wandering agent, and none against an agent with a shell.
  That belongs in `docs/security-model.md`, under what remains your risk, in so many words.
- **A screenshot shows what is on the screen.** A page on a site that is not blocked may embed
  a frame from one that is; its text is not read, since frames of another site never are, and
  its pixels are in the picture. That is so today for every frame of another site.

### Proposal

1. **A properties file beside the pairing token:** `tabgoblin.properties`, with one key,
   `blocked.sites`, and the domains after it, separated by commas. `--settings <path>` and
   `BCMCP_SETTINGS` name another file. It is read when the server starts and again when it has
   changed, before the next command. A file that is not there blocks nothing.
2. **An entry is a domain, and blocks it with every subdomain,** on every port and with every
   scheme: `example.org` blocks `example.org` and `mail.example.org`, and not
   `notexample.org`. What a user may paste is taken down to that: a scheme, a path, a port, a
   leading `*.` or dot, capitals. A name in another script is compared in its encoded form.
3. **The server refuses before anything is sent:** every action in a session whose site, one
   of whose added sites, or whose page is blocked; and a navigation to a blocked address. The
   agent is told `SITE_BLOCKED`, with the one site it tried and that only the user can change
   it. It is never told the list. The refusal is logged as a scope violation.
4. **The extension is told the list, and refuses as well.** It knows where a tab is at the
   moment of a command, which the server knows from a report. And the popup says it: on a
   blocked site there is no Authorize but the sentence that the site is blocked in the server's
   settings, and a session that is on one is marked.
5. **The server's window says what is blocked and where it is set:** how many sites, the path
   of the file, and a tab that is blocked marked as such. Nothing is edited there.
6. **A file that is there and cannot be read blocks everything,** and the window and every
   answer say why. A guard that is silently off is worse than tools that are off.

What it is not: a list of the sites an agent may use, which stays the user's click on a tab; a
list for one agent apart from another; or a filter on what a page that is not blocked links to
or embeds.

### Decisions for the owner

Decided by the owner on 2026-11-22, from options that were put with a recommendation: the
first three as proposed, and to build it on a branch of its own once WP-19 is committed. The
fourth and the fifth were not asked and go by their proposals.

1. What an entry blocks. The domain with its subdomains (proposal). Or that host exactly, which
   needs an entry for each subdomain. Or patterns with `*`, which say more and are easier to
   get wrong.
2. Where the block shows. In the server's refusal, the popup and the window (proposal). Or in
   the server's refusal only, as the request says it: then the popup offers a tab that will
   not work.
3. What an unreadable file does. Everything is refused until it is mended (proposal). Or the
   list as it last was stays in force, and none at a start.
4. What happens to a session on a site that is blocked later. Its actions are refused and it
   stays, so that taking the site off the list brings it back (proposal). Or it ends.
5. Whether a second file for the whole machine, which the user's own file cannot loosen, is
   wanted now: for a machine that someone else sets up. Proposal: not now; the two lists
   would add up, so it can come later without changing this one.

### What was built

On 2026-11-22, on the branch `blocked-sites` (made from `one-server`); merged by the owner the
same day. What was run is in the validation log. The proposals stand, with what building them
showed:

- **The file's default place is beside the token that is in use,** and not always in the home
  folder: a server started with a token file of its own, as every test and every look script
  starts one, does not read another setup's list.
- **The window names the sites, and has a button.** The proposal had it show how many sites are
  blocked and the file's path, and edit nothing. Built, the line names the first two and counts
  the rest; all of them, and the path, are under the pointer; and **Edit** opens the file in
  the system's text editor, making it first, with the key explained in comments, if there is
  none. The window still edits nothing itself. Reason: a path alone leaves the user to find
  the file and to know the key. It is more than was first decided; asked on 2026-11-22, the
  owner kept it. The window is 40 pixels higher for the row, so that the log keeps its lines.
- **The popup names the host and the entry.** On a tab of a subdomain it says that this host
  is blocked because its domain is on the list. As first built it named the tab's address with
  scheme and port, which is in no list.
- **The list goes to the extension after its first word as a paired one,** and not right
  behind the pairing answer. An extension from before this message, still checking the
  server's proof, closes the connection on a message it does not know: sent at once, the list
  would have kept a new server from ever pairing with an old extension. Found by reading the
  worker, not by a run.
- **A session the server has not heard of is asked for** before a command for it goes out. The
  server's picture of the sessions is the extension's last report; without this, what the
  server refuses would have hung, for a moment, on an extension that refuses as well.
- **A changed list reaches the extension ahead of the next command.** The first end-to-end run
  showed the extension refusing for up to a second after a site was taken off the list: the
  server had read the file and the extension had not been told yet.
- **The server reads an address as the browser does** where the two could differ: a backslash
  for a slash, a scheme without slashes, more slashes than two.
- **A mistake in the file names itself** in the window: the entry that is no domain, in a
  sentence of two lines. An agent is told only that the file cannot be read.

Not built, as proposed: a second file for the whole machine. Not tried: **Edit** on Linux and
on macOS; this server with an extension from before this change, with real parts.

### Tasks and acceptance

A new error code and a new line in a tool's text: `docs/tool-reference.md` and the suite end to end.
The server: the file and its re-reading (`Settings`, beside `Pairing`), the rule as a pure
function of a host and a list, the check in `BrowserService.send` and in `navigate`, the list
to the extension after pairing (`Protocol.java`, `WebSocketBridge.java`), the window
(`PanelModel`, `Panel`). The extension: the same rule in `policy.ts`, held to the server's by
a shared list of cases as the two pairings are; the check in `background.ts` before a command
and before an authorization; the popup's sentence and mark. Tests: the rule's cases, among them
a look-alike domain, a subdomain, an address with a port, a name in another script and an
address that is a number; a command in a blocked session reaches no browser; a navigation to a
blocked address is refused before it is sent; a changed file is in force at the next command;
an unreadable file refuses everything; the agent's answer names the site it tried and no
other; the extension refuses what an older server would have let through. End to end, with the
demo sites: one of them blocked in a settings file, the agent's calls there refused, the popup
on that tab without Authorize, the other site working. Then `docs/security-model.md` (what an agent
can reach, what is verified, what remains your risk), the developer guide, the cheat sheet, the
help text, and the protocol reference.

## WP-21: What the first test on the public repository showed

On 2026-11-22 the owner made the repository public and asked for "basic smoke test using mcp
tabgoblin … for access explore only", in their own Chrome, on the repository's pages. Then they
showed a picture of the server's window and asked whether its metrics look good, and said: "do
the fixes please". The test went through: every tool of Explore worked, and what Explore must
refuse was refused. It showed three faults, none of which a suite had found.

### What was found

- **TabGoblin's own notice was in a screenshot the agent took.** In the owner's Chrome, in two
  of the two pictures taken about ten seconds after a page had loaded, and in none of three
  taken later. The security page said that a screenshot has nothing of the notice, and the
  suite checks it. Cause, shown on the build as it was: the page took the notice out and
  answered at once, and the picture was taken at once; but a browser draws a changed page a
  moment later, and later still while the page is busy, and a capture takes what was drawn
  last. With a page kept busy, as one is that has just loaded, 4 of 12 pictures had the notice
  in the suite's Chrome; on a quiet page none of 12, which is why the suite passed.
- **The window's metrics said little.** "Agent and its model 98%": every pause between two
  calls counted in full as the agent's time, also one of 346 seconds in which the agent was at
  something else. A model takes seconds where the browser takes milliseconds, so that bar is
  near 98% in any session, and a share does not say whether 2% is 20 milliseconds or 20
  seconds.
- **The window's log stood still and did not say so.** It had nine lines and ended before the
  test, with fifty calls counted beside it in Metrics. It holds while someone reads in it, as
  the developer guide says; it had been scrolled up. Tried in a real window: untouched, it follows,
  also while the window is put away. So the fault was the silence, not the holding.

### What was built

On the branch `smoke-fixes`, and committed there on the owner's word. What was run is in the
validation log.

- **The page answers that the notice is gone when it is out of the picture.** After it has begun
  three frames (`whenDrawn` in `notice.ts`); a page that is not shown answers at once, and one
  that has not drawn after a second and a half answers then. With that, none of 20 pictures of
  a busy page had the notice. The suite takes six pictures of a busy page now.
- **Each heap of the metrics has two numbers:** its share, and what a call typically takes in
  it, under *share* and *per call*. What the heap is, and its longest, is under the pointer.
  A pause of more than a minute counts as one minute, in the window and in the status tool's
  report, which says so in a line of its own when there was one. The window is 24 pixels
  higher for the line over the numbers.
- **A log that is held says so in its card's corner:** *held while you read*, and a button with
  the number of lines that have come since, which goes to the newest line.

### What is open

- **A screenshot of a tab whose window is covered or minimized** was not tried. The page draws
  nothing then and answers at once, so the picture is what the browser has; whether the notice
  can be in it is not known.
- **"Waiting for you" can read 7% beside 0 ms:** one call in four waited for the user, and a
  typical call does not. The longest is under the pointer. It is right and may puzzle.
- **CI has not run since run #14.** Runs #15 to #20 failed in three seconds each, with
  GitHub's message that the jobs were not started because of the account's billing. Whether the
  repository being public cures that is not known; nothing was re-run.
- **The repository's settings on GitHub,** read on 2026-11-22 through TabGoblin: public, no
  collaborators, no ruleset and no branch protection on `main`, workflows read-only, fork pull
  requests approved for first-time contributors only, secret scanning with push protection on,
  Dependabot and private vulnerability reporting off. Changing them is the owner's.

## WP-22: Skills for agents that use TabGoblin

Asked for by the owner on 2026-11-22: "can we make skills folder where can put claude skill and
codex and copilot skills to standards for using tabgoblin mcp making it easier for agents, if
it will add value?"

### What it adds, and what it costs

- **The server tells every agent about fifteen lines** when it connects, and each tool has its
  description. That is always there and has to stay short. What an agent then lacks is the
  longer part: how to read a long page without reading all of it, which access level to ask
  the user for, and what to do on each refusal. In the first test on the public repository the
  agent asked a snapshot for fewer lines than it gives, and used a ref from an earlier page, and
  read the answer off an error each time.
- **A skill is loaded only when a task calls for it,** so it can be longer. Claude Code, Codex
  and GitHub Copilot read the same open format, a folder with a `SKILL.md`
  ([agentskills.io](https://agentskills.io/specification)), each from a place of its own.
- **It is one more text that says what the tools do.** The tool reference owns that. A skill
  that drifts from it misleads an agent with nobody noticing.

### Decided

Put to the owner with a recommendation of one skill for all three agents. The owner chose
**three separate skills,** one for each agent, each with that agent's own extras, in the
knowledge that they are three texts to keep the same by hand.

### What was built

On the branch `agent-skills` (made from `smoke-fixes`), and committed there on the owner's
word.

- **`skills/claude-code`, `skills/codex`, `skills/copilot`** (under `skills/mcp` since 2026-11-25), each with a `tabgoblin/SKILL.md`,
  and `skills/README.md`, which says where each agent wants its skill. The head of each is its
  agent's own: how the tools are named there and what to ask the user for when they are
  missing; `when_to_use` for Claude Code; `agents/openai.yaml` for Codex; `argument-hint` for
  Copilot. From "Start with the status" on, the three are word for word the same.
- **A test, `SkillsTest`,** fails when one of the three has drifted from the others, when a
  skill names a tool the server does not have or leaves one out, when it names a code that the
  tool reference does not know, and when its front matter is not what the format asks for.
- **The installation guide** points to them, and no longer says that each agent starts a server
  of its own, which was so before WP-19.
- **The jar installs one,** added on the owner's word the same day, as the step that makes a
  user have the skill at all: `--install-skill claude-code`, `codex` or `copilot` puts that
  skill into the agent's folder below the user's home. The build takes the three into the jar
  (`Skills.java`). A skill that is there already and is not this one is left as it is and the
  command says so; `--replace` overwrites it, and touches no file that the skill does not
  have. A second commit on the branch, on the owner's word.

### What is open

- **None of the three has been loaded in its agent.** The places and the fields are from each
  agent's documentation as read on 2026-11-22; what an agent does with a skill was not tried.
- **How the server is added to Codex and to Copilot** could not be read from their
  documentation that day: the pages had moved. The skills and the installation guide say only
  what holds for any agent: a command, `java`, with `-jar` and the path.
- **No skill declares the server it needs.** Codex can take such a declaration in
  `agents/openai.yaml`; the one example that was read is for a server reached by address, not
  for one that is started as a program.
- **For one project nothing installs a skill.** The command puts it into the user's home, for
  every project; into a project the user copies the folder.

## WP-24: A performance test between the extension and the server

Asked for by the owner on 2026-11-23: "can you make performance test with metric between
extension and mcp server which use to bench and see if need to improve our code, create wp for
us, dont start yet". Goal: numbers that say where the time and the bytes of a tool call go
between the server and the extension, measured the same way every time, so that it can be
decided from them whether code has to be made faster, and seen afterwards whether it was.

Filed, and decided the same day. Nothing is built: the owner said not to start yet.

### What there is today

Read from the source on 2026-11-23 (`Timings.java`, `Protocol.java`, `background.ts`,
`interact.ts`, `e2e/run.mjs`).

- **The server says where the time of a call went** (WP-9): with the agent between two calls,
  in the server, waiting to send, on the way to the extension, in the tab's queue, in the
  extension and the page, and with the user. The extension gives its part with every answer:
  how long the command ran, how long it waited for its turn, how much of that was the user's.
  It is in `browser_status` with `diagnostics: true`, in the server's window, and
  `SHOW_TIMES=1` prints it for a run of the end-to-end suite.
- **Those are the times of whatever happened to run.** The example in the tool reference is
  from the suite: 3 ms in the extension and the page for a typical call, 1 ms on the way. The
  suite's pages are small, its agent is a script, and no run is like another.
- **There is no benchmark:** no fixed load, no page of a known size, no repeat, no numbers
  kept from one day to the next, and nothing that says when a change made a tool slower.
- **Not measured at all:** bytes, of a command, of an answer and of what the agent is given;
  the memory of the server and of the extension's worker; a start, from the agent's process to
  its first answer, with the server running and without; how long the extension takes to find
  a server, which it looks for every half minute; a big page; several agents at once.
- **Some of the time is waited on purpose.** After a click or a key the extension waits for the
  page to settle; after a scroll, 350 ms; before a screenshot, until the notice is out of the
  picture. They are there so that an answer says what is so. A benchmark shows them as a floor
  under some tools, not as slowness.

### Proposal

1. **A script beside the suite,** `e2e/bench.mjs`, with the suite's own parts: the built jar,
   real Chrome, the built extension, paired and authorized through the real popup. It is not
   part of `npm test`.
2. **Pages made for it** in the demo site, of known sizes: a hundred elements, a thousand, ten
   thousand and fifty thousand; a long text; a long table; a page with frames.
3. **Every tool, many times,** after some calls to warm up: the status, a snapshot in each of
   its forms, an extract in each of its forms, click, fill, key, scroll, navigate, wait and
   screenshot; and one loop as an agent works, snapshot, click, snapshot.
4. **What is written down for each tool and each size of page:**
   - the time of a call: the middle one, the 95th of a hundred, the longest;
   - where it went, from the server's own account: server, way, queue, extension and page;
   - bytes: of the command, of the answer on the socket, and of the text the agent gets;
   - calls a second, one after another, and with two, four and eight agents on tabs of their
     own;
   - memory: of the server's process before and after, and of the extension's worker;
   - a start: from the process to the first answer, with a server running and without, and
     until the extension is connected.
5. **A table on the screen and a file of numbers,** with the machine, the system, the Java and
   the Chrome they are from. One run is kept in the repository as the numbers to compare with,
   on a page that owns them; a run is compared with it by hand.
6. **Then a reading of it, before any code is changed:** the three slowest things, and for
   each whether it is a wait on purpose, the page's own work, or ours: the walk over the page,
   the writing and reading of the message, the queue, the second process between agent and
   server.

What it is not: a limit that fails a build. A machine of GitHub's is not the same from run to
run, and a limit that fails by chance is worse than none. And it makes nothing faster: that
is work of its own, once the numbers say where.

### Decided by the owner on 2026-11-23

1. **Which question first: a single call, on pages of growing size.** Several agents at once,
   a start and memory come after it, if at all.
2. **The script counts the bytes,** from outside. The server's account stays as it is, and so
   does every tool's text.
3. **It runs by hand, on one machine,** which is named with its numbers; those are what a later
   run is compared with. Not in CI.
4. **The waits on purpose are measured and shown apart, and none is changed here.** That was
   put to the owner as what would be done unless they said otherwise, and they did not.
5. **What is fast enough is decided after the first numbers,** by the owner, with the numbers
   at hand. So the package has two parts: the measuring, and then, once the owner has named
   the times to hold them against, the reading.

### Tasks and acceptance

Per the task map: "Something slow or hanging" for the server's account (`Timings.java`); the
suite's harness (`e2e/mcp-client.mjs`) and the demo site for the script and its pages; the
runbook for the command; and a page that owns the numbers, named in
[development.md](docs/development.md#documentation). Acceptance: one command prints the table;
run twice in a row, the middle times of each tool agree within a spread that is written down;
the numbers are in the repository with the machine they are from; the three slowest things are
named, each with its cause; no number and no file of the script has anything of a page's
content in it; and nothing in the product has changed, unless the second decision says so.

## WP-25: Release notes that say what changed

Asked for by the owner on 2026-11-23, after asking whether there are release notes: "Make wp
for that we can introduce it with the next release laters". Goal: someone who updates reads in
a release's notes what is new and what is different in that version.

Filed only. Nothing is built. It is wanted with the next release, not before.

### What there is today

- **Every release has notes, and they are the same but for the version.** The workflow fills
  `release/notes.md` in: which download is for which system, how to set it up and to update,
  how to check a download, and that none is signed. Read on release 0.2.0 on 2026-11-23: whole,
  with nothing left unfilled.
- **Nothing says what changed.** The repository has no changelog, and says so as a rule:
  "git history is the record of changes" (`AGENTS.md`, and the runbook under "Change the
  version").
- **GitHub's own notes would be empty.** They list the pull requests that were merged, and the
  owner merges branches as they are. What they would have is a link that compares two tags.
- **What a package did is written down, for those who work on TabGoblin:** in this file and in
  the validation log, at length and in their words. It is not what a user reads before an
  update.
- **Release 0.2.0 is the first,** and has nothing before it to differ from.

### Proposal

1. **One file, `CHANGELOG.md`, at the root,** with a section for each version, the newest
   first, written for the one who uses TabGoblin: what is new, what behaves differently, what
   was mended, and what to do when updating, where there is something to do. A few lines each.
   It begins with the version after 0.2.0; 0.2.0 has one line, that it is the first release.
2. **The release puts the version's section at the top of its notes,** above what the notes
   have today.
3. **A version without a section is not released.** The workflow stops for such a tag before
   it builds anything, and says what is missing. Started by hand, it shows the notes it would
   publish.
4. **The lines are written as the work is merged,** under a heading for what is not released
   yet; when the version is changed, that heading becomes the version's. So nobody has to
   gather a release's changes afterwards from the history.
5. **The rule is put anew:** git history stays the record of what changed in the code; the
   changelog is what a release tells its users.

### Decisions for the owner

1. **Where the text lives.** One file with a section for each version (proposal); a file for
   each release; or written by hand on GitHub once a release is out, with nothing in the
   repository.
2. **When it is written.** With each package as it is merged, under what is not released yet
   (proposal), which adds a step to the end of every session; or once, when the version is
   changed.
3. **Whether a release without it is refused** (proposal: yes).
4. **What a section holds.** New, changed, mended, and what to do when updating (proposal); or
   free text.
5. **Release 0.2.0.** Left as it is (proposal), or given a few lines after the fact: its notes
   on GitHub are the owner's to edit, and the workflow does not publish a release twice.

### Tasks and acceptance

Per the task map, "Change the download, setup, or how a release is made": the workflow
(`.github/workflows/release.yml`), `release/notes.md`, and a small script that takes one
version's section out of the file, with a test of it. The runbook under "Change the version"
and "Make a release". `AGENTS.md`: the sentence that there is no changelog, and the list of
what a session does at its end, if the lines are written with each package. Acceptance: a
release started by hand shows in its log the notes it would publish, with the version's
section on top; a tag for a version that has no section stops before anything is built and
says which section it wants; and the notes of the next release on GitHub begin with what
changed.

## WP-26: Access that ends by itself when it is not used

Asked for by the owner on 2026-11-23: "we should have auto revoke of access after idle". Goal:
a tab that was authorized and is no longer worked on does not stay open to an agent.

Filed only. Nothing is built.

### What there is today

Read from the source on 2026-11-23 (`popup.html`, `policy.ts`, `background.ts`).

- **An authorization lasts as long as was chosen when it was given:** *Until revoked*, which is
  the first choice, *1 hour* or *8 hours*. The time runs from the moment of authorizing,
  whatever happens after it. It is checked before every command and every half minute; when
  it is over the session ends, and the agent is told `AUTHORIZATION_EXPIRED`.
- **A session also ends** when the user revokes it, when the tab is closed, when the user
  disconnects its agent, and when Chrome is closed. A tab that leaves its website is
  suspended, not ended.
- **It does not end for want of use.** A tab authorized until revoked stays open to its agent
  for as long as Chrome runs: through a night, through a week. And when its agent has gone,
  the session waits for an agent of the same name.
- **Nothing says when a session was last used.** A session's record has no such time. The
  activity list has the times of what happened, but it is short and the user can clear it.

### What idle can mean

It is the first thing to settle, and the request does not say.

- **No command in the session for a while.** The agent is there and has not touched this tab.
- **The session's agent gone for a while.** Nobody is there to use it.
- **The user away from the machine.** Chrome can tell an extension that, but only with a
  permission the extension does not have, and its four permissions are fixed. So this one is
  out.

### Proposal

1. **A session remembers when it was last used:** the time of the last command of its agent
   that was let through.
2. **A session that has not been used for the idle time ends,** by the way an expired one ends,
   at the same two moments: before a command, and every half minute. A machine that slept
   through the idle time finds the session ended when it wakes.
3. **The idle time is one setting in the popup,** for all sessions, beside the two that are
   there: a few choices and *never*.
4. **The popup says it:** the session's row when it is close to ending, and the activity list
   when it has ended and why.
5. **The agent is told why,** in the words of its answer, so that it can tell the user that
   the tab has to be authorized again.
6. **The rule is in `policy.ts`,** as the other rules are: a function of the session, the
   time and the setting, with tests of its own.

### Decisions for the owner

1. **What idle means:** no command in the session (proposal), the agent gone, or either, each
   with a time of its own.
2. **How long, and whether it is on from the start.** It changes what happens to sessions that
   exist: today they stay. Proposal: on, at one hour, with *never* to choose.
3. **Ended or paused.** The owner's word is revoke: the session ends, and the tab is authorized
   anew (proposal). Paused is softer: one click brings it back, and it stays in the list.
4. **One setting for all** (proposal), or a choice at each authorization, beside *How long*.
5. **A word before it ends,** in the session's row or on the toolbar's badge, or none.
6. **What the agent is told.** The code there is for an authorization that is over, with other
   words (proposal), or a code of its own, which the tool reference, the three skills and the
   suite then have to know.

### Tasks and acceptance

Per the task map: "Change what is allowed" for the rule (`policy.ts`); "Change sessions,
pairing or the connection" for the time in a session's record and the half-minute check
(`background.ts`); "Change the popup" for the setting and the row. The tool's text changes, so
`docs/tool-reference.md` and the end-to-end suite; the developer guide for sessions and its table of
settings; and the table of what is tested in `docs/security-model.md`. Tests: the rule, with the
clock given; the worker, that a command renews a session and that one left alone ends, also
over a restart of the worker; end to end, with a short time set in the real popup. Acceptance:
a session that is not used for the time set is gone from the popup and refused to the agent,
with the reason said to both; one that is used stays; and with *never* nothing is different
from today.

## WP-27: Security hardening, and features for developers

Asked for by the owner on 2026-11-24, as one list of fourteen points in three priorities:
security first (P0), then what saves an agent calls and context (P1), then what makes the
product easier to live with (P2). The constraints were the repository's own: local, no site
known to the product, no cookies or script, nothing granted without the user.

### Gap analysis

Read from the source and the documentation as they were at `a06b0ce`, before anything was
changed. "There" means built and tested; "part" means built in part; "not" means not there.

| # | Point | Was | What was missing |
|---|---|---|---|
| 1 | Agent identity | part | An agent's id was made anew at every start, and its tabs came back to it by the name it gave itself: a program that could pair could take that name while the first was away. A Disconnect did not hold over a restart. No credential of an agent's own, and no way to take one agent away on the server |
| 2 | Authorization and session isolation | part | Checked once, when a command arrived; a command that waited for the page or for the user used what was allowed then. Expiry was a time the user picked, with no limit from a policy and none for a session that is not used (WP-26). No limit on commands waiting for one tab |
| 3 | Submission approval | part | An answer was for one request, once, within a minute, and a repeat was refused: there. Not bound to the content: what was sent was what the page held at the click, also when that changed while the user was asked |
| 4 | Strict profile | not | Blocked sites were the only local restriction. Screenshots, the automatic mode, *Any agent* and plain clicks could not be switched off by a policy |
| 5 | Data and transport | part | Loopback, proofs both ways, origin pinning, sizes, rates, replay, versions: there. A screenshot showed frames of another site. Nothing was redacted. An extension of the older version would have kept the older rule |
| 6 | Security tests | part | None for impersonation by name with the owner away, for a change between two steps of a command, for a changed content after the prompt, for frames in a picture, for a flood on one tab |
| 7 | Smart extraction | part | Outline, one section by ref, paging: there. No search, no context, no tables or code blocks alone, one region per call |
| 8 | Incremental snapshots | there | `diff` on `browser_snapshot`, refs kept, full snapshot as the fallback. Left as it is |
| 9 | Bounded collection | not | An agent scrolls and reads in separate calls |
| 10 | Waits and interactions | part | Waiting for text or a ref (visible, gone, enabled, disabled), expand and collapse by click, scrolling to a ref, a fixed set of keys: there. No hover, no waiting for a change |
| 11 | Workspaces | not | |
| 12 | Access requests | not | An agent tells the user in its own words what to authorize |
| 13 | Management interface | part | The popup and the server's window show agents, sessions, activity, prompts, expiry. Not the policy, and not whether an agent is the same at every start |
| 14 | Corporate readiness | part | Checksums and GitHub's attestation for a release: there. No record on disk, no policy file beyond blocked sites, no SBOM, no scan of dependencies |

### Backlog, in the order it was taken

1. Agent identity by a key of its own; sessions bound to the id; revocation (point 1).
2. A local security policy in the settings file, with a strict profile; enforced by the server
   and by the extension (points 4, 2).
3. Every step that touches the page checked again; a limit on what waits for a tab (point 2).
4. An approval bound to the content the user was shown (point 3).
5. Redaction; no picture with a frame of another site in view; a protocol version that refuses
   the older rule (point 5).
6. Tests for each of these, in the rules, the worker, the server and the real browser (point 6).
7. Search and regions in `browser_extract` (point 7).
8. A record on disk; an SBOM and a scan of dependencies in the workflows (point 14).
9. The popup says the policy and who an agent is (point 13).
10. Collection over scrolling and pages; hover; waiting for a change (points 9, 10).
11. Workspaces; access requests (points 11, 12).

### What was built

Items 1 to 10: of item 10 the waiting for a change (`condition: "changed"` of
`browser_wait_for`) on 2026-11-24, and collecting and hovering as two tools, `browser_collect`
and `browser_hover`, after the owner's "continue with p1". And item 11, after the owner's
"continue with p2": workspaces, requests for access (`browser_request_access`), and the
security policy in the server's window. There are fourteen tools now. What each is, for a user, is in the pages that own it: the
[security model](docs/security-model.md) (agents, the security policy, what is checked and when,
submissions, what is taken out, logging), the [developer guide](docs/developer-guide.md#the-security-policy),
the [tool reference](docs/tool-reference.md) and the [protocol](docs/development.md#protocol-reference).
What was run is in the validation log.

What a setup from before has to know:

- **The protocol version is 3.** The server and the extension have to be of this release
  together; either one alone is refused by the other.
- **An agent's tabs come back after a restart only where the agent is named** with
  `--agent <name>` in the command that starts the server. The setup command prints the line
  with it. A setup without it works, and its tabs have to be authorized again after each
  restart: handing tabs on by a name the agent gives itself was the weakness.
- **A screenshot is refused while a frame of another site is in view.**
- **Text that looks like a credential reads `[redacted]`** in snapshots, extracts and addresses.

### Decisions the session took, which are the owner's to change

1. **No name, no tabs back.** The alternative was to keep the old rule for agents without a
   key. It was not kept: it is the rule the point asked to replace.
2. **The policy is the settings file,** beside the blocked sites, and a value that cannot be
   read blocks everything, as a slip in that list does.
3. **What the strict profile sets:** the six things in its row of the security model. Eight
   hours and thirty minutes are the session's numbers.
4. **WP-26, access that ends when it is not used, is built as a line of the policy** and is
   off without it. Its six decisions are still the owner's: this does not make it a default.
5. **Redaction cannot be switched off.** It goes by shape and has holes; the security model
   says so.
6. **A frame smaller than 8 pixels a side does not hold a picture back.**
7. **Search runs on an automaton of its own, not on the browser's regular expressions,** because
   those cannot be bounded in time: measured, `.*.*.*x` took 37 seconds on a line of 1,000
   characters. The price is a subset of the syntax, named in the tool reference.

### Left, and why

- **What a request for access cannot do.** It can be shown to the user, and a higher level on
  a tab can be given in the popup. A tab on another site is still given by the user's click on
  that tab, which is Chrome's rule and not ours: the popup says so, and offers the request
  there. The popup opens by itself for a request, on the owner's word, with the pause and the
  order of buttons that a question about a submission has.
- **What a workspace is not.** It is a name on tabs, kept with the sessions for the browser's
  run. It is not saved over a restart of the browser, has no settings of its own, and is not
  shown in the server's window.
- **What collecting and hovering do not do.** A hover made by script does not set the browser's
  own hover state: it opens what a page opens by script, and not what a style rule alone
  shows. Collecting reads downwards from where the page is, and by pages only through a
  control with an exact name; a list that is paged by a button is followed only with Write
  access, as a click on that button would be; "load more" buttons are not pressed by it.
- **The editor lab was not run.** `editor.ts` was not touched; what a snapshot and an extract
  say now passes through the redaction, which the lab's checks read.
- **The server's window names a security policy** in the heading of its settings' row, says in
  short what it restricts in a line of its own, and in full under the mouse. Drawn and looked
  at in two pictures; the live window was not. It does not show whether an agent has a key,
  nor requests and workspaces; the popup shows all three.
- **The SBOM and the scan run in the workflows only,** which run on GitHub. They were read as
  YAML and not run.
- **Not signed, as before.** A download is verified by its checksum and GitHub's attestation.
- **What cannot be enforced,** and is said in the security model: one program of the user's
  against another (keys, token and settings have the protection of the home folder); a secret
  of no known shape; text typed without a submission under the strict profile; a page that
  changes something on a plain link.

## WP-28: Ports that the system keeps back

Found by the owner's second session on 2026-11-24, in use on Windows 11. Goal: a machine on
which Windows has reserved the server's ports still gets a working TabGoblin without the user
having to find out why, pick a port and set it in two places.

### What happens today

- **The server takes the first free port of eight from a fixed first one,** 47821 unless
  `--port` or `BCMCP_PORT` says otherwise (`Agent.serve`), and the one server listens for the
  agents' processes on the port after those eight (`Link.port`). The extension looks at the
  same eight ports from the first port in its settings (`scan` in `background.ts`).
- **Windows can keep a range of ports back** for its own networking, as Hyper-V, WSL and
  Docker have it done. It takes them in blocks of a hundred from the dynamic range, anew at a
  start. By default that range begins at 49152; on the owner's machine it begins at 1024, so a
  block can lie anywhere. That day it was 47749 to 47848: all nine of TabGoblin's ports.
- **A port that is kept back cannot be told from one that is held** by what Java says. Since
  `1b4d35a` the server counts which of the eight answer a connection, and says from that whether
  they are taken, kept back, or some of each, with the command that lists the ranges; since
  `8b7656d` the window says that the server has no port, and the log has one short line.
- **The way out is the user's:** start the server with `--port` and another first port, in each
  agent's settings, and set the same first port in the popup under *Connection*.

### What it runs into

- **The extension cannot be told a port.** It finds a server only by trying addresses: it has
  no file to read and nobody to ask. So whatever the server falls back to has to be a port the
  extension tries by itself.
- **No port is safe** on a machine whose dynamic range begins at 1024: any block may be taken at
  the next start. A second fixed range lowers the chance of both being gone; it does not end it.
- **Everything hangs on one first port:** the agents' eight, and the port of the one server
  after them. A fallback has to move all nine together, and every agent's process has to find
  the server on the same one.
- **Each port the extension tries and finds nobody on** is a failed connection, every half
  minute while no server is found.

### Proposal

1. **A short list of first ports that both sides know,** two or three, far apart: the one of
   today first. The server takes the first of them on which it can listen at all; the process
   an agent starts looks for the server on each in turn before it starts one; the extension
   looks at each range, and stays with the one where it found a server.
2. **`--port` and the popup's field stay,** and mean what they mean now: one first port, and no
   list. A setup that names a port is not changed by this.
3. **The message keeps the command** that lists the reserved ranges, and adds the one that
   keeps a range for TabGoblin, for whoever may run it as an administrator: a range that an
   administrator has excluded is not given to the system's own networking. To be tried on a
   machine before it is written into a page: it is from memory.
4. **The status says which first port is in use** when it is not the first of the list, so
   that an agent can tell the user.

### Decisions for the owner

1. Whether a fallback is wanted at all, or the message and `--port` are enough.
2. Which first ports, and how many. More of them make it likelier that one is free, and make
   the extension try more addresses where no server runs.
3. Whether the extension tries all ranges every time, or the others only when the first has
   nobody (proposal: the others only then).
4. Whether the first port of today stays the first of the list (proposal: yes, so that nothing
   changes for a machine where it works).

### Built, on 2026-11-24, on the branch `wp-28-fallback-ports`

The owner said to mend it; the four decisions were taken as the entry proposed them, and the
second, which had no proposal, was taken by the session. Each is the owner's to change.

1. **A fallback is there.**
2. **Three first ports: 47821, 37821, 27821.** Ten thousand apart, where a block the system
   keeps back is a hundred; all below 49152, where the dynamic range begins on most machines.
   Which numbers, and that there are three, is the session's choice.
3. **The extension looks at the other ranges only while no server is connected,** and then at
   all of them at once: 24 addresses each half minute while nothing is found, 8 as before
   once a server is.
4. **The first port of before stays the first:** nothing changes on a machine where it works.

How it works: `Ports.java` has the list. The server takes the first range of which one
agent's port can be listened on or is held by a program; a range of which neither is so is
kept back. An agent's process looks for the server on each range in turn before it starts
one, and no longer hands a port on to the server it starts unless the user named one. The
extension's rule is `rangesToScan` in `policy.ts`. `--port`, `BCMCP_PORT` and the popup's
*First port* mean one port and no list. `browser_status` has a line `Ports: …` when the
server is not on the usual range.

Not built: the command that keeps a range for TabGoblin (proposal 3). It was from memory, and
was to be tried on a machine first.

**Not tried, and what the acceptance asks for: a Windows machine with the first range
reserved.** No range can be kept back in the session's container, so what is tested is what
follows once a range is known to be unusable (the server on the next range, an agent's
process finding it there, no second server, the extension's rule), and that a range which
programs hold is not taken for one that is kept back. Whether binding and connecting behave
on Windows as the entry says of a reserved port is the owner's second session's to see. One
case is known and left: a block that ends inside a range, so that the agents' ports are given
out and the server's own port after them is not. Each agent's process then serves its agent
alone on that range, as before this.

### Tasks and acceptance

Per the task map: "Change how the one server and the agents' processes find, prove and leave
each other" and "Change sessions, pairing or the connection". Tests: a server that cannot
listen on the first range takes the second, and its agents' processes find it there (`HubTest`,
with a range made unusable by holding it); the extension finds a server on the second range and
does not go on trying the first while it has one (`test/background.test.ts`); end to end with
the first range held by another program. Acceptance, on a Windows machine with the first range
reserved: an agent is started without `--port`, the popup is left as it is, and
`browser_status` says connected. The tool's text changes where the status names the port.

## WP-29: The tools as commands of a terminal

Asked for by the owner on 2026-11-25: an agent that runs commands in a terminal and has no MCP
is to use TabGoblin as an MCP agent does, through the same server and under the same rules.
Built that day on the branch `ccr-6350ba03-tntbzp`, in a session that ran in the cloud. What a
command is and prints is in the [tool reference](docs/cli.md); what
keeps its agent apart is in the [security model](docs/security-model.md#agent-identity-and-authentication).

### What was built

- **`Cli.java`, an adapter and nothing else.** `tabgoblin <command> --agent <name> …` is one
  MCP tool call. The commands and their arguments are read from `McpMain.toolSpecs`; nothing
  of a tool is written a second time. `tools --json` lists them with their schemas.
- **The same link.** A command connects as an MCP agent's process does (`Link`, with
  `forCommand`), proves the token and its agent's key, sends `initialize` and one
  `tools/call`, prints one JSON object and ends. No port, protocol or server was added, and
  the extension's protocol is as it was.
- **The agent stays between commands.** The extension finds a new agent only by looking at
  the ports, in up to half a minute, so an agent that went with each command would never be
  connected. The server keeps an agent of the command line, with its port and pairing, until
  it has had no command for ten minutes (`Hub.serveCommand`, `letIdleGo`).
- **One key, one agent, as before.** The commands of a key are that key's agent, also several
  at once. A command whose key an MCP-connected agent holds is refused (`AGENT_IN_USE`); it
  gets no id of its own, which would be an agent that no tab ever comes to.
- **Setup:** `--setup <agent> --mode cli` prints the command in place of the line that
  registers the server; `--mode mcp`, and no mode, is what setup did.
- **A skill of its own,** on the owner's word the same day ("Separate CLI-only skill"): three
  skills in `skills/cli`, one for each agent, in terms of commands and naming no MCP tool. The
  skills for MCP moved to `skills/mcp` on the owner's word, so that the folder is split by the
  way an agent reaches the tools. The
  skills for MCP name no command. `--mode cli` installs it, with `--setup` or
  `--install-skill`; the two of an agent have one name and one place and take each other's
  place.

### Open, for the owner

- **Ten minutes** is the session's choice. Longer keeps a port and the extension's worker for
  longer; shorter makes "not connected" after a pause more frequent.
  `BCMCP_COMMAND_IDLE_SECONDS` changes it for one server.
- **`AGENT_IN_USE`, or the same agent?** A command under the name of an agent that is
  connected through MCP is refused. It could be let into that agent instead, since it proves
  the same key; refused is the narrower reading of "a key has one agent at a time".
- **How the agent finds the command.** Setup says to put the download's folder on the `PATH`
  or to tell the agent the line once. Setup writes nothing but the skill, so it does not write
  the path anywhere.
- **Not done:** the command line on Windows and macOS, where quoting JSON on a command line is
  harder (`--args-file` and `--args -` are there for it); a real agent using the skill's new
  section; progress while a command waits.

## WP-30: The documentation for two interfaces

Asked for by the owner on 2026-11-25, after WP-29 was merged: TabGoblin is no longer to be
presented as an MCP server first. It is a browser bridge for AI agents with two integration
interfaces, CLI and MCP, and it has to be plain at once that an agent does not need MCP.
Documentation only.

### What was done

- **A page for the CLI,** [docs/cli.md](docs/cli.md): quick start, the commands and their
  arguments, discovery, output and exit codes, identity and the life of a session, a worked
  example, and a few lines of instructions for an agent that has no skill. The section it
  replaces in the tool reference is now a pointer.
- **The tool reference** (`docs/tool-reference.md`, its file name kept because two tests read
  it by that name) is titled "Tool reference" and says that it holds for both interfaces.
- **The README:** a browser bridge in its first sentence, a table of the two interfaces
  before anything else, both in the picture, and two quick starts.
- **The installation guide:** "CLI or MCP" first, then one path with a section for each.
- **Architecture and security model:** both interfaces as entry points in the picture, and in
  each page a table of what the two share and where they differ. The security model and the
  corporate assessment say that the CLI is no way around a restriction.

### Left as it is, and why

- **Three texts say "MCP" first and are code:** the server's `--help` ("TabGoblin MCP server
  (browser-context-mcp)"), the first line of `tabgoblin tools` ("each is the MCP tool of the
  same name") and a command's `--help` ("Arguments (the MCP tool …)"). The task was the
  documentation; `McpMainTest` holds the first of them word for word.
- **The skills** were not touched: they are in the jar, and `SkillsTest` holds their words.
- **`docs/tool-reference.md` keeps its name.** Renaming it needs `SkillsTest` and
  `ToolReferenceTest` changed with it.
- **No picture was made or regenerated.** The popup's pictures show no interface; the
  popup's own words "is the MCP server running?" are quoted as they are.

### A last review, the same day

On the owner's word, for accuracy and not for more text. What it found against the
implementation, and mended in the documentation:

- **Approval of a submission was said to be unconditional** in the README ("anything that
  sends data waits for your approval") and in one line of the corporate assessment. In
  `policy.ts` (`needsAsking`, `askUnder`) it is the default, which the user can set to
  automatic or to not asking; it is mandatory under the strict profile and for a control
  whose English label marks it as high-impact. Every page now says that.
- **"It never receives your cookies or tokens"** promised more than is enforced: no tool reads
  cookies, storage or headers, but a token that a page displays is text like any other, and
  taking it out is best effort. The README says what no tool does, and names what is best
  effort.
- **The corporate assessment said that the settings file keeps an agent from the CLI.** The
  file is a guard-rail the user can edit, as the same page says further down. What stops
  either interface technically is the absence of the extension.

Checked and found right: every `tabgoblin` command and option that the documentation shows,
run through the built jar's own reading of a command line; the manifest's four permissions;
the fields that are never read or filled; the tools that return an object.

### The diagrams, the same day

On the owner's word. Nine diagrams were there, in three files; there are twelve now, in six.

- **Redrawn top to bottom, with the same names in all:** the README's (CLI and MCP side by
  side, the user as the one who decides), the architecture's components, the corporate
  assessment's data flow, which now names the workstation as one operating-system account
  and where each side checks.
- **Corrected against the code:** the submission's sequence drew the question to the user as
  unconditional, and now has it as a step that the user's setting decides; the command's
  sequence had the arguments validated before the revoked agent is refused, where
  `BrowserService.run` does it the other way round, and named the call as MCP's alone; the
  two sequences for connecting and authorizing gained their refusals.
- **New:** where a command is checked, with every refusal and the class of each check
  (security model); the first status, authorization and snapshot (installation, step 7); two
  commands as two processes and one agent (CLI guide).
- **Left:** the two state diagrams, but for one label.

### The diagrams as drawings, the same day

On the owner's word, with a picture of the look that is wanted: an agent, the CLI and MCP side
by side, a green "TabGoblin bridge" with what it checks, the browser extension, and a legend.

- **Four diagrams are SVG files** in `docs/assets/diagrams/`, a light and a dark one each, drawn
  by `build.mjs` there in one style: the README's overview after the owner's reference, the
  architecture's components, the security model's checks of a command, and the corporate
  assessment's deployment boundary and data flow.
- **Where the overview departs from the reference:** the bridge's third block is "Policy" and
  not "Permissions", because the access level of a session is checked in the extension and
  not in the server; the browser extension is green and not slate, since it is TabGoblin's and
  enforces; and a last row shows the tabs that are authorized and those that are denied.
- **The eight sequence and state diagrams stay Mermaid,** with GitHub's theme. Colours of our
  own would be fixed, and wrong on a light page or on a dark one.
- **Open:** whether the owner's proxy shows them (state); how GitHub draws them.
- **After the owner's word that no picture showed in IntelliJ:** one file for each diagram,
  with its own ground and both sets of colours inside (`prefers-color-scheme`), in place of
  two files in a `<picture>` element, and the plain Markdown form of an image in the pages.
  Each shape has the light colours as plain attributes too, for a viewer that reads no style
  sheet.

## WP-31: The CLI and MCP side by side, and MCP that can be turned off

Asked for by the owner on 2026-11-27: the CLI and MCP are to be two layers at the same level,
neither built on the other, because a company may forbid MCP. A user then has to be able to
show that the CLI does not use MCP, and an organisation has to be able to turn MCP off. A
design, not started; the points under "Decisions for the owner" are open. What the window
shows of the mode was asked for the same day and is in its own section.

What it is not: a way around a rule against agents in the browser. Where that is forbidden,
the CLI is forbidden too, as the
[corporate assessment](docs/corporate-assessment.md#restrictions-on-mcp-and-the-cli) says; this
package is for an organisation that forbids a protocol and allows the activity.

### What happens today

Read from the source on 2026-11-27.

- **The core is already free of MCP.** `BrowserService.call(name, arguments)` checks the
  arguments, the blocked sites and the policy, sends the command and returns a `ToolResult`.
  Its timings are its own (`Timings`). Nothing in it imports the MCP SDK.
- **The tools are defined as MCP objects.** Names, titles, descriptions, input schemas, the
  read-only mark and which tools return an object are written as `SyncToolSpecification` in
  `McpMain.toolSpecs`. The CLI reads its commands and their options from there (`Cli.tools`).
- **A command speaks MCP.** `Cli` sends `initialize`, `notifications/initialized` and one
  `tools/call` over the link, and cancels with `notifications/cancelled`. In the server,
  `Hub.serveCommand` gives each command an MCP session of its own (`Agent.converse`), with
  `StdinTap` for the end of input and for cancelling.
- **A command reads its error code from text.** `ToolResult` has `isError` and no code; the
  code is in the text (`Error [CODE]: …`, made in one place, `BrowserService.java` near line
  261), and `Cli` takes it out again with a pattern.
- **Nothing turns MCP off.** The settings file has no such key. A server refuses no link for
  its interface.
- **A refused link serves its agent alone.** When an MCP agent's process cannot have the server
  (`Link.connect` is false, a refusal included), it serves its agent with a server of its own
  (`McpMain.serveAlone`). A refusal in the server alone would therefore not stop MCP.
- **The extension cannot tell the interfaces apart.** It knows an agent by the id the server
  proved; "(command line)" in the popup is a label the server sends.

### What the request runs into

- **"Does the CLI use MCP?" is answered yes today,** in the wire and in the server. That is
  what has to change, not only what the documentation says.
- **AGENTS.md forbids a second way to the server** (`Cli.java`: "no rule, no tool and no
  second way to the server there"). The first two stay true. The third has to be reworded:
  one way to `BrowserService`, two adapters to it.
- **Two adapters can drift.** What a tool takes and says must stay one definition, and what a
  command prints must stay what it prints now: agents read it.
- **A switch in a file the user can edit** is a guard-rail, as every entry of the settings file
  is: an agent with a shell can edit it. It holds against the user only where the
  organisation protects the file. That goes into the security model in so many words.
- **The extension cannot check the switch.** It would have to trust the server's word on which
  interface a command came by. Enforced in the server only, and said so.
- **The names stay:** the jar `browser-context-mcp.jar`, `~/.browser-context-mcp`, `BCMCP_*` and
  the MCP SDK in the jar. A reviewer will see them. A build without the SDK is not part of
  this; the package makes one possible later.

### Proposal

```
          agent with a shell                 agent with MCP
                 |                                 |
        Cli (tabgoblin <command>)           Link (stdio, MCP)
                 |  call / cancel / result         |  JSON-RPC
                 +--------------+------------------+
                                |   same handshake: token proof, agent key
                              Hub
                 +--------------+------------------+
         CommandAdapter                       McpAdapter
                 +--------------+------------------+
                     ToolDefs + BrowserService.call
                                |
                     WebSocketBridge -> extension
```

1. **One definition of the tools, without MCP types: `ToolDefs`.** For each tool: name,
   title, description, input schema (the JSON text it has now), read-only, whether it returns
   an object, and the "still running" text. Moved from `McpMain.toolSpecs`, not rewritten.
   `McpAdapter` builds the `SyncToolSpecification`s from it; `Cli` reads its commands from it.
2. **The error code is a field.** `ToolResult` gets `code`, set where the text `Error [CODE]: …`
   is made. The text stays as it is, so no answer an agent reads changes. MCP ignores the
   field; the CLI uses it instead of the pattern.
3. **A command's own messages after the same handshake.** The attach with `"cli": true` and
   its proofs stay as they are. Then one line each way, one call for each connection:

   ```
   -> {"type":"call","tool":"browser_snapshot","arguments":{...}}
   -> {"type":"cancel"}                      (Ctrl+C, a signal, the time limit)
   <- {"type":"result","isError":false,"code":null,"text":"...","structured":{...},"image":null}
   ```

   `Hub.serveCommand` hands the connection to `Agent.command`, which runs the call through
   `BrowserService.call` on a thread of its own and interrupts that thread on `cancel` or when
   the connection ends, as `StdinTap` does now for MCP. `Link.VERSION` goes to 2, so that an
   old command and a new server refuse each other by the reason that exists
   (`server_of_another_version`). Nothing else of the identity, the idle time or the agent's
   life between commands changes.
4. **MCP stays where it is,** in `McpAdapter` (what is now `toolSpecs`, `tool`, `toMcp`),
   `Agent.converse` and `StdinTap`, and only an MCP agent's link reaches them.
5. **A test holds the separation:** `Cli`, `ToolDefs`, `Agent.command` and the core import
   nothing from `io.modelcontextprotocol`. That is the sentence a user can point a reviewer
   to, and the precondition for a build without the SDK.
6. **`interfaces` in the settings file:** `cli`, `mcp`, or `cli, mcp` (the default when the
   key is absent). It only takes away, as every entry does; a value that cannot be read blocks
   everything (`SETTINGS_UNREADABLE`), as now. With `interfaces = cli`:
   - the MCP entry of the jar reads the policy before it connects and, if MCP is off, ends
     with a line on standard error and exit code 2, before any MCP message, and does not
     serve alone;
   - the server refuses an attach without `"cli"` (`refused: interface_not_allowed`), for a
     process of an older jar that does not look;
   - an MCP agent that is connected when the file changes is refused at its next call
     (`INTERFACE_NOT_ALLOWED`), as a change to the file acts now;
   - `browser_status`, the server's window and `--setup --mode mcp` say that MCP is off by
     the settings file. `interfaces = mcp` does the same for commands.
7. **Everything but an agent's MCP start still runs with MCP off.** The server's process is
   not an MCP server: it is started with `--hub` and runs an MCP session only for an MCP agent,
   which it refuses then. The check is in the one place where the jar would serve an agent
   over stdio, not at the top of `main`:

   | Start | With `interfaces = cli` |
   |---|---|
   | The window: `--panel`, or `TabGoblin.exe` | Starts as now; the window shows the mode (below) |
   | A command when no server runs | Starts the server as now |
   | `--show-token`, `--setup`, `--help`, the commands for agents' keys | As now |
   | An agent's program, starting the jar as its MCP server | Ends with the reason, exit code 2; no server is started |

### The mode in the window

The owner asked on 2026-11-27 that the window show at a glance which mode the server is in,
and that MCP being off is marked by a sign that says no MCP agent is let in.

1. **A pill for each interface in the header,** beside the port's: `CLI` and `MCP`. One that
   is on has the accent colours, as the port's pill. One that is off has the colours of a
   refusal (`-tg-bad` on `-tg-bad-soft`) and a sign before its name: a circle with a stroke
   through it. The sign is drawn from shapes in `panel.css`, as the window's own buttons draw
   their dash and cross, and is no character of a font, which looks different on each system
   or is missing. So with `interfaces = cli` the header reads `CLI` and `⊘ MCP`.
2. **Under the mouse,** the pill that is off says why and where: "MCP is off by the settings
   file (`interfaces = cli`). No MCP agent is let in; one that tries is told why. Edit opens
   the file", with the file's path, as the blocked sites say theirs.
3. **A file that cannot be read** shows both pills off, with the reason, since everything is
   refused then.
4. **Each agent's card is marked `CLI` or `MCP`,** whatever the setting: the server knows by
   which way each came (`Hub`, the agents of commands apart from the others). Today the window
   does not say it; only the popup does, with "(command line)".
5. **A refused MCP agent is a line in the log:** "MCP agent turned away: MCP is off by the
   settings file". The server sees only an attach from a jar that does not check (an older
   one); a jar that checks ends before it reaches the server. Whether that start tells a
   running server, so that the window counts it, is decision 6.
6. **What does not change:** the status line and the goblin keep saying what they say now; a
   mode is a setting, not a state. The popup is not changed by this.

### Decisions for the owner

1. **The key.** `interfaces = cli` (proposal), which reads the same way for either side. Or
   `mcp = off`, which names only the case that was asked about.
2. **What an MCP start does when MCP is off.** It ends before any MCP message, with the reason
   on standard error (proposal): then no MCP runs at all, and the agent's program shows only
   that the server did not start. Or it answers every tool with `INTERFACE_NOT_ALLOWED`: the
   agent is told why, and an MCP session does run.
3. **The command's wire.** Its own three messages (proposal). Or MCP as now, with the
   separation only in the code: smaller, and the answer to "does the CLI use MCP?" stays yes.
4. **The order.** `ToolDefs` first, then the wire with the code field, then the switch
   (proposal): each part can be merged alone, and the first changes no behaviour. Or the
   switch first, which an organisation can use soonest, on today's wire.
5. **Not now:** a build without the MCP SDK, and new names for the jar and its folder. Both
   can come later without changing this.
6. **Whether an MCP start that is turned away tells the window.** If a server runs, the start
   proves the token as a window request does and sends one message, `turned_away`, before it
   ends; it starts no server for it. The window then counts them under the pill ("2 MCP starts
   turned away since 14:02"), so that the user sees that something tried (proposal). Or not:
   the agent's program says it, and the window shows nothing of a start it did not see.
7. **Whether the popup marks the mode too.** The extension is told the policy already. Proposal:
   not now; the popup marks an agent of the command line, and what is off is the server's.

### Tasks and acceptance

1. **`ToolDefs`.** `tools/list` is the same before and after, tool for tool and field for
   field (a test that compares it with a copy taken before the move); `ToolReferenceTest`,
   `SkillsTest`, `CliTest` and `mvn verify` (`McpConformanceIT`) pass unchanged.
2. **The code field and the wire.** `CliTest`'s expected output and exit codes unchanged; a
   test for each message (call, cancel, a connection that ends during a call, a message that
   is not one); `HubTest` for one call per connection and for `server_of_another_version`;
   the separation test of point 5; end to end, the section "The command line" unchanged.
3. **The switch.** `BlockedSitesTest` for the key, its values and an unreadable value;
   `McpMainTest` for the MCP entry that ends and does not serve alone; `HubTest` for the
   refused attach; `BrowserServiceTest` for a change while an MCP agent is connected; end to
   end, one step with `interfaces = cli` (an MCP agent is refused with the reason, a command
   works) and one with `interfaces = mcp`.
4. **The window.** `PanelModelTest` for the pills and their words with each value of
   `interfaces` and with a file that cannot be read, for each agent's mark, and for the log
   line; `PanelTest` on a display for the drawn sign; `McpMainTest` for each start in the
   table of point 7; the window's pictures made again with their script and looked at, in
   both colour schemes (runbook: "Look at the server's panel").
5. **Documentation.** `docs/tool-reference.md` for `INTERFACE_NOT_ALLOWED`; the table of the
   security policy and the section "CLI and MCP: one set of controls" in
   `docs/security-model.md`, with the limits above; the restrictions in
   `docs/corporate-assessment.md`; the settings and the server's panel in
   `docs/developer-guide.md`; the wire in
   `docs/architecture.md` and `docs/development.md` (protocol reference); `docs/cli.md`; the
   row of the CLI in the task map of `AGENTS.md` and its rule, reworded; the six skills if
   what an agent should do changes (a command refused because the CLI is off).
