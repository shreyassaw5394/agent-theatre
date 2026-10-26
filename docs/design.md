# Agent Theatre — implementation plan

## Context

Agent Theatre turns a Claude Code session into an animated scene: the repo is an
island (folders → districts, files → buildings, tests → lighthouses), the agent is
a character, Pip, who walks to files it reads, builds on files it edits, runs
tests at lighthouses and chases gremlins when they fail. Open source (MIT), local
only, no code or prompts ever leave the machine.

It is a new sibling project at `~/agent-theatre`, next to `~/dea` (Debug
Anything) and `~/cardgame` (Glitchborn). It must be architected from day one so
the same renderer ships as a **VS Code extension**, not just a CLI.

**Milestone 1 goal:** `npx agent-theatre` in any repo → browser opens → a live or
replayed Claude Code session animates on an island generated from that repo.

**Name:** Agent Theatre (final, British spelling). Checked 2026-10-24: npm
`agent-theatre` free, GitHub `shreyassaw5394/agent-theatre` free, no exact
match on the VS Code Marketplace. Bin `agent-theatre`, config dir
`~/.agent-theatre/`, hook marker `agent-theatre-hook.mjs`, extension id
`agent-theatre`.

## Suite context

Agent Theatre is the third product in the suite — **LastSearch** (research
infrastructure), **Debug Anything** (runtime observation), **Agent Theatre**
(session visualisation) — with an umbrella "everything agentic" brand to come.
What that means *now*, so the umbrella is cheap later:

- **Standalone repo, same shape as the others.** Own GitHub repo, own npm
  package, own release tags — exactly how DEA and LastSearch ship. No
  mono-mono-repo yet.
- **Identical conventions to DEA**, deliberately: ESM, Node ≥22, tsup, vitest,
  oxlint, `check` script, `v*` publish workflow with provenance, MIT with the
  same copyright line, `~/.<product>/` for local state, a `hooks install|
  uninstall|status` CLI verb. When the umbrella arrives, three repos that look
  the same are one afternoon to consolidate.
- **Keep `core` product-agnostic.** `AgentEvent` is a generic agent-session
  event schema, not an Agent Theatre type — DEA could emit it, LastSearch
  could consume it. No product name inside `packages/core`.
- **Shared code to extract later, not now:** the `settings.json` hook patcher
  (DEA and Agent Theatre both patch the same file) and the hook-script
  skeleton. Flag them with `// suite: candidate for shared package` so they
  are findable.
- **Cross-product moments worth planning for, not building yet:** Agent
  Theatre can replay a session in which DEA was used (DEA's hook events are
  just `run_command`s); the `inspect-product` skill in DEA is the right tool
  to QA Agent Theatre after each milestone.

## What the real data settled (inspected on this machine, 2026-10-24)

- **Bash dominates real sessions.** One of my own transcripts: Bash 1,553 ·
  Read 120 · Edit **0** · Write 9. Another: Edit 301. If the Director only
  animates Read/Edit, Pip stands still for whole sessions. → `run_command` is a
  first-class event with intent classification, file-target extraction, and a
  physical place (the **forge**) for shell work that touches no identifiable file.
- **`toolUseResult.structuredPatch`** is present on Edit/Write rows alongside
  `filePath`, `originalFile`, `userModified`. Real ±line counts, no diffing.
- **`isSidechain` + `agentId` + `parentUuid`** are on the rows → subagent events
  are nearly free.
- Transcripts have **~14 row types** (`user`, `assistant`, `system`,
  `attachment`, `api-request`, `api-request-blob`, `atis-latch`,
  `queue-operation`, `file-history-snapshot`, `pr-link`, …). The replay adapter
  **whitelists** row types; it never assumes "user or assistant".
- Tool inputs: `Read{file_path}`, `Edit{file_path,old_string,new_string,
  replace_all}`, `Write{file_path,content}`, `Bash{command,description}`.
- Hook config in `~/.claude/settings.json` is
  `hooks.<Event>[] = { matcher?, hooks:[{type:'command', command, timeout}] }`.
  DEA and a GSD hook already coexist there — proof non-destructive merge works.

## Decisions (resolved; say so if you disagree)

1. **`search` and `error` are in the event schema.** They are how `lost` mood is
   detected honestly (retry loops, failed tools) instead of invented.
2. **Bash work animates at the file it touches when one can be extracted**
   (heredoc `>` target, `sed -i`, `cp`/`mv` dest, `tee`); **otherwise at the
   forge.** Never at a dead spot.
3. **Build order stays 1→6 with VS Code last, but VS Code ships in the first
   public release.** The `Transport` seam built in milestone 4 is what makes the
   extension cheap; the marketplace argument is about *release* order, not build
   order.
4. **Fixtures are hand-written synthetic transcripts**, never captured real
   sessions (real ones contain prompts and file contents).
5. **Replay before live.** Replay needs no hooks or server — it is the fastest
   path to "watch a real session" and the demo GIF.

## Repo layout

