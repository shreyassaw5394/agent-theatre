// Plays a scene at fixed step and reports frames whose stage is nearly all white (the "goes white" bug).
import { chromium } from "playwright";
const [url, gpu = "swiftshader"] = process.argv.slice(2);
const args = gpu === "metal" ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const browser = await chromium.launch({ channel: "chrome", headless: true, args });
const page = await (await browser.newContext({ viewport: { width: 1200, height: 700 }, deviceScaleFactor: 2 })).newPage();
const errs = []; page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); }); page.on("pageerror", (e) => errs.push("pageerror " + String(e).slice(0, 200)));
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(() => globalThis.__agentTheatre?.player, null, { timeout: 20000 });
const out = [];
for (let i = 0; i < 46; i++) {
  await page.waitForTimeout(250);
  const r = await page.evaluate(() => {
    const p = globalThis.__agentTheatre.player;
    const px = p.app.renderer.extract.pixels({ target: p.app.stage, resolution: 0.06, frame: p.app.screen }).pixels;
    let sum = 0, white = 0, n = px.length / 4; for (let k = 0; k < px.length; k += 4) { const v = (px[k] + px[k + 1] + px[k + 2]) / 3; sum += v; if (v > 245) white++; }
    return { t: Math.round(p.state.t / 100) / 10, cur: p.state.current?.kind, zoom: Math.round(p.camera.scale * 100) / 100, mean: Math.round(sum / n), whitePct: Math.round(100 * white / n), wgl: p.app.renderer.name };
  });
  out.push(r);
}
console.log(JSON.stringify({ renderer: out[0]?.wgl, errs: errs.slice(0, 5), frames: out.map((r) => r && `${r.t}s ${r.cur} z${r.zoom} mean${r.mean} white${r.whitePct}%`) }, null, 1));
await browser.close();
