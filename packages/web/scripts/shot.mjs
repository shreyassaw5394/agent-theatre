#!/usr/bin/env node
// usage: node scripts/shot.mjs "<url>" out.png [width height] — a frame of the running dev server (Playwright on system Chrome; waits for the scene).
import { chromium } from "playwright";
const [url, out = "shot.png", w = "1100", h = "650"] = process.argv.slice(2);
if (!url) { console.error("usage: node scripts/shot.mjs <url> <out.png> [w h]"); process.exit(2); }
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await (await browser.newContext({ viewport: { width: Number(w), height: Number(h) } })).newPage();
const logs = [];
page.on("console", (m) => { if (["error", "warning"].includes(m.type()) && !/GPU stall/.test(m.text())) logs.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
page.on("pageerror", (e) => logs.push(`pageerror: ${String(e).slice(0, 300)}`));
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(() => globalThis.__agentTheatre?.player, null, { timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(2500);
await page.screenshot({ path: out });
if (logs.length) console.error("console:\n  " + logs.slice(0, 10).join("\n  "));
console.log(out);
await browser.close();
