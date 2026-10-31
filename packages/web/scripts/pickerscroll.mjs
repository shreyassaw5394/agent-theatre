#!/usr/bin/env node
// usage: node scripts/pickerscroll.mjs <base-url> — opens the set picker in a small, VS Code-sized panel and checks
// that the wheel scrolls the cards (and leaves the camera alone), on desktop and on a short panel.
import { chromium } from "playwright";
const [base = "http://127.0.0.1:4173/"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
let failed = 0;
for (const vp of [{ width: 520, height: 640 }, { width: 760, height: 520 }, { width: 1200, height: 760 }]) {
  const page = await (await browser.newContext({ viewport: vp })).newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  await page.goto(`${base}?paused=1`, { waitUntil: "load" });
  await page.waitForFunction(() => globalThis.__agentTheatre?.player?.world, null, { timeout: 20000 });
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await page.getByRole("button", { name: /^All \d+ sets$/ }).click();
  const box = await page.locator(".setcards").boundingBox();
  const before = await page.evaluate(() => ({ top: document.querySelector(".setcards").scrollTop, max: document.querySelector(".setcards").scrollHeight - document.querySelector(".setcards").clientHeight, zoom: globalThis.__agentTheatre.app.stage.scale.x }));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(60); }
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({ top: document.querySelector(".setcards").scrollTop, zoom: globalThis.__agentTheatre.app.stage.scale.x }));
  // previews finishing re-render the open picker: the reader must stay where they were
  const kept = await page.evaluate(() => { const top = document.querySelector(".setcards").scrollTop; globalThis.__agentTheatre.panel.showPicker(true); return document.querySelector(".setcards").scrollTop === top; });
  // every card can be reached: the last one scrolls fully into view and is clickable
  const last = page.locator(".setcard").last();
  await last.scrollIntoViewIfNeeded();
  const lastBox = await last.boundingBox(), pick = await page.locator(".picker").boundingBox();
  const lastVisible = !!lastBox && lastBox.y >= pick.y - 1 && lastBox.y + lastBox.height <= pick.y + pick.height + 1;
  const headVisible = await page.evaluate(() => { const h = document.querySelector(".picker h3").getBoundingClientRect(), p = document.querySelector(".picker").getBoundingClientRect(); return h.top >= p.top - 1; });
  const ok = (before.max <= 0 || after.top > before.top) && Math.abs(after.zoom - before.zoom) < 1e-3 && lastVisible && headVisible && kept && !errs.length;
  if (!ok) failed++;
  console.log(JSON.stringify({ vp, scrollable: before.max > 0, scrolled: after.top - before.top, zoomChanged: +(after.zoom - before.zoom).toFixed(4), kept, lastVisible, headVisible, errs, ok }));
}
await browser.close();
process.exit(failed ? 1 : 0);
