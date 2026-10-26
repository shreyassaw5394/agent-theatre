// Live smoothness: during a burst of events, count teleports (scene clock jumping > 900 ms between 200 ms samples).
import { chromium } from "playwright";
const port = process.argv[2] ?? "4848", cwd = "/Users/shreyassawant/ai-agent-browser", SID = "jp-" + Date.now();
const common = { session_id: SID, transcript_path: "/x", cwd, permission_mode: "default" };
const post = (p) => fetch(`http://127.0.0.1:${port}/hook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
const read = (p) => ({ ...common, hook_event_name: "PostToolUse", tool_name: "Read", tool_use_id: "t" + Math.random().toString(36).slice(2, 7), tool_input: { file_path: `${cwd}/${p}` }, tool_response: { type: "text", file: { filePath: `${cwd}/${p}`, content: "x\n", numLines: 1, startLine: 1, totalLines: 1 } } });
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const p = await (await b.newContext({ viewport: { width: 1200, height: 700 } })).newPage();
await p.goto(`http://127.0.0.1:${port}/?live=1&set=island&nopreview=1`, { waitUntil: "load" }); await p.waitForFunction(() => globalThis.__agentTheatre?.player, null, { timeout: 20000 });
await p.evaluate(() => { globalThis.__s = []; setInterval(() => { const pl = globalThis.__agentTheatre.player; globalThis.__s.push([performance.now(), pl.state.t, pl.state.rate, pl.state.current?.kind]); }, 200); });
const files = ["packages/shared/src/types.ts", "packages/shared/src/schemas.ts", "apps/mcp/src/index.ts", "README.md", "CLAUDE.md", "package.json", "src/pages/Index.tsx", "src/pages/Developers.tsx"];
for (const f of files) { await post(read(f)); await p.waitForTimeout(1500); }
await p.waitForTimeout(6000);
const r = await p.evaluate(() => { const s = globalThis.__s; let jumps = 0, maxJump = 0; const rates = new Set(); for (let i = 1; i < s.length; i++) { const d = s[i][1] - s[i - 1][1]; rates.add(s[i][2]); if (d > 900) { jumps++; maxJump = Math.max(maxJump, d); } } const pl = globalThis.__agentTheatre.player; return { samples: s.length, teleports: jumps, maxJumpMs: Math.round(maxJump), ratesSeen: [...rates], behindAtEnd: Math.round(pl.state.duration - pl.state.t), kinds: [...new Set(s.map((x) => x[3]))] }; });
console.log(JSON.stringify(r));
await b.close();
