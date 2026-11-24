TabGoblin

Lets the AI agents on your machine read and operate the Chrome tabs you authorize, and nothing
else of your browser.

What is in this folder

  tabgoblin                  (tabgoblin.cmd on Windows) starts the server for you: setup, the server's window, the token
  browser-context-mcp.jar    the server
  runtime                    the Java the server runs on; nothing has to be installed
  extension                  the Chrome extension, to be loaded unpacked
  LICENSE                    the licence

Set it up, once

  1. Put this folder where it can stay: your agent is told its place.

  2. In a terminal in this folder, run setup for your agent, which is one of claude-code, codex
     and copilot:

         tabgoblin --setup claude-code             on Windows
         ./tabgoblin --setup claude-code           on Linux and macOS

     It installs the skill that tells the agent how to use the tools, and prints the three
     things that are left for you, with this folder's own paths: the line that tells your agent
     about the server, how to load the extension into Chrome, and how to pair the two.

  3. Do those three. Then start your agent anew, open a website, click the goblin on that tab,
     press Authorize, and ask the agent for the browser status.

Update

  Unpack a newer download over this folder. Then press the reload arrow on TabGoblin's card at
  chrome://extensions, and start your agent anew. Nothing has to be set up again: the paths are
  the same.

More

  tabgoblin --help                          every command
  The installation guide and the developer guide:
  https://github.com/LaughingManCommits/TabGoblin/blob/main/docs/installation.md