```
~/agent-theatre/                    MIT · pnpm workspaces · ESM · TS strict
├── packages/
│   ├── core/        zero runtime deps; no DOM, no fs, no process
│   │   ├── events/      AgentEvent types, guards, ulid
│   │   ├── adapters/    hook.ts · transcript.ts · (otel.ts later)
│   │   ├── island/      generator, seeded PRNG, packing, relevance cap
│   │   ├── director/    events → Beat timeline, mood, claim check
│   │   └── privacy/     redaction + invariant test helpers
│   ├── cli/         bin `agent-theatre`; Hono server + WS; hooks install/
│   │                uninstall; replay loader; opens browser
│   ├── web/         Vite + PixiJS; exports mount(el, transport)
│   └── vscode/      (m6) extension host + webview; VsCodeTransport
├── fixtures/        synthetic .jsonl transcripts + expected event JSON
├── docs/            design.md (this plan, trimmed), how-it-works
└── .github/workflows  ci.yml (test) · publish.yml (tag v*)
```

## Types

### Events (`packages/core/events/types.ts`)

```ts
interface EventBase {
  id: string;         // transcript uuid, or ulid minted by the hook
  seq: number;        // monotonic within session
  ts: number;         // epoch ms
  sessionId: string;
  agentId?: string;   // set when the row/hook is subagent work
  parentId?: string;  // threads subagent → caller
  source: 'hook' | 'transcript' | 'otel';
}

type AgentEvent = EventBase & (
  | { kind: 'session_start';    repoId: string; branch?: string }
  | { kind: 'read_file';        path: string; bytes?: number }
  | { kind: 'edit_file';        path: string; added: number; removed: number; hunks: number }
  | { kind: 'write_file';       path: string; added: number; created: boolean }
  | { kind: 'run_command';      argv0: string; intent: CommandIntent;
                                touched: string[]; exitCode?: number; durationMs?: number }
  | { kind: 'test_result';      passed: number; failed: number; skipped?: number;
                                framework?: string; durationMs?: number }
  | { kind: 'search';           scope: 'repo' | 'web'; hits?: number }
  | { kind: 'subagent_start';   agentId: string; label?: string }
  | { kind: 'subagent_stop';    agentId: string; ok: boolean }
  | { kind: 'waiting_for_user'; reason: 'permission' | 'question' | 'idle' }
  | { kind: 'error';            where: string; retrying: boolean }
  | { kind: 'session_end';      reason: 'stop' | 'error' | 'user'; claimedSuccess: boolean }
);

type CommandIntent = 'test' | 'build' | 'git' | 'install'
                   | 'write_file' | 'read_file' | 'search' | 'other';
```

**Privacy invariant, enforced by type and by test:** no variant carries file
contents, prompts, command bodies or search queries — only repo-relative paths,
counts, `argv0`, and a classified intent. `fixtures/secrets.jsonl` plants marker
strings in prompts, file contents and command bodies; a test serialises the
whole event stream and asserts zero occurrences.

### Beats (`packages/core/director/types.ts`)

```ts
type Mood = 'curious' | 'focused' | 'lost' | 'happy' | 'uneasy';

type Beat = { id: string; atMs: number; durationMs: number;
              mood: Mood; sourceEventIds: string[] } & (
  | { kind: 'walk_to';   target: PlaceId }
  | { kind: 'read';      target: PlaceId }
  | { kind: 'build';     target: PlaceId; intensity: number }   // 0..1 from ±lines
  | { kind: 'raise';     target: PlaceId }                      // new file rises
  | { kind: 'demolish';  target: PlaceId }
  | { kind: 'forge';     intensity: number }
  | { kind: 'run_tests'; target: PlaceId; outcome: 'pending' | 'pass' | 'fail' }
  | { kind: 'spawn_gremlin' | 'chase' | 'banish'; gremlinId: string; target?: PlaceId }
  | { kind: 'summon_helper' | 'dismiss_helper'; agentId: string; target: PlaceId }
  | { kind: 'celebrate'; target?: PlaceId }
  | { kind: 'idle';      mood: Mood }
  | { kind: 'unverified_claim'; gremlinId: string }
);
```

`sourceEventIds` makes the side panel and timeline bidirectional (click event →
seek; current beat → highlight events).

### Island (`packages/core/island/types.ts`)

```ts
interface Island { seed: string; districts: District[]; places: Place[];
                   paths: Path[]; bounds: Rect }
interface Place  { id: PlaceId; path: string; district: string;
                   kind: 'building' | 'lighthouse' | 'library' | 'forge' | 'dock';
                   gx: number; gy: number; height: number; footprint: 1|2|3; label: string }
```

- `seed = sha256(git remote URL ?? absolute repo path)`; PRNG `mulberry32`;
  deterministic packing. Test: identical JSON across two runs.
- Relevance cap ~60: `0.5·loc + 0.3·git churn (if available) + 0.2·touched`.
  **Every session-touched file is force-included** — otherwise the Director
  emits `walk_to` for a building that was never placed.
