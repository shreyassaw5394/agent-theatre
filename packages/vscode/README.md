# Agent Theatre for VS Code

Watch your coding agent work — as a film, not a log. The same stage as `npx agent-theatre`, inside the editor.

**Commands** (Command Palette → "Agent Theatre"):
- **Open the stage (live)** — starts a local server for the open folder and shows the stage beside your editor. Run Claude Code; the character walks.
- **Replay a session…** — pick any past Claude Code session of this folder.
- **Agent changes** (Explorer) — every file the agent read, edited, created or deleted, with line counts; a dot on those files in the Explorer; click for the editor's own diff against the last commit. Toolbar: open the map, post to the pull request (asks first), copy as Markdown. Works from the newest session even when the stage is closed.
- **Install / Uninstall Claude Code hooks** — non-destructive edit of `~/.claude/settings.json` with a backup; reversed byte-for-byte.

Everything runs on your machine and talks only to `127.0.0.1`. Events carry paths and counts, never file contents or prompts.

Site: https://agenttheatre.dev · Source: https://github.com/shreyassaw5394/agent-theatre

Community: https://discord.gg/PPGeQWd7r

Integration test in a real VS Code (opens a window): `pnpm test:vscode` — run with `ELECTRON_RUN_AS_NODE` unset if you are inside an extension host.

---

Agent Theatre is a free, non-commercial passion project. MIT licensed; bundled third-party code is listed in `THIRD_PARTY_LICENSES.txt`. It runs locally and sends no telemetry ([privacy](https://agenttheatre.dev/privacy)).
