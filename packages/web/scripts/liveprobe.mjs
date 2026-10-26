// Live latency: post hook events spaced in real time and watch what the stage is showing versus what has arrived.
import { chromium } from "playwright";
const [port = "4848"] = process.argv.slice(2);
const cwd = "/Users/shreyassawant/ai-agent-browser", SID = "probe-" + Date.now();
const common = { session_id: SID, transcript_path: "/x", cwd, permission_mode: "default" };
const post = (p) => fetch(`http://127.0.0.1:${port}/hook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
const read = (p) => ({ ...common, hook_event_name: "PostToolUse", tool_name: "Read", tool_use_id: "t" + Math.random().toString(36).slice(2, 7), tool_input: { file_path: `${cwd}/${p}` }, tool_response: { type: "text", file: { filePath: `${cwd}/${p}`, content: "x\n", numLines: 1, startLine: 1, totalLines: 1 } } });
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await b.newContext({ viewport: { width: 1200, height: 700 } })).newPage();
await p.goto(`http://127.0.0.1:${port}/?live=1&set=island&nopreview=1`, { waitUntil: "load" });
await p.waitForFunction(() => globalThis.__agentTheatre?.player, null, { timeout: 20000 }); await p.waitForTimeout(1500);
const sample = async (label) => console.log(label, JSON.stringify(await p.evaluate(() => { const pl = globalThis.__agentTheatre.player; const s = pl.state; return { t: Math.round(s.t), dur: Math.round(s.duration), playing: s.playing, cur: s.current?.kind, beats: pl.beatCount, caption: document.querySelector(".caption span")?.textContent?.slice(0, 60) }; })));
await post({ ...common, hook_event_name: "SessionStart", source: "startup" }); await p.waitForTimeout(1500); await sample("after start  ");
for (const f of ["packages/shared/src/types.ts", "packages/shared/src/schemas.ts", "apps/mcp/src/index.ts"]) { await post(read(f)); await p.waitForTimeout(4000); await sample("after read   "); }
await post({ ...common, hook_event_name: "Stop", stop_hook_active: false, last_assistant_message: "Looked at the shared types and schemas. Which endpoint should I wire the new field into: /browse/answer or /browse/stream?" });
await p.waitForTimeout(3000); await sample("after stop   ");
await b.close();
