#!/usr/bin/env node
// usage: node scripts/probe.mjs "<url>" [waitMs] — dumps console + renderer/player state. For debugging only.
import { chromium } from "playwright";
const [url, wait = "6000", shot = ""] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await (await browser.newContext({ viewport: { width: 1100, height: 650 } })).newPage();
const logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text().slice(0, 300)}`));
page.on("pageerror", (e) => logs.push(`PAGEERROR: ${String(e.stack || e).slice(0, 600)}`));
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(Number(wait));
const state = await page.evaluate(() => {
  const h = globalThis.__agentTheatre; if (!h) return { noHandle: true };
  const r = h.app.renderer, st = h.app.stage, p = h.player;
  const gl = r.gl; const vp = gl ? Array.from(gl.getParameter(gl.VIEWPORT)) : null;
  return { renderer: { w: r.width, h: r.height, res: r.resolution, canvas: [h.app.canvas.width, h.app.canvas.height], glViewport: vp }, stage: { children: st.children.length, scale: st.scale.x, pos: [st.position.x, st.position.y] }, player: p ? { t: p.state.t, places: p.world.places.length, lead: p.leadName, worldChildren: p.worldLayer.container.children.length } : null, previews: h.panel.previews.size };
});
if (shot) { await page.screenshot({ path: shot }); console.log("shot", shot); }
console.log(JSON.stringify(state, null, 2));
console.log("console:\n  " + logs.filter((l) => !/GPU stall|DevTools/.test(l)).slice(0, 25).join("\n  "));
await browser.close();
