// Live stage: a SessionEnd from a background/second session must not show the end card.
import { chromium } from "playwright";
const port = process.argv[2] ?? "4848", cwd = "/Users/shreyassawant/ai-agent-browser";
const post = (p) => fetch(`http://127.0.0.1:${port}/hook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
const ev = (sid, extra) => ({ session_id: sid, transcript_path: "/x", cwd, permission_mode: "default", ...extra });
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await b.newContext({ viewport: { width: 1200, height: 700 } })).newPage();
await p.goto(`http://127.0.0.1:${port}/?live=1&set=island&nopreview=1`, { waitUntil: "load" }); await p.waitForFunction(() => globalThis.__agentTheatre?.player, null, { timeout: 20000 });
await post(ev("main", { hook_event_name: "PostToolUse", tool_name: "Read", tool_use_id: "a", tool_input: { file_path: `${cwd}/README.md` }, tool_response: { type: "text", file: { filePath: `${cwd}/README.md`, content: "x\n", numLines: 1, startLine: 1, totalLines: 1 } } }));
await post(ev("bg", { hook_event_name: "SessionStart", source: "resume" })); await post(ev("bg", { hook_event_name: "SessionEnd", reason: "other" }));
await post(ev("main", { hook_event_name: "SessionEnd", reason: "other" }));
await p.waitForTimeout(3000);
const r = await p.evaluate(() => ({ endCardVisible: !document.querySelector(".card:last-of-type")?.hidden && !!document.querySelector(".stage .card:not([hidden])") && /story/.test(document.querySelector(".stage .card:not([hidden])")?.textContent ?? ""), beats: globalThis.__agentTheatre.player.beatCount, cur: globalThis.__agentTheatre.player.state.current?.kind, playBtn: document.querySelector(".play span")?.textContent }));
console.log(JSON.stringify(r));
await b.close();
