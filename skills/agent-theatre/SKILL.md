---
name: agent-theatre
description: Use when the user wants to watch, replay, record or share what a coding agent did in this repo — "open the stage", "show me the theatre", "replay the last session", "export a clip of this run", "why can't I see the agent working". Also use when the stage looks empty or stuck.
---

# Agent Theatre

Agent Theatre turns a Claude Code session into an animated scene: the repo is a stage (folders are
districts, files are buildings, test files are beacons), the agent is a character who walks to what it
reads, builds on what it edits, runs tests at the beacons and chases gremlins when they fail. If the
agent claims success with no passing test since its last edit, a gremlin hides behind it.

Everything is local. Events carry repo-relative paths and counts — never file contents, prompts or
command bodies. The stage listens only on 127.0.0.1.

## Commands

| Need | Do |
|---|---|
| Open the live stage for this repo | `npx -y agent-theatre@latest --no-open` (background) → open the printed URL. `/theatre` does this. |
| Replay a past session of this repo | `npx -y agent-theatre@latest replay --latest`, or without `--latest` to pick |
| Check the hooks | `npx -y agent-theatre@latest hooks status` (this plugin installs them; the CLI's `hooks install` is only for people without the plugin) |
| VS Code | the extension's *Agent Theatre: Open the stage (live)* command; `.vsix` on every GitHub release, Marketplace listing pending |

## When the stage looks wrong

- **Empty / "Waiting for a Claude Code session in X"**: the stage watches the folder it was started in. If Claude Code is working in another folder, the stage says so and gives the exact `cd … && npx agent-theatre` to run. Each stage keeps only its own repo's events.
- **"quiet — no events for 90 s"**: no hook events arrived for 90 s while a session is open. Not an error; the next tool call clears it.
- **Several stages at once** (browser + VS Code + another repo): all receive events; each stage registers in `~/.agent-theatre/ports/`.
- **The end card ("Every agent run has a story")** only appears in replays. A live stage never ends.

## In the stage

Hover any building, beacon, the forge, the dock or a character for what it is and what happened to it
this session. **Whole repo** pulls back (wheel to zoom); **Go live** returns to now after scrubbing;
**Export clip** records what you see and hear to mp4/webm with a share sheet. Sound is off until the
person turns it on (Effects / Ambience).

When the agent needs the person (permission, a question) the stage says so and points back to Claude
Code; the stage itself never prompts.

## Links

Site and episodes: https://agenttheatre.dev · Source: https://github.com/shreyassaw5394/agent-theatre ·
Discord: https://discord.gg/PPGeQWd7r
