One download for each system. Nothing has to be installed first: the Java the server runs on is inside, and so is the Chrome extension.

| System | Download |
|---|---|
| Windows, x64 | `tabgoblin-VERSION-windows-x64.zip` |
| Linux, x64 | `tabgoblin-VERSION-linux-x64.tar.gz` |
| macOS, Apple silicon | `tabgoblin-VERSION-macos-arm64.tar.gz` |

Unpack it where it can stay, and in its folder run setup for your agent (`claude-code`, `codex` or `copilot`): `tabgoblin --setup claude-code --mode cli` for an agent that runs `tabgoblin` commands in a terminal, or `tabgoblin --setup claude-code` for an agent that uses MCP. An agent does not need MCP to use TabGoblin. Setup installs the agent's skill and prints what is left to do, with the folder's own paths. Every step is in the [installation guide](https://github.com/REPOSITORY/blob/TAG/docs/installation.md).

To update, unpack the new download over the old folder, press the reload arrow on TabGoblin's card at `chrome://extensions`, and start your agent anew.

**Checking a download.** `SHA256SUMS.txt` has the SHA-256 of each file. GitHub attests that each was built by this repository's release workflow. The run it names was started on the commit before this tag's, which differs from the tagged one in the version only:

```sh
gh attestation verify tabgoblin-VERSION-windows-x64.zip --repo REPOSITORY
```

**What it is built from.** `tabgoblin-VERSION-server.cdx.json` lists the libraries in the server's jar, and `tabgoblin-VERSION-extension.cdx.json` the tools the extension is built with, none of which is in the extension. Both are in the CycloneDX format, and both are in `SHA256SUMS.txt`.

The downloads are not signed for Windows or macOS. Either system may warn before it runs what is in them.
