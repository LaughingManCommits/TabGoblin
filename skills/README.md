# Skills for agents that use TabGoblin

A skill is a folder with a `SKILL.md` in it: instructions that an agent loads when a task calls
for them. These six, three for MCP and three for the command line, tell an agent how to work with TabGoblin's tools: how to get a tab
authorized, how to read a long page, how to act and to submit, and what to do when a tool
refuses. TabGoblin itself tells every agent a few lines of this (an MCP client when it connects,
a CLI agent in `tabgoblin tools --json`); a skill has room for the rest.

They are in two folders, by the way an agent reaches the tools: `mcp/` for an agent that has
TabGoblin's MCP tools, and `cli/` for one that runs the same tools as commands in a terminal
([below](#the-skills-for-the-command-line)). In each there is one for each of three agents.
They follow the same open format
([agentskills.io](https://agentskills.io/specification)), and each agent looks for skills in a
place of its own:

| Agent | The skills here | For you, in every project | For one project |
|---|---|---|---|
| Claude Code | `mcp/claude-code/tabgoblin/`, `cli/claude-code/tabgoblin/` | `~/.claude/skills/tabgoblin/` | `.claude/skills/tabgoblin/` |
| Codex | `mcp/codex/tabgoblin/`, `cli/codex/tabgoblin/` | `~/.agents/skills/tabgoblin/` | `.agents/skills/tabgoblin/` |
| GitHub Copilot | `mcp/copilot/tabgoblin/`, `cli/copilot/tabgoblin/` | `~/.copilot/skills/tabgoblin/` | `.github/skills/tabgoblin/` |

`~` is your home folder.

## Install one

The server's jar carries the six skills and puts one in its place for you, in every project:

```sh
java -jar java-server/target/tabgoblin.jar --install-skill claude-code
```

with `claude-code`, `codex` or `copilot`. It says where it put the skill. `--setup` with
the same name does this as its first step, and goes on to say how the agent is told about the
server ([installation guide](../docs/installation.md#from-a-download)). Run again when the
skill is there already, it writes nothing. If a skill of that name is there and is not this one,
yours perhaps, it is left as it is and the command says so; `--replace` after the agent's name
overwrites it. Files in that folder that the skill does not have are not touched.

For one project, copy the skill's folder into that project yourself, with its name kept: the
folder has to be called `tabgoblin`, as the skill is. For Claude Code, from the folder you
cloned TabGoblin into:

```sh
mkdir -p <your project>/.claude/skills
cp -r skills/mcp/claude-code/tabgoblin <your project>/.claude/skills/
```

Start the agent again if it does not show the skill. A skill for MCP does not add the server:
the agent has to know TabGoblin's MCP server first
([installation](../docs/installation.md#mcp)). A skill for the CLI
needs nothing registered, only that the agent finds the `tabgoblin` command.

## The skills for the command line

An agent without MCP runs the same tools as commands in a terminal
([the command line](../docs/cli.md)), and has a skill of its own for
that, in `cli/`: `cli/claude-code/tabgoblin/`, `cli/codex/tabgoblin/` and
`cli/copilot/tabgoblin/`. It says the same about tabs, access levels, submissions and refusals,
in terms of commands: `tabgoblin snapshot --interactive-only` where the other says
`browser_snapshot` with `interactive_only: true`, the JSON answer, the exit codes, and that
every command names its agent. It names no MCP tool, and the skill for MCP names no command.

```sh
java -jar java-server/target/tabgoblin.jar --install-skill claude-code --mode cli
```

`--setup <agent> --mode cli` does the same as its first step. The two skills of an agent have
one name and one place, so an agent has the one for the way it was set up, and not both:
installing either takes the other's place without `--replace` when the other is of the same
version; one from an older version needs `--replace`. A skill of that name that is neither is left as it is, as above. Each skill tells its
agent not to go over to the other way by itself.

## What is the same and what is not

The three for MCP say the same about TabGoblin, and so do the three for the command line among
themselves. That part begins at "Start with the status" and is word for word the same in the
three of a kind; a test of the server's suite (`SkillsTest`) fails when one of
them drifts from the others, when a skill names a tool the server does not have or leaves one
out, and when it names an error code that the [tool reference](../docs/tool-reference.md#errors) does
not know. For the command line it also fails when a skill names an option that no command has,
or an MCP tool. What differs is each one's head:

- **Claude Code:** the tools' names as Claude Code has them, and what to ask the user for when
  the server is not connected. Its front matter has `when_to_use`, which Claude Code reads
  beside the description.
- **Codex:** how the skill is asked for by name, and `agents/openai.yaml`, where Codex reads how
  to show the skill and that it may use it without being asked.
- **GitHub Copilot:** `argument-hint` in its front matter, which Copilot shows when the skill is
  called as a command.

## What was checked, and what was not

`SkillsTest` holds the six skills to the server's tools, to the tool reference's error codes and
to each other, and checks that `--install-skill` puts each one in its place. The places and the
front-matter fields follow each agent's own documentation. The line `--setup` prints for adding
the server to Claude Code has been run; the lines for Codex and GitHub Copilot follow their
documentation and have not been run. No agent has yet been observed working with a skill for
the command line.

The skills say what the tools do in fewer words than the [tool reference](../docs/tool-reference.md),
which stays the place where each tool's text is written down. Where the two differ, the tool
reference is right and the skill has to be mended.
