# agent-theatre

**Watch your coding agent work — as a film, not a log.**

Agent Theatre turns a Claude Code session into an animated scene. Your repo becomes a stage — folders are districts, files are buildings, test files are beacons — and the agent is a character who walks to the files it reads, builds on the files it edits, runs tests at the beacons and chases gremlins when they fail. Twenty stages, a cast of twelve, every claim checked: **if the agent says it's done but no test has passed since the last edit, a gremlin hides behind it.**

Site and playable episodes: **https://agenttheatre.dev**

## Install

```sh
cd your-repo
npx agent-theatre hooks install   # once: adds hooks to ~/.claude/settings.json (backup kept)
npx agent-theatre                 # opens the stage for this repo; run Claude Code in another terminal
```

Node 22+. Works with the Claude Code CLI, desktop app and IDE extensions — anything that runs hooks. Hooks are picked up without restarting Claude Code.

## Commands

| Command | What it does |
|---|---|
| `agent-theatre` | Start the local server for the current repo and open the stage (live). `--port <n>`, `--no-open`, `--set <id>` |
| `agent-theatre replay [session]` | Replay a past Claude Code session of this repo; no argument lists them, `--latest` picks the newest |
| `agent-theatre hooks install` | Add the hooks to `~/.claude/settings.json` (non-destructive, backup at `settings.json.bak-agent-theatre`) |
| `agent-theatre hooks uninstall` | Remove them, byte-for-byte |
| `agent-theatre hooks status` | Show whether they are installed |

Stage ids: `island orbit metropolis harbour observatory greenhouse workshop arcade kingdom outpost snowfield canopy lagoon volcano cloudtop reef bazaar monastery moonbase lanterns`. The picker suggests the ones that fit your repo.

## MCP

`agent-theatre serve` runs an MCP server over stdio (tools: `open_stage`, `list_sessions`, `replay_session`, `stage_status`, `install_hooks`). `agent-theatre init` registers it with Claude Code, Claude Desktop, Cursor, Windsurf, Codex and Gemini CLI; `init --repo` writes the repo-level files instead.

## Privacy

Runs entirely on your machine and listens only on `127.0.0.1`. Events carry repo-relative paths, line counts, a command's first word and a classified intent — never file contents, prompts, command bodies or search queries. A test in the repo plants marker strings in all of those and asserts zero leaks. Paths outside the repo appear as `//ext/<name>`; your home directory as `~/`. The hook always exits 0 and never blocks a tool call.

## VS Code

The same stage inside the editor: the `.vsix` is attached to every [GitHub release](https://github.com/shreyassaw5394/agent-theatre/releases).

## Library

```ts
import { Theatre, scanRepo, repoIdFor, listSessions, installHooks } from "agent-theatre";
const t = new Theatre({ cwd, repoId: repoIdFor(cwd), files: scanRepo(cwd) });
await t.listen(0); // t.url → http://127.0.0.1:<port>/
```

MIT · source: https://github.com/shreyassaw5394/agent-theatre

Community: https://discord.gg/PPGeQWd7r

## Other ways in

- **Claude Code plugin:** `/plugin install agent-theatre --marketplace shreyassaw5394/agent-theatre` — hooks, a `/theatre` command and a skill.
- **Homebrew:** `brew install shreyassaw5394/tap/agent-theatre`
