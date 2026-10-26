// At the live edge with no events: does the character keep moving (breathing, glances, hop)?
import { chromium } from "playwright";
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await b.newContext({ viewport: { width: 1200, height: 700 } })).newPage();
await p.goto("http://127.0.0.1:4848/?live=1&set=island&nopreview=1", { waitUntil: "load" }); await p.waitForFunction(() => globalThis.__agentTheatre?.player, null, { timeout: 20000 });
await p.evaluate(() => { const pl = globalThis.__agentTheatre.player;  globalThis.__poses = []; setInterval(() => { const a = pl.pip.pose; globalThis.__poses.push([a.face, +a.sy.toFixed(3), +a.lift.toFixed(1), a.look]); }, 250); });
await p.waitForTimeout(9000);
console.log(JSON.stringify(await p.evaluate(() => { const s = globalThis.__poses; return { samples: s.length, faces: [...new Set(s.map((x) => x[0]))], syRange: [Math.min(...s.map((x) => x[1])), Math.max(...s.map((x) => x[1]))], maxLift: Math.max(...s.map((x) => x[2])), looks: [...new Set(s.map((x) => x[3]))], playing: globalThis.__agentTheatre.player.playing }; })));
await b.close();
