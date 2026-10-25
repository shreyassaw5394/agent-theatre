// Runs a scene fast and samples Pixi's managed texture count + JS heap to catch per-frame allocations.
import { chromium } from "playwright";
const [url, secs = "40"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--enable-precise-memory-info"] });
const page = await (await browser.newContext({ viewport: { width: 1100, height: 650 } })).newPage();
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(() => globalThis.__agentTheatre?.player, null, { timeout: 20000 });
const samples = [];
for (let i = 0; i <= Number(secs) / 5; i++) {
  samples.push(await page.evaluate(() => { const p = globalThis.__agentTheatre.player; const r = p.app.renderer; return { t: Math.round(p.state.t / 1000), textures: r.texture?.managedTextures?.length ?? -1, heapMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576), cur: p.state.current?.kind }; }));
  await page.waitForTimeout(5000);
}
console.log(samples.map((s) => `${s.t}s ${s.cur} textures=${s.textures} heap=${s.heapMB}MB`).join("\n"));
await browser.close();
