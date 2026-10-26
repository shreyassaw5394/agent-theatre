import { chromium } from "playwright";
const port = process.argv[2] ?? "4848", cwd = "/Users/shreyassawant/ai-agent-browser", SID = "gl-" + Date.now();
const common = { session_id: SID, transcript_path: "/x", cwd, permission_mode: "default" };
const post = (p) => fetch(`http://127.0.0.1:${port}/hook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
const read = (p) => ({ ...common, hook_event_name: "PostToolUse", tool_name: "Read", tool_use_id: "t" + Math.random().toString(36).slice(2, 7), tool_input: { file_path: `${cwd}/${p}` }, tool_response: { type: "text", file: { filePath: `${cwd}/${p}`, content: "x\n", numLines: 1, startLine: 1, totalLines: 1 } } });
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await b.newContext({ viewport: { width: 1200, height: 700 } })).newPage();
await p.goto(`http://127.0.0.1:${port}/?live=1&set=island&nopreview=1`, { waitUntil: "load" }); await p.waitForFunction(() => globalThis.__agentTheatre?.player, null, { timeout: 20000 });
for (const f of ["packages/shared/src/types.ts", "packages/shared/src/schemas.ts", "apps/mcp/src/index.ts", "README.md"]) { await post(read(f)); await p.waitForTimeout(1200); }
await p.waitForTimeout(2500);
const st = async () => p.evaluate(() => { const s = globalThis.__agentTheatre.player.state; return { t: Math.round(s.t), dur: Math.round(s.duration), play: document.querySelector(".play span")?.textContent, golive: !document.querySelector(".golive").hidden }; });
console.log("at edge     ", JSON.stringify(await st()));
await p.evaluate(() => globalThis.__agentTheatre.panel.h.onSeek(1000)); await p.waitForTimeout(800);
console.log("scrubbed back", JSON.stringify(await st()));
await post(read("CLAUDE.md")); await p.waitForTimeout(1500);
console.log("new event    ", JSON.stringify(await st()), "(must stay back)");
await p.click(".golive"); await p.waitForTimeout(800);
console.log("after Go live", JSON.stringify(await st()));
await b.close();