- `forge` (shell work) and `dock` (subagents arrive by boat) are always placed.

### Transport seam (`packages/web/src/transport.ts`) — the VS Code accommodation

```ts
interface Transport { mode: 'live' | 'replay'; onEvent(cb: (e: AgentEvent) => void): void;
                      onIsland(cb: (i: Island) => void): void; seek?(ms: number): void }
export function mount(el: HTMLElement, t: Transport): Scene
```

CLI → `WsTransport`. Extension → `VsCodeTransport` over `postMessage`. `web`
must never import `fs`, `ws`, `process`, or anything Node — enforced by an
eslint `no-restricted-imports` rule, because a webview has no Node.

## Adapters — what each input actually gives us

Source for hook facts: code.claude.com/docs/en/hooks, /hooks-guide, /sessions
(fetched 2026-10-24; field names as documented, verify against raw page before
hard-coding).

### Hook adapter (live) — `packages/core/adapters/hook.ts`

Common stdin fields: `session_id`, `transcript_path`, `cwd`, `hook_event_name`,
`permission_mode`, plus **`agent_id` / `agent_type` on tool events** — so
subagent attribution in live mode is documented, not guessed.

| Hook event | → AgentEvent | Fields used |
|---|---|---|
| `SessionStart` | `session_start` | `source` (startup/resume/clear/compact/fork) |
| `PostToolUse` (no matcher = all tools) | `read_file` / `edit_file` / `write_file` / `run_command` / `search` | `tool_name`, `tool_input` (paths, command), `tool_response` (structuredPatch for ±lines; exit code), `duration_ms` |
| `PostToolUseFailure` | `error` | tool name, error |
| `SubagentStart` / `SubagentStop` | `subagent_start` / `subagent_stop` | `agent_id`, `agent_type`, `agent_transcript_path` |
| `Notification` (`permission_prompt`, `idle_prompt`, `elicitation_dialog`) | `waiting_for_user` | `notification_type` |
| `Stop` | `session_end` + **claim check input** | `last_assistant_message` — the docs say the transcript "isn't guaranteed to include the final message at Stop time", so the claim check reads this field, never the file |
| `SessionEnd` | `session_end` | `reason` |

`test_result` is **derived**, not received: when a `run_command` has
`intent: 'test'`, parse `tool_response` stdout for vitest/jest/pytest/go test/
cargo summary lines → pass/fail counts. Unknown framework → `test_result` with
counts omitted and `outcome` from exit code.

**Handler type: `command` for v1.** Hooks also support `type: "http"` (POST
JSON to a URL), which would avoid spawning Node per tool call — but the docs do
not say how an unreachable URL is reported, and a dead port must never produce
a visible hook error every tool call when Agent Theatre isn't running. The
command script no-ops silently if the server isn't up (same pattern as DEA).
Revisit `http` once dead-port behaviour is verified. Hook `timeout`: 5 s.

**Install is hot:** the docs say settings-file hook edits are picked up by the
file watcher — no Claude Code restart after `agent-theatre hooks install`.

**Exit-code discipline:** always exit 0, never emit `decision: "block"`, never
write to stdout except nothing. Agent Theatre is an observer; a bug in it must
never stall the user's session.

### Transcript adapter (replay) — `packages/core/adapters/transcript.ts`

⚠ **Honest risk:** the sessions doc states the entry format "is internal to
Claude Code and changes between versions, so scripts that parse these files
directly can break on any release." Mitigations, all in milestone 1:

1. **Whitelist** row `type`s (`user`, `assistant`, `system`); ignore everything
   else (`attachment`, `api-request*`, `atis-latch`, `queue-operation`,
   `file-history-*`, `pr-link`, …).
2. **Never throw on shape.** Unknown `tool_use.name` → `run_command` with
   `intent: 'other'`; missing `structuredPatch` → `added/removed` from
   `old_string`/`new_string` line counts; missing anything else → omit field.
   Emit one `adapter_warning` per unknown shape to the CLI log, not the scene.
3. **Pin the `version` field** (present on every row) in fixtures; CI asserts
   the adapter handles every pinned version in `fixtures/`.
4. **Also accept `claude -p --output-format stream-json`** — the format the
   docs recommend instead — as a second replay input in a later milestone.
5. Subagent transcripts live in a nested `subagents/` folder next to the
   session file; the loader reads them and sets `agentId` from the folder.

Transcript path: `~/.claude/projects/<cwd with non-alnum → '-'>/<session>.jsonl`
(honours `CLAUDE_CONFIG_DIR`). `agent-theatre replay` with no argument lists
sessions for the current repo, newest first.

### Claim check (director)

`claimedSuccess` is true when `last_assistant_message` (live) or the final
assistant text (replay) matches a conservative success lexicon ("done",
"complete", "all tests pass", "✅", "fixed", "working") **and** the session
contains no `test_result` with `failed === 0 && passed > 0` after the last
`edit_file`/`write_file`. Then emit `unverified_claim`. Lexicon is a plain
array in `director/claims.ts` so it is reviewable and extendable.

