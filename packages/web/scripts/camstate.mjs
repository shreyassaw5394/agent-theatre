import { chromium } from "playwright";
const url = process.argv[2];
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await (await browser.newContext({ viewport: { width: 1100, height: 650 } })).newPage();
page.on("pageerror", (e) => console.log("pageerror", String(e)));
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(() => globalThis.__agentTheatre?.player, null, { timeout: 20000 });
await page.waitForTimeout(2500);
console.log(JSON.stringify(await page.evaluate(() => {
  const p = globalThis.__agentTheatre.player; const cam = p.camera; const st = cam.stage;
  return { t: p.t, cur: p.current?.kind, cam: { cx: cam.cx, cy: cam.cy, tx: cam.tx, ty: cam.ty, zoom: cam.zoom, tz: cam.tz }, stage: { x: st.position.x, y: st.position.y, sx: st.scale.x }, pip: p.pip?.drawn, pose: p.pip?.pose, camTarget: p.camTarget, bounds: p.world?.bounds, places: p.world?.places?.length, view: { w: p.app.renderer.width, h: p.app.renderer.height, res: p.app.renderer.resolution } };
}), null, 1));
await browser.close();
