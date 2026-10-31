#!/usr/bin/env node
// usage: node scripts/stageshot.mjs <base-url> <set> <out.png> [t] — a site gallery still of one stage (880×520, full-bleed).
import { chromium } from "playwright";
const [base = "http://127.0.0.1:4173/", set = "island", out = `stage-${set}.png`, t = "16"] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await b.newContext({ viewport: { width: 880, height: 520 } })).newPage();
const errs = []; p.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
await p.goto(`${base}?demo=episode-1&set=${set}&cinema=1&nopreview=1&t=${t}`, { waitUntil: "load" });
await p.waitForFunction(() => globalThis.__agentTheatre?.player?.world, null, { timeout: 20000 });
await p.waitForTimeout(3000);
await p.screenshot({ path: out });
console.log(JSON.stringify({ set, out, errs }));
await b.close();
