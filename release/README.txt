TabGoblin

A browser bridge for AI agents: it lets the agents on your machine read and operate the Chrome
tabs you authorize, and nothing else of your browser. An agent uses it by running commands (the
CLI) or through MCP; it does not need MCP.

What is in this folder

  tabgoblin                  (tabgoblin.cmd on Windows) starts the server for you: setup, the server's window, the token;
                             and runs one tool as a command, for an agent that has a terminal and no MCP
  TabGoblin.exe              Windows, to double-click: opens the server's window, and starts the server if none runs
  tabgoblin-token.cmd        Windows, to double-click: shows the pairing token for the extension's popup
  tabgoblin.jar    the server
  app                        Windows: the settings of TabGoblin.exe, which name the jar
  runtime                    the Java the server runs on; nothing has to be installed
  extension                  the Chrome extension, to be loaded unpacked
  docs                       the documentation for this version, to read offline: start with
                             docs/installation.md; README.md beside this file is the overview
  LICENSE                    the licence

Set it up, once

  1. Put this folder where it can stay: your agent is told its place.

  2. In a terminal in this folder, run setup for your agent, which is one of claude-code, codex
     and copilot. Choose how the agent is to reach TabGoblin:

         tabgoblin --setup claude-code --mode cli  the CLI: the agent runs tabgoblin commands
         tabgoblin --setup claude-code             MCP: the agent gets TabGoblin's tools

     (On Linux and macOS: ./tabgoblin.) It installs the skill that tells the agent how to use
     the tools, and prints the three things that are left for you, with this folder's own
     paths: the command the agent runs (CLI) or the line that tells your agent about the
     server (MCP), how to load the extension into Chrome, and how to pair the two.

  3. Do those three. Then start your agent anew and ask it for the browser status: from then on
     the popup lists it. Open a website, click the goblin on that tab, choose the agent if the
     popup offers a choice, press Authorize, and ask for the status again.

The CLI

  Any agent that can run a command can use TabGoblin, with or without MCP:

         tabgoblin tools                           the commands
         tabgoblin status --agent my-agent         is the browser connected, which tabs are mine

  Each command is one tool, under the same rules as through MCP, and prints one JSON object.

Update

  Unpack a newer download over this folder. Then press the reload arrow on TabGoblin's card at
  chrome://extensions, and start your agent anew. Nothing has to be set up again: the paths are
  the same.

More

  tabgoblin --help                          every command
  docs/installation.md, docs/developer-guide.md, docs/cli.md   in this folder, for this version;
  the newest at https://github.com/LaughingManCommits/TabGoblin/blob/main/docs/installation.md
