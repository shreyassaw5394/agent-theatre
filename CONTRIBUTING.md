# Contributing

Thanks for wanting to help. Agent Theatre is small enough that one person can hold it in their head; let's keep it that way.

## The rules of the stage

1. **Privacy is the product.** Nothing in the event stream may carry file contents, prompts, command bodies or search queries. If your change touches `packages/core/src/adapters/` or `director/`, run `pnpm --filter @agent-theatre/core test` and keep `privacy.test.ts` green. If you add a field that carries text, say so in the PR and in `README.md › Privacy`.
2. **Loopback only.** The server and the hook talk to `127.0.0.1` and nothing else. No analytics, no update checks, no fetches to the internet from `packages/web` (a test enforces no Node imports there).
3. **No linear tweens.** Motion is eased; `tests/no-linear.test.ts` checks. Add easings in `render/ease.ts`.
4. **Everything synthesized.** No audio files, no sprite sheets, no copied art. Sound lives in `audio/`, characters in `scene/pip.ts`, stages in `sets/`.
5. **Verify on a real GPU at Retina.** Headless SwiftShader at DPR 1 hides real bugs. `packages/web/scripts/blankprobe.mjs`, `fpsprobe.mjs`, `jumpprobe.mjs` exist for this.

## Setup

```sh
git clone https://github.com/shreyassaw5394/agent-theatre && cd agent-theatre
pnpm install            # Node 22+, pnpm 9 (corepack enable)
pnpm check              # build, typecheck, lint, test — must be green before a PR
pnpm --filter @agent-theatre/web dev   # http://127.0.0.1:5173/?demo=episode-1
```

Packages: `core` (events, world, director; no DOM, no Node), `web` (Pixi renderer, browser only), `cli` (server, hooks, MCP), `vscode` (extension), `site/` (agenttheatre.dev). Design notes: `docs/design.md`; the v2 list: `docs/v2.md`.

## Pull requests

- `main` is protected: every change lands through a PR with green CI (ubuntu, macOS, Windows) and one review. Maintainers included.
- Branch from `main`, keep PRs focused, write the "how to see it" in the description (a URL with `?demo=…&set=…&t=…` is perfect; a screenshot from `scripts/shot.mjs` is better).
- Add or extend a test for behaviour you change. Fixtures are synthetic — never commit a captured session.
- Don't bump versions in a PR; releases are cut from `main` by tagging.
- New stage, cast member or sound? One file each in `sets/`, `scene/cast.ts`, `sets/sound.ts`; add it to the tests that count them.

## Releases (maintainers)

Bump the version in `packages/cli`, `packages/vscode`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` and `server.json` (a test checks they agree), merge, then `git tag vX.Y.Z && git push origin vX.Y.Z`. The tag publishes npm, VS Code Marketplace, Open VSX, the Homebrew formula, the GitHub release and the MCP registry.

## Community

Questions and show-and-tell: https://discord.gg/PPGeQWd7r · Code of conduct: be kind, assume good faith, no harassment; maintainers may remove anyone who isn't.

## Copyright and trademarks

- Everything on the stage is drawn or synthesized by code in this repo. **Do not add** images, sprites, audio files, fonts or code copied from other projects or generated from someone else's art. Fonts are limited to the three OFL faces in `packages/web/public/fonts/` (licence included).
- Don't name or imitate other products' characters, stages or UI. "Claude Code" is Anthropic's trademark and appears here only to describe compatibility; don't use it in a way that implies endorsement.
- Dependencies must be MIT/ISC/BSD/Apache-2.0 compatible with this repo's MIT licence.
