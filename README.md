# Agent Theatre

**Watch your coding agent work — as a film, not a log.**

Agent Theatre turns a Claude Code session into an animated scene. Your repo becomes a small
island: folders are districts, files are buildings, test files are lighthouses. The agent is
**Pip**, a character who walks to the files it reads, builds on the files it edits, runs tests
at the lighthouses, and chases bug gremlins when they fail. Live, or replayed from any past
session.

And one honest detail no other visualiser has: **if Pip says the job is done but no test has
passed since the last edit, a gremlin hides behind it.**

> ![Episode 1 — The Login Timeout](docs/episode-1.gif)
> *(GIF placeholder — rendered by the real renderer in milestone 4)*

## Status

Milestone 1 of 6 — core event schema and adapters (hooks + transcripts), fully tested.
Not yet installable. Follow the milestones in [docs/design.md](docs/design.md).

## Install (soon)

```sh
npx agent-theatre            # in any repo: opens the island, animates the live session
npx agent-theatre replay     # pick a past session for this repo and watch it
npx agent-theatre hooks install   # one-time; non-destructive; `uninstall` reverses it
```

Or install the **Agent Theatre** VS Code extension (same renderer, same privacy).

## How it works

```
Claude Code ──hooks──▶ agent-theatre (local) ──WebSocket──▶ browser / VS Code webview
     │                        │
     └─ JSONL transcript ─────┘  (replay)
```

1. **Events.** Hook payloads (live) or transcript rows (replay) are normalised into a small,
   product-agnostic `AgentEvent` schema: `read_file`, `edit_file (+n −m)`, `run_command
   (intent)`, `test_result`, `subagent_start/stop`, `waiting_for_user`, `turn_end`, …
2. **Island.** The repo's file tree becomes a deterministic layout (same repo → same island),
   capped to ~60 buildings by relevance; every file the session touches is always placed.
3. **Director.** Events become scene beats — `walk_to`, `build`, `run_tests`, `spawn_gremlin`,
   `chase`, `celebrate`, `unverified_claim` — with a mood: curious, focused, lost, happy.
4. **Renderer.** PixiJS, isometric, soft lighting, easing everywhere, 60 fps with 60 buildings,
   `prefers-reduced-motion` respected. Three selectable **sets** — Island, Orbit, Metropolis —
   same story, different stage.
5. **Sound.** Every beat has a sound, all synthesized at runtime with the Web Audio API — no
   audio files, no licences to worry about. The "Pip needs you" chime is the one you'll notice.

## Privacy

Everything stays on your machine. The event stream never contains code, prompts, command text
or search queries — only repo-relative paths, counts, a command's first word and a classified
intent. This is a tested invariant (`packages/core/tests/privacy.test.ts` plants secrets in a
fixture session and asserts none reach the stream).

| | Read | Rendered | Leaves the machine |
|---|---|---|---|
| File paths | yes | repo-relative | never |
| File contents | counted only (±lines) | no | never |
| Prompts / agent messages | tail scanned for a success claim | no | never |
| Command text | first word + classified intent + redirect targets | no | never |
| Test output | summary counts only | pass/fail | never |
| Telemetry | — | — | none, ever |
| Audio | — | synthesized, no files | never |

The server binds to `127.0.0.1` only. Hooks exit 0 and never block or slow your agent.

## Repo layout

`packages/core` (schema, adapters, island, director — no DOM, no fs) ·
`packages/cli` · `packages/web` · `packages/vscode` · `fixtures/` (synthetic sessions).

## Site

The story lives at **[agenttheatre.dev](https://agenttheatre.dev)** (agenttheatre.com redirects there).

## License

MIT © 2026 Shreyas Sawant and Agent Theatre contributors.
