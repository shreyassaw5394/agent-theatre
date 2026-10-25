# Agent Theatre

**Watch your coding agent work — as a film, not a log.**

Agent Theatre turns a Claude Code session into an animated scene. Your repo becomes a stage:
folders are districts, files are buildings, test files are beacons. The agent is a character —
one of a cast of twelve — who walks to the files it reads, builds on the files it edits, runs
tests at the beacons, and chases bug gremlins when they fail. Subagents arrive at the dock as
other members of the cast. Live, or replayed from any past session.

**Twenty stages.** Agent Theatre reads what your repo is — a web app, a backend, a CLI, data
work, a game, infrastructure — and suggests the stages that suit it: Island, Orbit, Metropolis,
Harbour, Observatory, Greenhouse, Workshop, Arcade, Kingdom, Outpost, Snowfield, Canopy,
Lagoon, Volcano, Cloudtop, Reef, Bazaar, Monastery, Moonbase, Lanterns. Or hit *Surprise me*.

And one honest detail no other visualiser has: **if the agent says the job is done but no test
has passed since the last edit, a gremlin hides behind it.**

![Orbit: Rook working on login.ts](docs/img/orbit-rook.png)

| | | |
|---|---|---|
| ![Lanterns, Juno](docs/img/lanterns-juno.png) | ![Volcano, Ember](docs/img/volcano-ember.png) | ![Harbour, Mo and a helper at the dock](docs/img/harbour-mo-helper.png) |

*Same session, different stages, different leads. The picker reads your repo and suggests three.*

![The set picker](docs/img/picker.png)

## Status

Milestone 5 of 6 — core, world, director, renderer and the CLI (live via hooks, replay of real
sessions) work end-to-end; the live path is verified with a real Claude Code session. Not on npm
yet; the VS Code extension is milestone 6. See [docs/design.md](docs/design.md).

To run it today from a checkout:

```sh
npx pnpm install && npx pnpm build
node packages/cli/dist/cli.js hooks install     # once
cd ~/your-repo && node ~/agent-theatre/packages/cli/dist/cli.js          # live
node ~/agent-theatre/packages/cli/dist/cli.js replay --latest            # replay
```

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
4. **Renderer.** PixiJS, isometric, soft lighting, easing everywhere — no linear tween exists
   in the codebase, a test makes sure. The camera frames the action; the whole stage appears
   only to open, celebrate and close, so it never gets cluttered. `prefers-reduced-motion`
   respected. Twenty stages on shared geometry; a cast of twelve characters from one procedural
   routine.
5. **Sound.** Every beat has a sound, all synthesized at runtime with the Web Audio API — no
   audio files, no licences to worry about. Effects and background ambience toggle separately.
   The "needs your permission" chime is the one you'll notice.

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
