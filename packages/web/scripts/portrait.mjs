#!/usr/bin/env node
// usage: node scripts/portrait.mjs <outdir> [ids...] — renders cast portraits with transparent backgrounds from the running dev server.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const [outdir = "portraits", ...ids] = process.argv.slice(2);
const all = ids.length ? ids : ["pip", "mo", "juno", "rook", "fen", "sol", "ivy", "bolt", "ash", "nimbus", "ember", "tove"];
mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await (await browser.newContext({ viewport: { width: 320, height: 320 }, deviceScaleFactor: 2 })).newPage();
for (const id of all) {
  await page.goto(`http://127.0.0.1:5173/?portrait=${id}`, { waitUntil: "load" });
  await page.waitForFunction(() => globalThis.__agentTheatre?.player, null, { timeout: 20_000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${outdir}/cast-${id}.png`, omitBackground: true, clip: { x: 0, y: 0, width: 320, height: 320 } });
  console.log(id);
}
await browser.close();
