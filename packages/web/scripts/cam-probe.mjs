import { chromium } from "playwright";
const [url, frames = "400"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await (await browser.newContext({ viewport: { width: 1100, height: 650 } })).newPage();
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(() => globalThis.__agentTheatre?.player, null, { timeout: 20000 });
const r = await page.evaluate(async (n) => {
  const h = globalThis.__agentTheatre, st = h.player.stage; const out = [];
  for (let i = 0; i < n; i++) { await new Promise((res) => requestAnimationFrame(res)); out.push([h.player.state.t, st.position.x, st.position.y, st.scale.x]); }
  return out;
}, Number(frames));
let maxPan = 0, sumPan = 0, zoomChanges = 0, prev = r[0];
const speeds = [];
for (const f of r.slice(1)) { const d = Math.hypot(f[1] - prev[1], f[2] - prev[2]); speeds.push(d); maxPan = Math.max(maxPan, d); sumPan += d; if (Math.abs(f[3] - prev[3]) > 1e-4) zoomChanges++; prev = f; }
speeds.sort((a, b) => a - b);
console.log(JSON.stringify({ frames: r.length, sceneFrom: r[0][0], sceneTo: r.at(-1)[0], panPxPerFrame: { max: +maxPan.toFixed(1), p95: +speeds[Math.floor(speeds.length * 0.95)].toFixed(1), mean: +(sumPan / speeds.length).toFixed(2) }, framesWithZoomChange: zoomChanges, zoomRange: [Math.min(...r.map((f) => f[3])).toFixed(3), Math.max(...r.map((f) => f[3])).toFixed(3)] }));
await browser.close();
