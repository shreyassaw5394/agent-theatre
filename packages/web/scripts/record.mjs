#!/usr/bin/env node
// usage: node scripts/record.mjs "<url>" <outdir> [seconds]
// Records a clip with the system Chrome (no browser download), then tiles frames into a contact sheet.
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
const [url, outdir = "rec", secs = "10"] = process.argv.slice(2);
if (!url) { console.error("usage: node scripts/record.mjs <url> <outdir> [seconds]"); process.exit(2); }
mkdirSync(outdir, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 1100, height: 650 }, recordVideo: { dir: outdir, size: { width: 1100, height: 650 } }, reducedMotion: "no-preference" });
const page = await ctx.newPage();
const logs = [];
page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
page.on("pageerror", (e) => logs.push(`pageerror: ${String(e).slice(0, 200)}`));
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(Number(secs) * 1000);
const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }));
await ctx.close(); await browser.close();
const vid = readdirSync(outdir).find((f) => f.endsWith(".webm"));
if (vid) renameSync(join(outdir, vid), join(outdir, "clip.webm"));
// contact sheet: 12 frames, 4x3
const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", join(outdir, "clip.webm"), "-vf", `fps=${12 / Number(secs)},scale=550:-1,tile=4x3`, "-frames:v", "1", join(outdir, "sheet.png")], { encoding: "utf8" });
if (r.status !== 0) console.error(r.stderr.slice(-400));
console.log(JSON.stringify({ clip: join(outdir, "clip.webm"), sheet: join(outdir, "sheet.png"), fpsInSoftwareGL: fps, console: logs.slice(0, 10) }, null, 2));
