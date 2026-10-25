#!/usr/bin/env node
// Records the launch film: a terminal (left) installing Agent Theatre and running Claude Code on the LastSearch
// repo, side by side with the real live stage (right) reacting to the same events, delivered through the real
// hook endpoint. usage: node scripts/launch-video.mjs <theatrePort> <outdir> [cwd]
import { chromium } from "playwright";
import { mkdirSync, readdirSync, renameSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
const [port = "4848", outdir = "launch", cwd = "/Users/shreyassawant/ai-agent-browser"] = process.argv.slice(2);
mkdirSync(outdir, { recursive: true });
const W = 1600, H = 900;
const SID = "6b0e0a5c-launch-0000-0000-000000000001";
const common = { session_id: SID, transcript_path: `/Users/shreyassawant/.claude/projects/-Users-shreyassawant-ai-agent-browser/${SID}.jsonl`, cwd, permission_mode: "default" };
const post = async (payload) => { try { await fetch(`http://127.0.0.1:${port}/hook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); } catch {} };
const read = (p, lines) => ({ ...common, hook_event_name: "PostToolUse", tool_name: "Read", tool_use_id: "toolu_lv_" + Math.random().toString(36).slice(2, 8), tool_input: { file_path: `${cwd}/${p}` }, tool_response: { type: "text", file: { filePath: `${cwd}/${p}`, content: "…\n".repeat(lines), numLines: lines, startLine: 1, totalLines: lines } } });
const grep = (pattern) => ({ ...common, hook_event_name: "PostToolUse", tool_name: "Grep", tool_use_id: "toolu_lv_g1", tool_input: { pattern, path: cwd }, tool_response: { mode: "files_with_matches", numFiles: 3, filenames: ["a", "b", "c"] } });
const edit = (p, plus, minus) => ({ ...common, hook_event_name: "PostToolUse", tool_name: "Edit", tool_use_id: "toolu_lv_e1", duration_ms: 380, tool_input: { file_path: `${cwd}/${p}`, old_string: "a", new_string: "b", replace_all: false }, tool_response: { filePath: `${cwd}/${p}`, oldString: "a", newString: "b", originalFile: "…", structuredPatch: [{ oldStart: 1, oldLines: minus + 2, newStart: 1, newLines: plus + 2, lines: [" ctx", ...Array(minus).fill("-x"), ...Array(plus).fill("+y"), " ctx"] }], userModified: false, replaceAll: false } });
const VITEST = "\n ✓ tests/constants.test.ts (12 tests) 41ms\n\n Test Files  1 passed (1)\n      Tests  12 passed (12)\n   Start at  10:31:02\n   Duration  0.62s\n";
const bash = (command, stdout) => ({ ...common, hook_event_name: "PostToolUse", tool_name: "Bash", tool_use_id: "toolu_lv_b" + Math.random().toString(36).slice(2, 6), duration_ms: 1400, tool_input: { command, description: "" }, tool_response: { stdout, stderr: "", interrupted: false, isImage: false, noOutputExpected: false } });

// the terminal script: [delay before, kind, text, hook payload or null]
const script = [
  [600, "cmd", "cd ~/lastsearch", null],
  [900, "cmd", "npx agent-theatre hooks install", null],
  [1100, "out", "Hooks installed → ~/.claude/settings.json (backup kept).\nClaude Code picks them up without a restart.", null],
  [900, "cmd", "npx agent-theatre", null],
  [1200, "out", "Agent Theatre · lastsearch · 411 files\n▶ http://127.0.0.1:" + port + "/?live=1", null],
  [1400, "cmd", "claude", { ...common, hook_event_name: "SessionStart", source: "startup" }],
  [1200, "user", "add a MAX_SOURCES constant to shared and run the tests", null],
  [1600, "tool", "Read(packages/shared/src/constants.ts)", read("packages/shared/src/constants.ts", 120)],
  [2600, "tool", "Read(packages/shared/src/types.ts)", read("packages/shared/src/types.ts", 340)],
  [2600, "tool", "Search(pattern: \"MAX_SOURCES\")", grep("MAX_SOURCES")],
  [2400, "tool", "Update(packages/shared/src/constants.ts)\n  ⎿  Added 3 lines, removed 1 line", edit("packages/shared/src/constants.ts", 3, 1)],
  [3600, "tool", "Bash(npx pnpm --filter shared test)\n  ⎿  Tests  12 passed (12)", bash("npx pnpm --filter shared test", VITEST)],
  [4200, "say", "Added MAX_SOURCES to packages/shared/src/constants.ts. All 12 tests pass.", { ...common, hook_event_name: "Stop", stop_hook_active: false, last_assistant_message: "Added MAX_SOURCES to packages/shared/src/constants.ts. All 12 tests pass." }],
  [6000, "end", "", null],
];

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#000;overflow:hidden;font-family:-apple-system,"SF Pro Text",system-ui,sans-serif}
.wrap{display:grid;grid-template-columns:38% 62%;height:100vh}
.term{background:#0b0f16;color:#d8e0ea;font:15px/1.65 "JetBrains Mono","SF Mono",Menlo,monospace;padding:18px 22px;position:relative;overflow:hidden;border-right:1px solid rgba(255,255,255,.08)}
.bar{display:flex;gap:7px;margin-bottom:14px}.bar i{width:12px;height:12px;border-radius:50%;background:#2d3340;display:block}.bar i:nth-child(1){background:#ff5f57}.bar i:nth-child(2){background:#febc2e}.bar i:nth-child(3){background:#28c840}
.line{white-space:pre-wrap;word-break:break-word;margin:0 0 4px}.cmd{color:#fff}.cmd::before{content:"$ ";color:#7fe08a}.out{color:#9fb0c8}.user{color:#ffd27e}.user::before{content:"> ";color:#ffd27e}.tool{color:#d8e0ea}.tool::before{content:"⏺ ";color:#7fa8ff}.say{color:#7fe08a}.say::before{content:"⏺ ";color:#7fe08a}
.cur{display:inline-block;width:9px;height:17px;background:#d8e0ea;vertical-align:-3px;animation:b 1s steps(2) infinite}@keyframes b{50%{opacity:0}}
.stage{position:relative;background:#0d1829}.stage iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.tag{position:absolute;left:22px;bottom:16px;color:rgba(255,255,255,.55);font:13px/1 -apple-system,system-ui;letter-spacing:.12em;text-transform:uppercase}
.brand{position:absolute;right:22px;top:16px;color:#ffb53d;font:700 13px/1 -apple-system,system-ui;letter-spacing:.14em;text-transform:uppercase;text-shadow:0 1px 8px #000}
</style></head><body><div class="wrap">
<div class="term"><div class="bar"><i></i><i></i><i></i></div><div id="lines"></div><span class="cur" id="cur"></span><div class="tag">Terminal · Claude Code</div></div>
<div class="stage"><iframe src="http://127.0.0.1:${port}/?live=1&set=metropolis&cinema=1&nopreview=1" allow="autoplay"></iframe><div class="brand">agenttheatre.dev</div></div>
</div></body></html>`;

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: outdir, size: { width: W, height: H } } });
const page = await ctx.newPage();
await page.setContent(html, { waitUntil: "load" });
await page.waitForTimeout(3500); // let the stage open its curtain
const type = async (kind, text) => {
  await page.evaluate(([kind, text]) => {
    const lines = document.getElementById("lines"), cur = document.getElementById("cur");
    const el = document.createElement("div"); el.className = "line " + kind; lines.appendChild(el); lines.appendChild(cur);
    return new Promise((res) => { if (kind !== "cmd" && kind !== "user") { el.textContent = text; return res(); } let i = 0; const t = setInterval(() => { el.textContent = text.slice(0, ++i); if (i >= text.length) { clearInterval(t); res(); } }, 28); });
  }, [kind, text]);
};
for (const [delay, kind, text, payload] of script) {
  await page.waitForTimeout(delay);
  if (kind === "end") break;
  await type(kind, text);
  if (payload) await post(payload);
}
await page.waitForTimeout(500);
await ctx.close(); await browser.close();
const webm = readdirSync(outdir).find((f) => f.endsWith(".webm"));
renameSync(join(outdir, webm), join(outdir, "launch.webm"));
const r = spawnSync("ffmpeg", ["-y", "-i", join(outdir, "launch.webm"), "-ss", "1.2", "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", join(outdir, "agent-theatre-launch.mp4")], { encoding: "utf8" });
console.log(r.status === 0 ? "mp4 ok" : r.stderr.slice(-600));
spawnSync("ffmpeg", ["-y", "-i", join(outdir, "agent-theatre-launch.mp4"), "-ss", "28", "-frames:v", "1", join(outdir, "poster.png")]);
console.log(join(outdir, "agent-theatre-launch.mp4"));
