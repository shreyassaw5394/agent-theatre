// Switches sets at runtime (no reload) and reports whether the new stage actually renders.
import { chromium } from "playwright";
const [url, out] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await b.newContext({ viewport: { width: 1200, height: 700 } })).newPage();
const errs = []; p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(m.type() + ": " + m.text().slice(0, 160)); }); p.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 200)));
await p.goto(url, { waitUntil: "load" }); await p.waitForFunction(() => globalThis.__agentTheatre?.player, null, { timeout: 20000 }); await p.waitForTimeout(2000);
for (const set of ["lanterns", "orbit", "volcano"]) {
  await p.evaluate((id) => globalThis.__agentTheatre.panel.h.onPickSet(id), set);
  await p.waitForTimeout(2500);
  const r = await p.evaluate(() => { const pl = globalThis.__agentTheatre.player; const px = pl.app.renderer.extract.pixels({ target: pl.app.stage, resolution: 0.05, frame: pl.app.screen }).pixels; let dark = 0, n = px.length / 4; for (let k = 0; k < px.length; k += 4) if (px[k] + px[k + 1] + px[k + 2] < 60) dark++; return { set: pl.theme.id, t: Math.round(pl.state.t), playing: pl.playing, cur: pl.state.current?.kind, stageChildren: pl.app.stage.children.length, objects: pl.worldLayer.container.children.length, darkPct: Math.round(100 * dark / n), textures: pl.app.renderer.texture.managedTextures.length }; });
  console.log(JSON.stringify(r));
  await p.screenshot({ path: `${out}/switch-${set}.png` });
}
console.log(errs.slice(0, 8).join("\n") || "no console errors");
await b.close();