### VS Code reality

The official Claude Code VS Code extension exposes **no API or events** for
third parties. So the extension (m6) uses the **same hooks** (its extension host
runs the receiver) and the **same transcript loader** — nothing extension-
specific in `core`. Good: it confirms the `Transport` seam is the only VS Code
accommodation needed.

## The concept clip ("Episode 1 · The Login Timeout") — what we keep

The shared `Agent Theater.html` (the concept file keeps its original filename) is a 30 s Canvas-2D short. It already nails the
grammar, so we **port it rather than redesign it**:

- **Its data tables are a Beat timeline.** `KF` (Pip keyframes), `GK` (gremlin),
  `BEATS` (captions), `EV` (event log), `ACTS` (act track) → the first
  `fixtures/episode-1.beats.json`. Milestone 4's acceptance test is: *the real
  renderer plays Episode 1 and it reads as well as the concept.*
- **Primitives to port into `web/`:** iso projection (`TW=64,TH=32`), painter
  sort by `gx+gy`, `ease`/`backOut`/`seg`, box + pyramid roofs with three-face
  shading, window pulse on active buildings, scaffold during `build`, building
  grows +14 px during an edit, lamp states `idle/scan/fail/pass` with beam
  sweep, Pip's squash/stretch/anticipation/landing, blink, mood-coloured antenna
  with glow, ear flap while walking, `…`/`?`/`!` speech bubbles, particle
  bursts on land/spawn/catch/pass, vignette, camera push-in 1.14→1 at open and
  1→1.07 at finale, tag labels on active buildings only when narrow.
- **UI to keep verbatim in spirit:** caption bar · act track scrubber with
  labels · side-panel event log with click-to-seek · title/end cards · the
  **"Evidence · npm test 24/24" chip**. That chip is the claim check made
  visible: it appears only when a passing `test_result` exists; otherwise the
  gremlin hides behind Pip. Keep it — it is the product's one-line pitch.
- **Fonts:** Fredoka (display) · Nunito Sans (body) · JetBrains Mono — all open
  licence, self-host in `web/public/fonts` (no Google Fonts call at runtime:
  privacy, and the VS Code webview blocks it anyway).

## Rendering decision: PixiJS v8, with the concept as the first scene

The concept proves Canvas 2D is enough for 9 buildings. The brief wants ~60 at
60 fps **and** a Disney/Pixar/Marvel bar, which is a *lighting* bar — bloom on
lamps and antenna, rim light on Pip, soft shadows, rack focus on camera push.
Canvas 2D cannot do bloom or blur cheaply at 60 fps; WebGL can. So:

- **PixiJS v8** (`Container` with `sortableChildren` for the painter sort,
  `Graphics` for buildings at first, baked to `RenderTexture` sprites once a
  building's look is settled so 60 buildings = 60 sprites, not 60×N draw
  calls). `pixi-filters` for `AdvancedBloomFilter` (lamps, antenna, celebrate)
  and `BlurFilter` for depth-of-field on far districts during push-ins.
- **Cinematic layer, concretely scoped for the MVP:** a single directional key
  light (face shading + long soft ground shadows), bloom on emissive elements,
  vignette + atmospheric haze by distance, camera with ease-in-out dolly,
  push-in on `spawn_gremlin` / `celebrate`, a 2–3 px handheld drift during
  `lost`, 120 ms hitch-slow-mo on `banish`. Title and end cards per session.
- **Deferred (not in MVP):** depth-of-field filter pass, sound, Rive characters.
  Pip is drawn procedurally behind a `Character` interface
  (`setMood`, `walk`, `squash`, `look`) so Rive can replace it later without
  touching the Director.
- **Reduced motion:** honour `prefers-reduced-motion` by cutting particle count,
  disabling camera drift and shortening easings; never disable the scene.
- **Budget:** 60 fps on an M-series laptop with 60 buildings + 200 particles;
  measured by a `perf` fixture that spawns 60 buildings and asserts
  `ticker.FPS > 55` over 5 s in a headless Chromium run (Playwright) in CI.

## Reuse from `~/dea` (confirmed by reading the code)

