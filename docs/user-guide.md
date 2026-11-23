# User guide

How to work with TabGoblin once it is set up: authorizing tabs, what the popup shows and does,
submissions, and stopping. What an agent can and cannot reach is in the
[security model](security.md); what each tool does, in the [tool reference](tools.md).

The pictures of the popup are captures of the real one, in its real size; where there is more
than fits, the popup scrolls.

## 1. Install

The [installation guide](installation.md) has every step, with what you should see and what to
do when you do not: building the two parts, loading the extension in Chrome, and telling your
agent about the server. All your agents share one server, which the first of them starts; up to
eight agents can be connected to it at once.

## 2. Pair

The extension only talks to servers that know a shared pairing token. You paste it into the
popup once: [step 6 of the installation guide](installation.md#6-pair-the-extension-with-the-server).

The line under the name in the popup says how many agents are connected. *Disconnected* means
that no server is reachable: none runs, because your agent starts one when it first needs it, or
you switched one off in [its panel](#9-the-servers-panel). A paired extension finds a new server
within about 30 seconds, or at once when you open the popup.

To invalidate a token, run the jar with `--rotate-token`. Every running server drops the old
pairing at once and the popup asks you to pair again with the new token.

## 3. Authorize a tab

Open the website and log in as you normally do. Then click the goblin **on that tab**.

<img src="images/popup-authorize.png" width="354" alt="Popup offering to authorize the current tab">

Choose:

- **the access level** (see below),
- **how long** it lasts: until you revoke it, one hour, or eight hours,
- **which agent** gets the tab, when more than one is connected. *Any agent* gives it to whichever
  agent uses it first.

Press **Authorize**. The tab is now a session. Only that tab and only that website are covered;
subdomains and other ports are different websites.

Why the click has to happen on the tab itself: Chrome gives the extension access to a tab only when
you click its icon there. That is the first of two independent checks; the extension's own check of
the address before every command is the second.

### Access levels

| | Read | Explore | Read / Write |
|---|---|---|---|
| Read the page, scroll, take screenshots, wait | yes | yes | yes |
| Go to other pages of the site, back, forward, reload | no | yes | yes |
| Follow links, open tabs and expand collapsed sections | no | yes | yes |
| Press buttons, fill in and type into fields | no | no | yes |
| Submit forms, post, save, delete | no | no | yes, as a stated submission |

Start with the lowest level that does the job. You can change it at any time in the session's
dropdown; lowering it stops whatever needed the higher level.

**Read** sends nothing to the website on the agent's behalf. **Explore** makes the browser load
pages, which on a few badly built sites has side effects (a "log out" link, for example).

## 4. Working with sessions

<img src="images/popup-sessions.png" width="354" alt="Popup with two sessions and recent activity">

The popup is ordered by how often you need it. From the top:

**Sessions** shows each authorized tab: its id, its website, its owner, and controls.

- The dropdown changes the access level.
- **Pause** stops the agent in that tab at once and refuses new commands until you resume.
- **Revoke** ends the session.
- Closing the tab ends its session. Closing the browser ends all of them.

**Activity** shows what is happening now and the six most recent operations, per session, with
their outcome. It never shows page content or anything typed.

**Agents** lists every connected agent with the number of tabs it has and its port. *Disconnect*
cuts one off and ends its sessions; the number beside the button is what that will end. The agent
stays out until you press *Allow again*, and comes back without a tab: each one needs your click
on it again.

**Settings** and the **Connection…** link come last. Scrolled out in full the popup looks like
this, in the dark and the light theme (TabGoblin follows your system setting):

<img src="images/popup-full.png" width="330" alt="The whole popup laid out, dark theme"> <img src="images/popup-full-light.png" width="330" alt="The whole popup laid out, light theme">

Each of the four panels folds to one line: click its heading, and click it again to unfold it. A
folded panel says in that line what is inside: how many tabs are authorized and whether this one
is, the latest activity, the agents by name, the two settings. The popup opens the way you left
it. A confirmation prompt and the pairing form never fold.

<img src="images/popup-folded.png" width="354" alt="The popup with its four panels folded to one line each">

The toolbar badge says `ON` (an agent may act), `RUN` (it is acting), `II` (paused) or `?` (it is
waiting for you). `OFF` means that tabs are authorized and no agent that may use them is
connected: nothing can act, and the tabs are still yours to revoke. The extension asks every
server every twenty seconds whether it is still there, so a server that hangs is shown as gone
within about a minute, and is found again by itself when it answers.

While an agent is working in a tab, a notice appears in the bottom corner of the page itself: a
small bar, and above it a pill for each thing the agent just did.

<img src="images/indicator.png" width="420" alt="The notice in the page: two pills of what just ended, and under them the bar with the goblin, what runs now, and Pause">

- **The bar** says what the agent is doing now ("Agent: Reading page"), that it is idle or
  paused, or that your answer is needed in the popup. It has a **Pause** button. The bar is
  always the same height and stays in its place.
- **The goblin** in the bar shows the same at a glance: it glows green, softly and in pulses,
  while the agent works, amber when you are asked, and has its eyes closed when the session is
  paused.
- **The pills** float above the bar, up to three, the newest at the bottom: ✓ for what ran
  through, ✗ with a short reason for what was refused or failed. Each covers no more of the
  page than its own words.
- A pill stays four seconds and then fades. When nothing runs any more, the bar goes with the
  last pill. A tab that is only authorized, or paused, has no notice.

The notice is not part of what the agent reads and is in none of its screenshots. Scripts of the
page can neither read it nor press its button. A click on it anywhere but on **Pause** goes to the
page underneath. It says what the activity list says, never anything of the page or of what was
typed. Where your system asks for less motion, nothing in it moves, pulses or fades: a pill is
there and then it is not. You can switch the notice off under *Settings*.

## 5. Submissions

Anything that sends or changes data is a submission, and is treated differently from reading and
filling in fields. This section says what you see and decide; the rules behind it, in full, are
in the [security model](security.md#submissions).

<img src="images/popup-confirm.png" width="354" alt="The popup asking to allow a submission by a click"> <img src="images/popup-confirm-enter.png" width="354" alt="The popup asking to allow pressing Enter in a text box">

- The agent has to declare it. A click that would submit is refused otherwise.
- Pressing Enter in a text box counts as well: in a chat or comment box it sends what is written.
  The prompt then reads **Allow pressing Enter?** (the picture on the right). Search boxes are
  left alone.
- The prompt says who asks (the agent, by name), what for (the control or text box, as the page
  names it), what would be sent (the beginning of each text, never a password), and where (the
  session and the website the tab is on). For deleting, paying, publishing and the like it is red
  instead of amber, and says which word in the name made it so.
- A no stands for five minutes: the agent cannot put the same request to you again in that
  time, and after three requests in a row that you declined or left unanswered, none at all. The
  session then says so in the list, with **Let it ask again** if you change your mind.

  <img src="images/popup-declined.png" width="354" alt="A session that says a request was declined, with a link to let it ask again">

- The prompt comes up by itself, and takes the keyboard from the page while it is there. It
  cannot be answered by accident: for its first moment the buttons are dim and take no answer,
  and from the keyboard Deny comes before Allow.
- Nothing is typed or clicked until you press **Allow**; **Deny**, or no answer within a minute,
  means nothing happens.
- How often you are asked is yours to set, under **Before an agent submits anything** at the foot
  of the popup:

  | Setting | You are asked |
  |---|---|
  | Ask me every time (the default) | About every submission |
  | Ask me the first time (automatic) | The first time for each button or text box. What you allow then passes for 15 minutes. |
  | Do not ask me | Never, except as below |

- Deleting, paying, publishing and similar actions always ask, whatever the setting.
- A session with Read / Write access has the same choice of its own, next to **Submissions** in
  its row: a chat can be on automatic while everything else asks every time. Choosing at the foot
  of the popup sets all sessions.
- In the automatic mode the prompt tells you what an Allow reaches, before you answer: *Automatic
  is on: after Allow, this passes without asking for 15 minutes.* Where that line is missing, the
  Allow is for this once. That is so for anything that deletes, pays or publishes, and for a
  control without a name, which could not be told from another one.
- A control is known by its name on its website. After you allowed "Save" on one page, "Save" on
  another page of that website passes too, for the rest of the 15 minutes.
- In the automatic mode a session shows what currently passes without a question, such as
  *Enter in “Comment”* or *clicking “Post comment”*, and for how long. **Ask about it again**
  ends it; with several in the list the button reads **Ask about them again** and ends them all. It also ends when you pause the session, change
  its access, when the tab leaves its website, and when Chrome restarts the extension. No more
  than five submissions pass unasked in a minute; the next one asks.

  <img src="images/popup-automatic.png" width="354" alt="A session set to ask the first time, with a text box that now passes without asking">

- Afterwards TabGoblin watches the page and tells the agent what it saw: confirmed (the text
  appeared, or the page reacted as if it accepted), failed (an error appeared), or uncertain.
- Nothing is ever sent twice automatically, and the same content is refused within two minutes
  unless the agent explicitly repeats it.

## 6. When a tab leaves its website

If the tab goes to another website, through a link, a redirect to a login page, or because you
navigated there, the session is **suspended**. The agent can read nothing until you decide.

<img src="images/popup-suspended.png" width="354" alt="A suspended session with the option to add the new site">

Click the goblin on that tab. You get one of two buttons:

- **Resume** when the tab is back on a website of the session. The session continues where it was.
- **Add … to s1** when the tab is on a new website and you want the session to cover it too, for
  example a separate login host.

Or ignore both and authorize the tab as a fresh session. Each time a tab changes website Chrome
withdraws the extension's access, so moving between two websites of one session takes one click
from you each time. That is by design: no redirect and no existing login ever widens what an agent
can reach.

## 7. Troubleshooting

| What you see | What it means | What to do |
|---|---|---|
| *Not paired* | No token stored | Paste the token from `--show-token` |
| *Paste the server's current token to connect* | A server refused the token the extension holds: it was mistyped, or replaced with `--rotate-token` | Paste the current token: **Copy token** in [the server's window](#9-the-servers-panel), which comes up by itself then, or `--show-token` |
| *Disconnected: is the MCP server running?* | No server found on the ports, or the one there has its connection switched off in [its panel](#9-the-servers-panel) | Start your agent, or have it call any TabGoblin tool; check the *First port* under *Connection…*; switch the connection on in the panel |
| *Server and extension versions differ* | Jar and extension are from different builds | Rebuild both and reload the extension |
| Agent says "not connected" right after starting | It asked before the extension found its server | It waits up to 10 seconds by itself; opening the popup connects at once |
| Agent says a ref is stale | The page changed since its snapshot | Nothing; the agent takes a new snapshot |
| Agent says the session is suspended | The tab left its website | Click the goblin on that tab and resume |
| Agent says a site is blocked; the popup says *… is on your list of blocked sites* | The site is named in the server's settings file | If you want the agent there, take it off the list ([Blocked sites](#blocked-sites)) |
| Agent says the settings file cannot be read; the popup says *No agent can work in any tab* | The settings file has a mistake, and until it is mended every site is refused | The amber box in the [server's panel](#9-the-servers-panel) names the mistake. Press **Edit** there and mend the line, or empty it |
| "This tab cannot be authorized" | Browser pages and the Web Store are off limits | Use a normal `http(s)` page |
| Screenshot refused | The tab is not the visible one in its window | Bring the tab to the front |
| The page stopped responding | A native `alert` or `confirm` dialog is open | Dismiss the dialog |
| Working through TabGoblin is slow | The time goes to the agent and its model, to the browser, or to waiting for you | Ask the agent to call `browser_status` with `diagnostics`: it says [where the time went](tools.md#where-the-time-went) |
| The jar "hangs" in a terminal | Run without `--show-token` it starts a server and waits | Press Ctrl+C; see [Stopping](#8-stopping) |
| After `--panel` was added, the agent has no TabGoblin tools | The jar is from before the panel: it answers *Unknown option: --panel* and does not start | Rebuild the server ([Updating](installation.md#updating)) and restart the agent, or take the option out |
| `--panel` is set, the tools work, and no window appears | The server found no display, or runs on a system the jar has no window for. Its log, which your agent keeps, has a line `panel not shown reason=…` | See [where the panel works](#9-the-servers-panel) |

## 8. Stopping

**Stopping what an agent is doing.** In the popup: **Pause** on a session stops the agent in that
tab at once, **Revoke** ends the session, and **Disconnect** next to an agent cuts that agent off
and ends every session it has. *Allow again* gives the agent its connection back and none of its
tabs. To stop an agent for a while and keep what you gave it, pause its sessions instead. None of
these stop the server; they do not need to.

**Stopping the server.** There is one server for all your agents. The first agent that needs it
starts it, and it ends by itself a few seconds after its last agent has gone. Normally there is
nothing to stop: close the IDE or end the CLI session. An agent that ends takes only its own
part along, and the others work on.

To stop it yourself, press **Stop server** in its window (next section). Every agent then has
no TabGoblin tools until its program connects again; in Claude Code that is *Reconnect* under
`/mcp`. Its tabs are kept, and are the agent's again when it is back.

**If you run the command without an option yourself.** That form is for your agent to run. In
a terminal it only waits for an agent's messages, and says so:

```text
TabGoblin: this command is for your agent (IDE or CLI) to run, not for you. Here it only waits for an agent's messages.
Press Ctrl+C to end it. To open the server's window, run it with --panel. See also --show-token, --rotate-token, --help.
```

Press **Ctrl+C**. With `--panel`, `--show-token`, `--rotate-token` or `--help` the command does
its part and returns on its own; there is nothing to stop.

**A server that hangs or is left over.** The agents' ports are 47821 to 47828, and the server's
own is the one after them. To find the process:

```powershell
# Windows (PowerShell): the ports with their process, then end it by its process id
Get-NetTCPConnection -State Listen -LocalPort (47821..47829) -ErrorAction SilentlyContinue |
  Select-Object LocalPort, OwningProcess
Stop-Process -Id <OwningProcess>
```

```sh
# macOS and Linux
lsof -nP -iTCP:47821-47829 -sTCP:LISTEN
kill <PID>
```

Every line is the one server: a port for each agent, as the popup shows them, and its own.
Ending its process this way is not a stop. Agents that are still running start the server again
within a second and go on; a tool call that was running then answers that its outcome is
unknown. Each agent has its tabs again as soon as the extension has found it: they come back to
it by its name. To have no server, end the agents, or press **Stop server** in the window.

## 9. The server's panel

The server has no window unless you ask for one. There is one window, as there is one server,
and it shows every agent that is connected.

One case brings it up by itself: the browser came with a token that is not the server's, because
it was mistyped or replaced with `--rotate-token`. The next time an agent uses a TabGoblin tool,
the window comes up, once, and says *Pair the browser with this server* at its top, with the
button **Copy token**. The agent is told the same, and tells you. With `--no-panel` where you
told your agent about the server, or `BCMCP_PANEL=0`, no window comes for that agent, and the
token is the one `--show-token` prints.

**To see it at once,** run this in the project's folder:

```sh
java -jar java-server/target/browser-context-mcp.jar --panel
```

That brings up the window of the server that is running, and returns. If no server is running
it starts one, with its window: your agents connect to it when they start, and show in it. A
server whose window you asked for this way stays until you press **Stop server** in it.

**To have it whenever your agent runs,** add `--panel` after the jar's path where you told
your agent about the server
([step 5 of the installation guide](installation.md#5-tell-your-agent-about-the-server)), and
restart the agent. In settings that are JSON:

```json
"args": ["-jar", "<folder>/TabGoblin/java-server/target/browser-context-mcp.jar", "--panel"]
```

In Claude Code the server is added anew with the option; `claude mcp get tabgoblin` shows the
command that removes the entry it has:

```sh
claude mcp add tabgoblin -- java -jar <folder>/TabGoblin/java-server/target/browser-context-mcp.jar --panel
```

`BCMCP_PANEL=1` in the environment the agent starts its process in does the same as the
option. The window is then there while that agent runs, and goes with the server when its last
agent has gone.

**Rebuild the server first** if your jar is from before the panel
([Updating](installation.md#updating)). An older jar does not know the option and does not
start at all: the agent then has no TabGoblin tools until the jar is rebuilt or the option is
taken out.

On the taskbar the window has the goblin for its icon; the name there is Java's. The window
takes the keyboard when it appears, as a new window does. No button in it has the keyboard
then, so a key that was on its way elsewhere presses nothing.

<img src="images/server-panel.png" width="444" alt="The server's panel: whose server it is, that the browser is connected, three sessions, the metrics, the log, and the controls">

- **Under the title:** with one agent, its name, the id it has in the popup, and its port; with
  several, how many there are; with none, that this is the one server for all your agents. An
  agent says its name when its program connects.
- **The line with the dot** says whether the extension is connected to the agent and since
  when, or why it is not; with several agents, to how many of them. The table below has each of
  its sentences. An amber box under it is a problem an agent had when it connected, such as
  that no port was free. A plain box there, while no agent is connected, says what to do:
  start your agent, and it connects by itself.
- **Sessions** are the tabs the agents have: the site, the access level, and *paused*,
  *suspended* or *blocked* where that applies. The page's title and address are not shown. Every tab is in
  the list; three show at a time, and the list scrolls where there are more. With several
  agents each has a heading over its tabs, with its id and its port, or *not connected*. A tab
  marked *any agent* is one you authorized for any agent and none has used yet: it is listed
  under each agent, and is one agent's own from that agent's first use.
- **A click on a tab,** or on an agent's heading, shows that tab or that agent alone in the two
  cards below: its metrics and its lines. It is marked, and the corner of the card says which
  one is showing. A click on it again, or
  Escape, shows all tabs again. With no tab chosen you see everything. The click changes what
  the window shows and nothing else: the server and the agent are told nothing of it.
- **Metrics** divides the time of the last tool calls into four heaps: the agent and its
  model between calls, this server, the extension and the page, and what you took to answer a
  question. Each has two numbers. *share* is its part of all that time together; *per call* is
  what a call typically takes in it, the middle one of the calls. The share says which heap is
  the largest, the time whether that is much: the agent's share is nearly always the largest,
  since a model takes seconds where the browser takes milliseconds. The pointer on a row shows
  what the heap is and its longest. A pause of more than a minute between two calls counts as
  one minute: the agent was then at something else. For one tab these are the numbers of its
  calls, with the time the agent took before each of them. The agent gets the whole in more
  detail ([tool reference](tools.md#where-the-time-went)).
- **Log** has the server's last 300 lines, with the newest in view: when the extension
  connected and left, and one line for each tool call, with the tab it ran in, the action,
  how long it took and how it ended. Nothing of a page is in it. A line that begins with `!`
  is a warning. For one tab it has the lines of that tab's calls; lines that belong to no
  tab, such as a connection made or lost, show with no tab chosen. Lines can be marked and
  copied. While you read in it, with some of it marked or scrolled up, nothing new is
  written, and the corner of the card says so: *held while you read*, with a button that says
  how many lines have come since. Press it, or scroll to the last line, and the log shows its
  newest line and goes on.
- **Connection to the browser** is a switch. Off, the server closes its connection to the
  extension and lets it in no more until you switch it on. The agent's tools then answer that
  you switched it off, and where; the popup says *Disconnected*. Switched on, the extension
  finds the server by itself within half a minute, and the agent has its tabs as before.
- **Pairing token** has a **Copy** button; while the browser holds another token, **Copy token**
  at the window's top does the same. It puts the pairing token on the clipboard, for the
  *Pairing token* field of the extension's popup, without showing it. The token leaves the
  clipboard again after a minute, and when you stop the server from the panel, unless you have
  copied something else since. A clipboard history that your system keeps is not emptied.
- **Blocked sites** names the sites no agent may work on, as many as fit in the line, those
  that block a tab of yours first; the pointer on it shows all of them and where the settings
  file is. **Edit** opens that file in
  your system's text editor ([Blocked sites](#blocked-sites)). *Every site is refused: the file
  has a mistake* means that: the amber box under the line with the dot names the mistake.
- **Stop server** ends the server in order, for every agent: each then has no TabGoblin tools
  until its program connects again. **Kill** ends the process at once, for a server that
  hangs; what it was doing in the browser then has an unknown outcome, and agents that are
  still running start the server anew at once.
  Each takes two clicks: after the first the button says *Click again*, and goes back by itself
  after four seconds.
- **The dash** at the top right puts the window away. The server keeps running, and the window
  comes back from the taskbar. Nothing closes the window for good while the server runs: Alt+F4,
  or the close button of a frame, puts it away as well.

| The line with the dot says | Because | What to do |
|---|---|---|
| *Connected to the browser since …* | The extension is connected to the agent | Nothing |
| *No agent connected* | The server runs and no agent's program has connected to it | Start your agent, or reconnect it; a server whose window you opened yourself waits until you stop it |
| *1 of 2 agents is connected to the browser*, and the like | The extension is connected to some agents and not to others. An agent's heading says *not connected*; the pointer on it says why | What the reason asks for, from the rows below |
| *Not connected: waiting for the extension* | Chrome is not running, the extension is not paired, or it has not found this server yet | Open the popup: a paired extension connects at once, and by itself within half a minute. To pair, **Copy** the token here and paste it into the popup |
| *Not connected: disconnected in the extension's popup* | You pressed *Disconnect* next to this agent. The line and the log stay as they are until you allow it again | Press *Allow again* there |
| *Not paired: the browser has another token* | The extension came with a token that is not this server's: it was mistyped, or the token was rotated | Press **Copy token** at the window's top and paste it into the popup ([step 6 of the installation guide](installation.md#6-pair-the-extension-with-the-server)) |
| *Not connected: the extension is of another version* | Jar and extension are from different builds | Rebuild both and reload the extension |
| *Switched off here: the extension is not let in* | The switch in this window is off | Switch it on |

The header and the controls are always in view. On a low screen the part between them scrolls.

The panel gives an agent nothing. Authorizing a tab, changing an access level, revoking a tab
and turning an agent away for good stay in the popup. The panel shows every agent of the server
to you, and no agent anything of another. Switching the connection off, or stopping the server, leaves
the agent's tabs authorized. What it hands out, it hands to you: the pairing token, which is
also in a file in your home folder. The rules, and where they stop, are in the
[security model](security.md#the-servers-panel).

| System | The window | Seen running |
|---|---|---|
| Windows | Without a frame of the system's; its header moves it | On Java 21 and Java 26 |
| Linux (x64), macOS (Apple silicon) | The same panel in a window with the system's frame | On Ubuntu in the Linux subsystem of Windows, without pressing its buttons. Not on another Linux desktop, not on macOS |
| Any other system, or no display | None: the server says so in its log and runs as it does without the option | Without a display, on Linux |

The window is drawn with JavaFX, which unpacks about 3 MB into the folder `.openjfx` in your
home folder the first time and writes a few lines of its own into the server's log. How the
panel is built is in the [architecture](architecture.md#the-servers-panel).

## 10. Settings

| Setting | Where | Default |
|---|---|---|
| When to ask before a submission | *Before an agent submits anything* in the popup; per session next to *Submissions* | Ask me every time |
| Indicator in the page | Switch under *Settings* in the popup | on |
| The server's panel | `--panel` / `BCMCP_PANEL=1` on the server: there from the start. `--no-panel` / `BCMCP_PANEL=0`: never by itself | off, but for the one case that brings it up |
| First port | *Connection…* in the popup; `--port` on the server | 47821 |
| Token file | `--token-file` / `BCMCP_TOKEN_FILE` | `~/.browser-context-mcp/pairing-token` |
| Blocked sites | `blocked.sites` in the settings file; **Edit** in the server's panel opens it | none |
| Settings file | `--settings` / `BCMCP_SETTINGS` | `tabgoblin.properties` beside the token file |
| Log level | `BCMCP_LOG` = `debug`, `info`, `warn`, `off` | `info` |

### Blocked sites

Sites that no agent may work on, whatever you authorize. They are one line in the server's
settings file, `tabgoblin.properties`, which lies beside the pairing token:

```properties
blocked.sites = example.org, intranet.example
```

- **To change the list,** press **Edit** next to *Blocked sites* in the
  [server's panel](#9-the-servers-panel). It opens the file in your system's text editor; if
  there is no file yet, it makes one with this line in it as a comment. You can also open the
  file yourself. A change is in force as soon as the file is saved: nothing is restarted. The
  panel shows what is blocked now.
- **An entry is a domain.** It blocks that domain with all its subdomains, on every port:
  `example.org` also blocks `mail.example.org`. Entries are separated by commas. An address you
  paste is taken down to its domain.
- **On a blocked site** the popup offers no authorization and says that the site is on your
  list. A tab you authorized before stays in the list of sessions, marked *blocked*: the
  agent's tools answer there that the site is blocked, and work again when you take it off the
  list.
- **A mistake in the file blocks every site,** so that a slip does not leave open the site you
  meant. The panel then names the mistake in an amber box, and the popup says that no agent
  can work in any tab. Mend the line, or empty it.

The list is for every agent of the server. An agent is told that the site it tried is blocked,
and never what else is on the list. What the list holds back and what it does not is in the
[security model](security.md#blocked-sites).

**Edit** was tried on Windows, where it opens Notepad. On Linux it asks `xdg-open` for an
editor and on macOS `open -t`; neither was tried. Where no editor starts, the panel's log says
so, and the pointer on **Edit** shows where the file is.
