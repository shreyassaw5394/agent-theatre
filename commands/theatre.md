---
description: Open the Agent Theatre stage for this repo (live), or replay a past session
argument-hint: "[live|replay|changes|stop]"
---

Open or control the Agent Theatre stage for the current repository.

- No argument or `live`: start the stage for this repo and open it in the browser. Run `npx -y agent-theatre@latest --no-open` in the background (so this session is not blocked), then open the URL it prints. If a stage for this folder is already running (check `~/.agent-theatre/ports/`), just open its URL instead of starting another.
- `replay`: run `npx -y agent-theatre@latest replay --latest` and open the URL.
- `changes`: run `npx -y agent-theatre@latest changes` and show its output (the files the agent touched, with line counts). If a stage is running, also give its `?live=1&view=changes` URL for the map.
- `stop`: find the stage process for this folder (`~/.agent-theatre/ports/<port>` contains the folder path) and stop it.

The hooks are installed by this plugin, so the stage receives events immediately. Tell the user the URL and that this session is now playing on the stage. Do not paste file contents or prompts anywhere; the stage only ever receives paths and counts.
