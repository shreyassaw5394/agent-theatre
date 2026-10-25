import { chromium } from "playwright";
const [url, w = "1728", h = "1117", dpr = "2"] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await b.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr })).newPage();
await p.goto(url, { waitUntil: "load" }); await p.waitForFunction(() => globalThis.__agentTheatre?.player, null, { timeout: 20000 }); await p.waitForTimeout(3000);
console.log(JSON.stringify(await p.evaluate(() => {
  const pl = globalThis.__agentTheatre.player, r = pl.app.renderer, c = pl.app.canvas, st = c.parentElement.getBoundingClientRect(), cs = c.getBoundingClientRect();
  const cam = pl.camera; const pts = pl.world.places.map((q) => q);
  return { stageEl: [Math.round(st.width), Math.round(st.height)], canvasCss: [Math.round(cs.width), Math.round(cs.height)], canvasAttr: [c.width, c.height], renderer: [r.width, r.height, r.resolution], screen: [r.screen.width, r.screen.height], cam: { cx: Math.round(cam.cx), cy: Math.round(cam.cy), zoom: +cam.zoom.toFixed(3), tz: +cam.tz.toFixed(3) }, stagePos: [Math.round(cam.stage.position.x), Math.round(cam.stage.position.y)], cur: pl.state.current?.kind, places: pts.length, bounds: pl.world.bounds };
}), null, 1));
await p.screenshot({ path: "/private/tmp/claude-501/-Users-shreyassawant-ai-agent-browser/2782f23d-86de-44fc-b381-e1f5af206722/scratchpad/camsize.png" });
await b.close();