| Need | DEA has | Action |
|---|---|---|
| Non-destructive hook install | `patchClaudeHooks(existing, scriptPath)` — pure text→text, `~/dea/src/setup.ts:86-108`; backs up to `settings.json.bak-*` only when changed and file existed; `{}` for missing/empty; **throws on invalid JSON rather than overwrite** | Port as `cli/src/hooks/patch.ts` with marker `agent-theatre-hook.mjs`; events `SessionStart, PostToolUse (no matcher), PostToolUseFailure, SubagentStart, SubagentStop, Notification, Stop, SessionEnd`; `timeout: 5` |
| Uninstall | **none exists** | New: filter groups whose `command` contains the marker; delete event arrays that become empty; same backup rule |
| Hook script | `HOOK_SCRIPT` string in `~/dea/src/hook.ts:66-102`, dependency-free, ~40 ms start, parse-fail → silent exit 0, byte-identical test against the shipped file | Same shape: read stdin → `fetch('http://127.0.0.1:<port>/hook', {signal: AbortSignal.timeout(300)})` → swallow all errors → exit 0. Port discovered from `~/.agent-theatre/port` file written by the server; no file → exit immediately |
| Project conventions | ESM, `engines.node >=22`, tsup (`format esm, target node22, banner #!/usr/bin/env node`), tsconfig `strict + noUncheckedIndexedAccess + noImplicitOverride`, `.js` import suffixes, vitest `tests/**/*.test.ts`, **oxlint** (not eslint), `check = typecheck && lint && test && build`, `prepublishOnly: check` | Adopt all. Replace the eslint idea for `web`'s Node-import ban with a vitest test that scans `web/src` for `node:`/`fs`/`ws`/`process` imports — deterministic, no lint-plugin dependency |
| Publish | `publish-npm.yml` on tag `v*`, verifies tag == package version, `npm publish --provenance` | Copy; add `publish-vsix.yml` on the same tag for the extension (m6) |
| HTTP server / WS | **none** (DEA's server is MCP over stdio) | New: Hono + `@hono/node-server` + `ws`. Routes: `POST /hook`, `GET /island`, `GET /events` (replay), `WS /live` |
| Transcript parser | **none** | New, in `core/adapters/transcript.ts` |
| Browser bundle | `scripts/build-web.mjs` esbuild + node stubs | Not needed — `web/` is Vite and must have no Node imports at all |

Side note from the exploration: the hook installed in your live
`~/.claude/settings.json` still points at the pre-rename
`~/.dea/hooks/dea-hook.mjs`; `~/.debuganything` doesn't exist yet. It works
(it fired during this session), but it's the old script. Unrelated to this
plan; mentioned so it isn't a surprise.

## Milestones, acceptance, and how to see each one

**M1 — core types + adapters** (`packages/core`)
- `events/`, `adapters/hook.ts`, `adapters/transcript.ts`, `adapters/bash-intent.ts`
  (classify `argv0` + extract touched paths from `>`, `>>`, `tee`, `sed -i`,
  `cp/mv` dest, heredoc targets), `adapters/test-summary.ts` (vitest, jest,
  pytest, go test, cargo test, mocha summary regexes), `privacy/`.
- Fixtures: `fixtures/episode-1.jsonl` (synthetic, mirrors the concept's story),
  `fixtures/bash-heavy.jsonl` (my real pattern: heredocs, no Edit calls),
  `fixtures/subagents.jsonl`, `fixtures/secrets.jsonl` (planted markers),
  each with `*.expected.json`.
- Accept: `pnpm -F core test` green; secrets test asserts zero leaks; the
  bash-heavy fixture yields ≥1 `edit_file`/`write_file` per heredoc write.
- See it: `pnpm -F core demo fixtures/episode-1.jsonl` prints the event table.

**M2 — island generator**
- `island/generate.ts` (seed → districts → relevance cap with force-include →
  packing → paths), `island/prng.ts` (mulberry32), `island/relevance.ts`.
- Accept: determinism test (two runs, deep-equal); force-include test (a
  touched file below the cap is placed); cap test (1,000-file tree → ≤60
  buildings + forge + dock + all lighthouses ≤ 8); every path connects
  district centroids.
- See it: `pnpm -F core island .` prints an ASCII plan of the current repo.

**M3 — director**
- `director/direct.ts` (events → beats, with walk durations from grid
  distance), `director/mood.ts` (retry loop: ≥2 `error` or ≥2 failing
  `test_result` within 90 s → `lost`; `happy` after pass), `director/claims.ts`.
- Accept: episode-1 fixture → beat list deep-equals `episode-1.beats.json`
  (the ported concept timeline, within ±100 ms); claim-check fixture (success
  text, no passing test) → exactly one `unverified_claim`; bash-heavy → zero
  `idle` beats longer than 3 s.
- See it: `pnpm -F core direct fixtures/episode-1.jsonl` prints the beat list.

**M4 — renderer** (`packages/web`) — the quality gate
- `render/` (Pixi stage, iso, buildings, lighthouse, trees, water, particles,
  camera), `scene/` (beat player, timeline, character interface, Pip),
  `ui/` (caption, act track, event log, cards, evidence chip), `transport.ts`.
- Accept: Episode 1 plays from `episode-1.beats.json` via a `StaticTransport`
  and a side-by-side with the concept clip looks at least as good; perf
  fixture ≥55 fps with 60 buildings; reduced-motion test; Node-import ban test.
- See it: `pnpm -F web dev` → `http://localhost:5173/?demo=episode-1`.

**M5 — CLI live + replay** (`packages/cli`)
- `agent-theatre` (default: start server on a free port, write
  `~/.agent-theatre/port`, scan cwd → island, open browser),
  `agent-theatre replay [session.jsonl]` (no arg → pick from this repo's
  sessions, newest first), `agent-theatre hooks install|uninstall|status`.
- Accept: hook patch/unpatch tests on temp `settings.json` (permissions
  survive; invalid JSON refused; idempotent); replay of the bash-heavy
  fixture end-to-end in headless Chromium; live smoke: run `claude -p "read
  README.md"` in a temp repo with hooks installed → one `read_file` arrives
  over WS within 2 s.
- See it: `npx agent-theatre` in `~/dea` → browser → run any Claude Code
  command in another terminal → Pip walks.

**M6 — VS Code extension** (`packages/vscode`)
- Commands: *Agent Theatre: Open*, *Replay Session…*, *Install Hooks*. Webview
  loads the built `web/` bundle with `VsCodeTransport`; extension host runs
  the same Hono receiver on a free port and the same transcript loader; island
  from `workspace.workspaceFolders[0]`.
- Accept: `vsce package` succeeds; extension host tests (`@vscode/test-electron`)
  open the webview and receive a replayed event.
- See it: F5 in the `packages/vscode` launch config.

Each milestone ends with: `pnpm check` green, a commit, and a one-paragraph
"how to see it" in the PR/commit body.

## Verification (end-to-end, after M5)

1. `cd ~/dea && npx agent-theatre hooks install` → `~/.claude/settings.json`
   gains 8 entries, `settings.json.bak-agent-theatre` exists, DEA + GSD hooks
   untouched (diff the file).
2. `npx agent-theatre` → browser shows the DEA island (≤60 buildings, tests
   as lighthouses near the shore, `forge` and `dock` present, deterministic
   across two launches — screenshot diff).
3. In another terminal, `claude -p "run the tests"` in `~/dea` → Pip walks to
   the forge, lighthouses scan, then go green/red; event log fills; chip shows
   evidence iff tests passed.
4. `npx agent-theatre replay` → pick a real session → play/pause/scrub at
   1×/2×/4×; click an event → seek; Bash-heavy session animates (no dead
   island).
5. Privacy: `grep -r` the server's WS frames (log them to a temp file during
   step 3) for any line of file content or prompt text → none.
6. `npx agent-theatre hooks uninstall` → settings.json byte-equal to the
   pre-install backup except whitespace.

## Distribution (short, because we already ran this experiment)

Debug Anything shipped to ten registries and `docs/distribution.md` measured
~0 downloads with LinkedIn as the only referrer: an awareness problem, not a
distribution problem. Agent Theatre is different in one way that matters —
**the product emits video**. So: VS Code Marketplace is the primary channel
(in-editor search is real discovery traffic; npm has none), the first README
asset is a 20 s GIF of Episode 1 rendered by the real renderer, the pitch line
is the claim check ("a gremlin hides behind the agent when it claims success
without a passing test"), and we reuse the Claude Code plugin-marketplace and
MCP-registry footholds DEA already has at near-zero cost. GIF export stays a
non-goal for the MVP but is the obvious first post-MVP feature because it *is*
the growth loop.

## Out of scope for the MVP (explicit)

Video/GIF export · multi-agent "teams" view · OTel adapter (slot exists) ·
cloud/hosting/accounts · sound · Rive characters · depth-of-field pass ·
`stream-json` replay input · `http`-type hooks.

## Risks

- **Transcript format is officially internal** — mitigated by whitelist +
  never-throw + version-pinned fixtures; live mode (hooks) is the documented
  path and is unaffected.
- **Hook `http` type dead-port behaviour unknown** — avoided by using
  `command` with a 300 ms fetch timeout and silent exit.
- **Test-summary parsing is heuristic** — unknown frameworks degrade to
  exit-code-only `test_result`; lighthouse still goes green/red.
- **Pixar bar is subjective** — anchored by the side-by-side with the concept
  clip and the perf fixture, not by adjectives.



## Gaps we commit to (from docs/competitive.md, 2026-10-24)

Design consequences, mapped to milestones:

- **M3 director:** `waiting_for_user` becomes a first-class, persistent `blocked_on_you` beat
  (bubble + badge; optional chime in M4). Claim check stays deterministic and test-gated — never
  an LLM judge. Conservative by design: a false red trains users to ignore the colour.
- **M4 renderer:** no render loop when nothing changes (event-driven ticker; `document.hidden`
  pauses); idle CPU measured and published. `prefers-reduced-motion` honoured. Demo mode: Episode 1
  plays when there is no session, so the scene is never blank on install.
- **M5 CLI:** hooks-first, transcript as enrichment. **Signal-loss state**: if a session is active
  and no hook event arrives for 90 s, the scene shows "I can't hear the agent" instead of an idle
  character. Session picker reads the transcript's `ai-title` / `last-prompt` rows **for the local
  picker only** (never into events) so "my last session" is findable. Loopback bind, no tokens in
  URLs, no telemetry. Also ship hooks as a Claude Code plugin (`hooks/hooks.json`) in addition to
  settings-file install.
- **CI:** `windows-latest` runner from the first workflow.
- **README:** a privacy sheet table — what is read · what is rendered · what is exported.
- **Naming:** never a bare `theatre` package; no Theatre.js dependency; "pixel" appears nowhere;
  Pip stays a character name only.

## Sets, not just an island (design change, 2026-10-24)

The user's direction: the stage should not be tied to one world. **The structure comes from the
repo; the set is chosen.** Walking to a file has to mean something, so places still map to files —
but the *theme* is a selectable "set", randomised on first launch with a picker, remembered per repo.

- **Core:** `island/` becomes `world/`. The generator produces a set-agnostic `World` — districts,
  places (`building | beacon | archive | forge | dock`), paths, bounds. No theme words in core.
  (`lighthouse` → `beacon`, `library` → `archive`: the abstract roles.)
- **Web:** a `Set` is an art pack implementing one interface — terrain, district ground, building
  silhouettes by size class, beacon (the test-light analogue), forge, dock, props, gremlin skin,
  palette, ambience, and per-set camera defaults. The Director never knows which set is active.
- **MVP ships three sets** so randomisation feels real, each fully polished rather than many
  half-done: **Island** (the concept clip), **Orbit** (a space station: modules, a beacon tower,
  shuttles for subagents, star-field water), **Metropolis** (a warm night city: towers, a radio
  mast beacon, taxis for subagents). More sets are a drop-in pack, and a natural community
  contribution surface.
- **Picker:** first launch shows three randomised set cards with a live 3-second preview each;
  "Shuffle" rerolls; choice saved in `~/.agent-theatre/sets.json` keyed by repo id; `--set` flag
  and VS Code setting override.
- **Pip stays Pip across sets** (one character, costume accents per set) — recognisability is the
  brand.

## Motion bar (user: "Pixar level, as if Steve Jobs designed it")

Concrete, testable, in `docs/motion.md` at M4: the twelve principles applied per beat (squash &
stretch, anticipation ≥120 ms before every walk/build, follow-through on stops, secondary action
on antenna/ears, slow-in/slow-out everywhere — **no linear tween anywhere in the codebase**, a lint
test greps for it); one easing family per intent (walk `cubicBezier(.4,0,.2,1)`, land `backOut`,
celebrate `elasticOut`); every state change is a designed transition, none is a cut; the camera
never moves without a reason tied to a beat; idle is alive but quiet (breathing, blink, antenna
drift — ≤2 px); reduced-motion keeps the story and removes the flourish. Quality gate per set: a
side-by-side with the concept clip and a 10-second "does it feel alive with nothing happening" test.

## Sound (user: "sound effects for everything", 2026-10-24)

**Everything is synthesized with the Web Audio API at runtime; no audio files ship** —
`packages/web/tests/sfx.test.ts` fails the build if an audio file appears under `src/` or
`public/`, or if any beat kind is missing from the sound switch (silence must be explicit).

- `audio/engine.ts` — tiny synth: tones with envelopes/slides/lowpass/pan, filtered noise bursts,
  sustained pads and noise washes; an SFX bus and an ambience bus with automatic ducking.
- `audio/sfx.ts` — one sound per beat kind. Footsteps and hammer taps are driven by the walk
  and build rhythms, not the beat start. Pass = major arpeggio; fail = two-note descending
  "bwomp"; gremlin = squeaky wobble; banish = pop + sparkle; **`blocked_on_you` = the loudest,
  most distinct two-note chime** (the one sound that must be unmistakable); `your_turn` = a
  single soft chime; `unverified_claim` = a low tiptoe motif. Set-specific arrival: Island boat
  horn, Orbit shuttle whoosh, Metropolis taxi beep.
- `audio/ambience.ts` — one quiet bed per set (waves / station hum / distant traffic) plus a
  barely-there pad that follows mood (major when happy, sour when lost).
- Rules: arms only on a user gesture (browser requirement); mute persisted; density drops at
  2×/4× so fast replay isn't a wall of pings; silent during seeks; ambience ducks under effects.

## Site and domains (2026-10-24)

The open-source repo is the product; **agenttheatre.dev** is the story. The user owns
`agenttheatre.dev` (primary) and `agenttheatre.com` (301 → .dev). The site ships as `site/` in
this repo on Vercel, the same way debuganything.dev does: lore (Pip, gremlins, beacons, the
three sets), how it works, the privacy sheet, the Episode 1 film, install for CLI and VS Code.
The user supplied a 30 s vertical story reel (`agent-theater-story-music.mp4`, 1080×1920, h264/
aac, 7 MB) for the site and GitHub — note it carries the US spelling "Agent Theater" burned in;
re-render from the real renderer with "Theatre" before it becomes the hero asset.


## Layouts, light and sound per stage (2026-10-25)

Three complaints drove this pass: every stage looked like the same island
recoloured, every stage sounded the same, and the frame was either cluttered
or empty depending on the camera.

**Arrangement is generated, not shared.** `packages/core/src/world/generate.ts`
now has six layout archetypes — `ring`, `grid`, `strip`, `scatter`, `terrace`,
`spine` — each with its own hub position (centre, or one end for strip /
terrace / spine) and its own street pattern (spokes, L-shaped streets, a
chain). `relayoutWorld(world, layout)` re-arranges an existing world keeping
every place id, so beats directed against one arrangement remain valid in
another. The stage picks a layout from `(repo seed + set index)`, so the same
repo in twenty sets is twenty arrangements, and the same repo in the same set
is always the same arrangement. Beacons stand just outside their own folder's
district on the side away from the hub; the dock is a few cells past the hub;
test folders with no district of their own stand near the hub. The terrain
blob is an ellipse over the bounds with a seeded wobble, so a strip layout is
a long island, not a round one with a strip on it.

**Light.** One key light, upper-left. Every box gets a long soft cast shadow
(two layers) and a contact shadow; faces are gradients — the lit face brightens
toward the eave and darkens toward the ground (ambient occlusion), the shaded
face is cooler; the top brightens toward the light; a rim highlight runs along
the sunward eave and edge. Far rows haze toward the sky colour. Windows have a
bright glass sliver. An `AdvancedBloomFilter` with a high threshold sits on the
objects layer so only lamps, embers and lit windows glow. Three cloud shadows
drift across the ground. Trees are three foliage lobes with a highlight and a
shaded underside. Still procedural `Graphics`; nothing is an image.

**Sound per stage.** `packages/web/src/sets/sound.ts` gives every set a
*voice* (oscillator family, pitch multiplier, decay multiplier, lowpass
ceiling, surface underfoot) and an *ambience recipe* (filtered-noise washes,
optional pad chord, a list of synthesized extras and a mean interval). Effects
are coloured by the voice at play time; footsteps are per surface (grass,
stone, metal, sand, snow, wood, water, neon); extras — gull, cricket, bell,
bubble, wind, horn, hum, chime, owl, rumble, drip, market — fire on a jittered
timer so nothing loops. All synthesized; the no-audio-files test still holds.

**Camera.** A true follow camera: the subject roams a dead zone (28% / 26% of
the half-view), the camera glides only when it leaves, with lead room in the
walking direction. Story beats use an absolute scale (a character is about a
tenth of the frame tall whatever the repo size); only the establishing and
closing shots fit the whole stage. A seek that produced a negative frame delta
used to flip the ease factors and send the camera to infinity — the delta is
now clamped, which is what "the panning isn't right" turned out to be.

**Silhouettes per stage (art milestone, 2026-10-25).** `packages/web/src/sets/architecture.ts`
gives every set a roofline — `pitched`, `gable`, `flat`, `dome`, `onion`, `tiered`
(pagoda), `tent`, `capsule` — an eave overhang whose underside is drawn in shadow
(the single strongest "built, not extruded" cue), rooftop furniture (chimney,
vent, mast, finial, lantern, dish) and optional stripes. So a monastery is onion
domes with gold finials, Lanterns is two-tier pagoda roofs with upturned corners,
Moonbase is capsules with dishes, Bazaar is scalloped tents with pennants — from
the same geometry. Characters got a rim light on the sunward side and a cool
ground bounce on the far side so bodies read as round. The honest ceiling of
procedural `Graphics` is still there; the next step up is baked textures or
Rive characters, which is a separate decision.

**Jingles (2026-10-25).** Every stage has a tune: a scale (pentatonic, lydian,
dorian, mixolydian, whole-tone, double-harmonic, minor), a root, a waveform and
a cadence. The ambience plays short phrases on it — a random walk of four to
seven notes with a resting note at the end — every 12–25 s with jitter, so a
stage hums its own music and never repeats a phrase. Notes go through the
ambience bus (soft attack, long release, a detuned pair and a quiet octave).

**Hook routing.** Claude Code hooks are global, so a running stage used to
receive events from every session on the machine. The server now ignores hook
payloads whose `cwd` is outside the repo it was started in.

**Your turn, from the stage (1.2.0).** When a live session ends its turn, the stage shows a prompt box.
Sending resumes that session headlessly through the local server (`claude -p --resume <id>`); the
resumed run's hooks feed the stage, so the reply plays out as beats. The interactive terminal does not
see that exchange — it is a fork from the same transcript — so the box is for "what's next" after the
agent is done, not for mid-turn chat. Permission prompts cannot be answered this way (headless runs have
no permission dialog), which is why the waiting banner redirects instead. Also: **Whole repo** toggle
(follow camera off, fit the stage) and wheel zoom; **Export clip** records the canvas plus the synthesized
sound with MediaRecorder to a .webm, entirely in the browser.

**Removed (1.3.8): the stage prompt.** Resuming headlessly from the stage reached the model but not the
person's terminal, and its SessionEnd (same session id) dropped the live curtain. The stage now never
prompts: the waiting banner redirects to Claude Code, and a *live* stage never shows the replay ending —
"Every agent run has a story" is for replays only.
