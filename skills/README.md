# Skills for agents that use TabGoblin

A skill is a folder with a `SKILL.md` in it: instructions that an agent loads when a task calls
for them. These three tell an agent how to work with TabGoblin's tools: how to get a tab
authorized, how to read a long page, how to act and to submit, and what to do when a tool
refuses. The server itself tells every agent a few lines of this when it connects; a skill has
room for the rest.

There is one for each of three agents. They follow the same open format
([agentskills.io](https://agentskills.io/specification)), and each agent looks for skills in a
place of its own:

| Agent | The skill here | For you, in every project | For one project |
|---|---|---|---|
| Claude Code | `claude-code/tabgoblin/` | `~/.claude/skills/tabgoblin/` | `.claude/skills/tabgoblin/` |
| Codex | `codex/tabgoblin/` | `~/.agents/skills/tabgoblin/` | `.agents/skills/tabgoblin/` |
| GitHub Copilot | `copilot/tabgoblin/` | `~/.copilot/skills/tabgoblin/` | `.github/skills/tabgoblin/` |

`~` is your home folder.

## Install one

The server's jar carries the three skills and puts one in its place for you, in every project:

```sh
java -jar java-server/target/browser-context-mcp.jar --install-skill claude-code
```

with `claude-code`, `codex` or `copilot`. It says where it put the skill. Run again when the
skill is there already, it writes nothing. If a skill of that name is there and is not this one,
yours perhaps, it is left as it is and the command says so; `--replace` after the agent's name
overwrites it. Files in that folder that the skill does not have are not touched.

For one project, copy the skill's folder into that project yourself, with its name kept: the
folder has to be called `tabgoblin`, as the skill is. For Claude Code, from the folder you
cloned TabGoblin into:

```sh
mkdir -p <your project>/.claude/skills
cp -r skills/claude-code/tabgoblin <your project>/.claude/skills/
```

Start the agent again if it does not show the skill. A skill does not add the server: the
agent has to know TabGoblin's MCP server first
([installation, step 5](../docs/installation.md#5-tell-your-agent-about-the-server)).

## What is the same and what is not

The three say the same about TabGoblin. That part begins at "Start with the status" and is word
for word the same in all of them; a test of the server's suite (`SkillsTest`) fails when one of
them drifts from the others, when a skill names a tool the server does not have or leaves one
out, and when it names an error code that the [tool reference](../docs/tools.md#errors) does
not know. What differs is each one's head:

- **Claude Code:** the tools' names as Claude Code has them, and what to ask the user for when
  the server is not connected. Its front matter has `when_to_use`, which Claude Code reads
  beside the description.
- **Codex:** how the skill is asked for by name, and `agents/openai.yaml`, where Codex reads how
  to show the skill and that it may use it without being asked.
- **GitHub Copilot:** `argument-hint` in its front matter, which Copilot shows when the skill is
  called as a command.

## What was checked, and what was not

The places and the fields are from each agent's own documentation, read on 2026-11-22. The
command was run with the built jar on Windows, against a home folder made for the purpose:
each of the three skills went to its place, file for file. None of the three skills has been
loaded in its agent yet. What an agent then does with it was not
tried either. How the server is added to Codex and to Copilot could not be read from their
documentation that day; the installation guide's general row applies: a command, `java`, with
the arguments `-jar` and the path of the jar.

The skills say what the tools do in fewer words than the [tool reference](../docs/tools.md),
which stays the place where each tool's text is written down. Where the two differ, the tool
reference is right and the skill has to be mended.
