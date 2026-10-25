// Real-GPU flow: load with previews, switch sets at runtime, and measure the *actual* canvas pixels via a screenshot
// (extract() re-renders and can hide a dead context). Also reports WebGL context-lost events.
import { chromium } from "playwright";
const [url, gpu = "metal", ...sets] = process.argv.slice(2);
const args = gpu === "metal" ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] : ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const b = await chromium.launch({ channel: "chrome", headless: true, args });
const ctx = await b.newContext({ viewport: { width: 1400, height: 800 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { globalThis.__ctxEvents = []; const orig = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (...a) { const g = orig.apply(this, a); if (g && !this.__hooked) { this.__hooked = true; this.addEventListener("webglcontextlost", () => globalThis.__ctxEvents.push("lost@" + Math.round(performance.now()))); this.addEventListener("webglcontextrestored", () => globalThis.__ctxEvents.push("restored@" + Math.round(performance.now()))); } return g; }; });
const p = await ctx.newPage();
const errs = []; p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 160)); }); p.on("pageerror", (e) => errs.push("pageerror " + String(e.stack || e).slice(0, 400)));
await p.goto(url, { waitUntil: "load" }); await p.waitForFunction(() => globalThis.__agentTheatre?.player, null, { timeout: 30000 });
const measure = async (label) => {
  await p.waitForTimeout(300);
  const stage = await p.$(".stage canvas"); const box = await stage.boundingBox();
  const png = (await p.screenshot({ clip: box })).toString("base64");
  const r = await p.evaluate(async ([b64, label]) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = 64; c.height = 36; const g = c.getContext("2d"); g.drawImage(img, 0, 0, 64, 36);
    const d = g.getImageData(0, 0, 64, 36).data; let sum = 0, uniq = new Set(); for (let k = 0; k < d.length; k += 4) { sum += d[k] + d[k + 1] + d[k + 2]; uniq.add((d[k] >> 4) + "," + (d[k + 1] >> 4) + "," + (d[k + 2] >> 4)); }
    const pl = globalThis.__agentTheatre.player; const gl = pl.app.renderer.gl;
    return `${label}: set=${pl.theme.id} t=${Math.round(pl.state.t / 1000)}s mean=${Math.round(sum / (d.length / 4) / 3)} colours=${uniq.size} ctxLost=${gl?.isContextLost?.()} events=[${globalThis.__ctxEvents}] textures=${pl.app.renderer.texture.managedTextures.length}`;
  }, [png, label]);
  console.log(r);
};
await p.waitForTimeout(6000); await measure("after load (previews built)");
for (const s of sets.length ? sets : ["orbit", "volcano", "lanterns", "island"]) {
  await p.evaluate((id) => globalThis.__agentTheatre.panel.h.onPickSet(id), s);
  await p.waitForTimeout(4000); await measure(`switched to ${s}`);
  await p.waitForTimeout(8000); await measure(`${s} +8s`);
}
console.log(errs.length ? "console: " + errs.slice(0, 6).join(" | ") : "no console errors");
await b.close();
