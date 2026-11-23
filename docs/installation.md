# Installation

There are two ways to get TabGoblin:

- **A download** with everything inside. Nothing is installed first and nothing is built. That
  is the next section.
- **A build from source**, for those who work on TabGoblin, or want to build what they run. That
  is the rest of the page.

Either way three things get set up: the server, a Java program your AI agent starts; the
extension, TabGoblin in Chrome; and the link between them, which is your agent's MCP settings
and a pairing token.

## From a download

You need Google Chrome 120 or newer, and an agent that speaks MCP. The Java the server runs on
is in the download.

1. **Download** the file for your system from the [latest release](https://github.com/LaughingManCommits/TabGoblin/releases/latest),
   and unpack it where it can stay: your agent is told its place. It is one folder, `tabgoblin`.

   | System | File |
   |---|---|
   | Windows, x64 | `tabgoblin-<version>-windows-x64.zip` |
   | Linux, x64 | `tabgoblin-<version>-linux-x64.tar.gz` |
   | macOS, Apple silicon | `tabgoblin-<version>-macos-arm64.tar.gz` |

2. **Run setup** for your agent, in a terminal in that folder. The agent is one of
   `claude-code`, `codex` and `copilot`:

   ```sh
   tabgoblin --setup claude-code
   ```

   On Linux and macOS it is `./tabgoblin --setup claude-code`. Setup installs the agent's
   [skill](../skills/README.md), which tells it how to use the tools, and prints the three
   things that are left, with your folder's own paths. It runs no other program and writes
   nothing else. The three things are the next three steps.

3. **Tell your agent about the server.** Run the line that setup printed. It is the agent's own
   command for adding a server, and looks like this for Claude Code:

   ```text
   claude mcp add --scope user tabgoblin -- "<folder>\tabgoblin\runtime\bin\java.exe" -jar "<folder>\tabgoblin\browser-context-mcp.jar"
   ```

   An agent that setup does not know takes the same command in its MCP settings:
   [step 5](#5-tell-your-agent-about-the-server) has the forms.

4. **Load the extension in Chrome**, as in [step 4](#4-load-the-extension-in-chrome), with the
   folder `extension` of the download.

5. **Pair**, once. `tabgoblin --panel` opens the server's window. Press **Copy** next to
   *Pairing token* there, click the goblin in Chrome's toolbar, paste the token into **Pairing
   token** and press **Save and connect**. More in
   [step 6](#6-pair-the-extension-with-the-server).

6. **Check that it works**, as in [step 7](#7-check-that-it-works).

Where another page names `java -jar java-server/target/browser-context-mcp.jar`, a download
has `tabgoblin` in its place: `tabgoblin --panel`, `tabgoblin --show-token`, `tabgoblin --help`.

**To update,** unpack a newer download over the same folder, press the reload arrow on
TabGoblin's card at `chrome://extensions`, and start your agent anew. The paths are the same,
so nothing is set up again. The server and the extension have to be of the same release.

**To check a download:** each release has a file `SHA256SUMS.txt` with the SHA-256 of every
download, and GitHub attests that each was built by this repository's release workflow from the
release's tag:

```sh
gh attestation verify tabgoblin-<version>-windows-x64.zip --repo LaughingManCommits/TabGoblin
```

**What is known of the downloads.** The one for Windows was made on Windows 11 and used there:
setup, the line for Claude Code in Command Prompt and in PowerShell, the server and its window
on the runtime that is inside, and the whole end-to-end suite on that runtime. The one for
Linux was made and used in Ubuntu under Windows' Linux subsystem, on a machine without Java:
setup, and the server as an agent starts it. Its window was not seen there, though the server
said it had shown it; and a server started with `tabgoblin --panel` ended when its terminal
was closed, where the command says that it stays. The one for macOS was made on GitHub's
machine, where the server started on the runtime that is inside; nobody has used it on a Mac.
The first release, 0.2.0, is of 2026-11-23. Its downloads are as GitHub's machines made them,
and none of the three has been used by a person yet. None is signed for Windows or macOS:
either system may warn before it runs what is in a download.

## From source

Allow about ten minutes. Every command below is run from the folder you cloned the project into,
and each is on its own line so it works the same in PowerShell, Command Prompt and bash.

## Before you start

| You need | Version | Check with | Get it from |
|---|---|---|---|
| Java (JDK) | 21 or newer | `java -version` | [adoptium.net](https://adoptium.net) |
| Maven | 3.8 or newer | `mvn -v` | [maven.apache.org](https://maven.apache.org/download.cgi) |
| Node.js | 24 or newer | `node -v` | [nodejs.org](https://nodejs.org) |
| Google Chrome | 120 or newer | `chrome://version` | – |
| Git | any | `git --version` | [git-scm.com](https://git-scm.com) |

`mvn -v` also prints which Java it uses. It has to be 21 or newer too.

## 1. Get the code

```sh
git clone https://github.com/LaughingManCommits/TabGoblin.git
cd TabGoblin
```

## 2. Build the server

```sh
mvn -f java-server/pom.xml package
```

This compiles the server, runs its tests and packages everything into one file. The first run
downloads libraries and takes a minute or two. It is done when you see:

```text
[INFO] BUILD SUCCESS
```

The result is **`java-server/target/browser-context-mcp.jar`**. To skip the tests, add
`-DskipTests`.

## 3. Build the extension

```sh
cd chrome-extension
npm install
npm run build
cd ..
```

It is done when you see the three bundles listed, each with its size: `dist\content.js`,
`dist\background.js` and `dist\popup.js`.

The result is the folder **`chrome-extension/dist`**. That folder, not `chrome-extension` itself,
is what Chrome loads.

`npm install` may warn that an install script of `esbuild` was blocked. The build works without it.

## 4. Load the extension in Chrome

1. Open a new tab and go to `chrome://extensions`.
2. Switch on **Developer mode** (top right).
3. Click **Load unpacked** (top left).
4. Choose the folder `chrome-extension/dist` inside the project and confirm.

TabGoblin now appears in the list:

<img src="images/install-extensions-page.png" width="760" alt="Chrome's extensions page with TabGoblin loaded">

Check two things on its card:

- **The ID is `hipkpjlbggddmiognhmjnfihcgimjfop`.** The server only accepts connections from this
  extension, and the ID is fixed by the project, so it is the same on every machine.
- **There is no red *Errors* button.** If there is, see [Problems](#problems).

Then pin it: click the puzzle-piece icon in Chrome's toolbar and press the pin next to TabGoblin,
so the goblin is always visible. You will click it on every tab you want an agent to work in.

## 5. Tell your agent about the server

Your agent starts the server itself; you only tell it how. Use the **absolute path** of the jar,
with forward slashes, also on Windows. In the examples, `<folder>` stands for the folder you
cloned the project into; write yours in its place (`D:/code`, for example).

Most MCP clients take this JSON:

```json
{
  "mcpServers": {
    "tabgoblin": {
      "command": "java",
      "args": ["-jar", "<folder>/TabGoblin/java-server/target/browser-context-mcp.jar"]
    }
  }
}
```

| Agent | Where it goes |
|---|---|
| IntelliJ IDEA, AI Assistant | *Settings → Tools → AI Assistant → Model Context Protocol (MCP) → Add*, paste the JSON. The menu names vary a little between versions. |
| Claude Code | `claude mcp add tabgoblin -- java -jar <folder>/TabGoblin/java-server/target/browser-context-mcp.jar` |
| Anything else that speaks MCP over stdio | Command `java`, arguments `-jar` and the path |

Restart the agent, or reload its MCP servers, so it picks the server up. You can connect several
agents this way, up to eight at once: each starts the jar, the first of them starts the one
server, and the others connect to it.

The server tells an agent in a few lines how to use its tools. For Claude Code, Codex and GitHub
Copilot there is more, as a skill to put where the agent looks for skills: how to read a long
page, what to ask you for, what to do when a tool refuses. It is optional, and one command puts
it in place, with `claude-code`, `codex` or `copilot`:

```sh
java -jar <folder>/TabGoblin/java-server/target/browser-context-mcp.jar --install-skill claude-code
```

What the skills say, and where each agent keeps them, is in [skills](../skills/README.md).

A server has no window. With `--panel` as a further argument it shows a small one, with its
sessions, its log and a button to stop it: see
[the server's panel](user-guide.md#9-the-servers-panel).

## 6. Pair the extension with the server

The extension only talks to servers that know a secret token. Print it:

```sh
java -jar java-server/target/browser-context-mcp.jar --show-token
```

```text
Pairing token: 3f9c…  (64 characters)
Port:          47821
```

Click the goblin in Chrome's toolbar, paste the token into **Pairing token**, leave the port as it
is, and press **Save and connect**.

A server that shows [its panel](user-guide.md#9-the-servers-panel) saves you the command: its
**Copy** button puts the token on the clipboard.

<img src="images/popup-pairing.png" width="354" alt="The popup before pairing">

The token is created on first use and kept in `.browser-context-mcp/pairing-token` in your home
folder. You pair once; it stays valid until you rotate it.

## 7. Check that it works

1. Make sure your agent is running, so its server is up. The line under *TabGoblin* in the popup
   should read **1 agent connected**.
2. Open any website, click the goblin on that tab, choose **Read**, and press **Authorize**.
3. Ask your agent: *"Call browser_status."* It should answer along these lines:

   ```text
   Extension: connected (protocol 2)
   Sessions: 1
   Session s1
     Authorized origin: https://example.com
     Access: read only
   ```

4. Ask it: *"Take a browser snapshot and tell me what is on the page."*

That is the whole chain working. The [user guide](user-guide.md) takes it from here.

## Updating

After pulling a new version:

```sh
mvn -f java-server/pom.xml package
cd chrome-extension
npm install
npm run build
cd ..
```

Then press the **reload** arrow on TabGoblin's card at `chrome://extensions`, and restart your
agent so it starts the new server. Server and extension must come from the same version; if they
do not, the popup says *Server and extension versions differ*. The pairing survives an update.

## Uninstalling

1. At `chrome://extensions`, press **Remove** on TabGoblin's card.
2. Remove the `tabgoblin` entry from your agent's MCP settings.
3. Delete the folder `.browser-context-mcp` in your home folder (it holds the token and your settings).
4. Delete the project folder.

## Problems

| What happens | Why | What to do |
|---|---|---|
| `mvn` reports *release version 21 not supported* | Maven runs on an older Java | Point `JAVA_HOME` at a JDK 21 or newer; check with `mvn -v` |
| `mvn` or `java` *is not recognized* | Not installed or not on the `PATH` | Install it and open a new terminal |
| `npm run build` cannot find `esbuild` | `npm install` did not finish | Run `npm install` again in `chrome-extension` |
| Chrome says *Manifest file is missing or unreadable* | The wrong folder was chosen | Choose `chrome-extension/dist`, and build first |
| **Load unpacked** is not there | Developer mode is off | Switch it on, top right |
| Developer mode or loading is blocked | A managed (work) browser forbids unpacked extensions | Ask your administrator, or use a personal Chrome profile |
| The extension's ID is different | The `key` in `chrome-extension/manifest.json` was changed or removed | Restore it; or start the server with `--extension-origin any` |
| Agent: *Could not listen on any of ports 47821-47828* | Eight servers are already running, or other programs hold those ports | Close unused agents, or start the server with `--port` and set the same *First port* in the popup under *Connection…* |

What the popup and the agent say once everything is installed (*Disconnected*, *Paste the server's current token*,
"not connected") is in the user guide's [troubleshooting](user-guide.md#7-troubleshooting).

Chrome is the only browser this has been run in. Other Chromium browsers may work but are untested.
