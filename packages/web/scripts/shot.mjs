#!/usr/bin/env node
// usage: node scripts/shot.mjs "<url>" out.png [width height]
// Needs the Vite dev server running. Uses system Chrome with software WebGL.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
const [url, out = "shot.png", w = "1280", h = "760"] = process.argv.slice(2);
if (!url) { console.error("usage: node scripts/shot.mjs <url> <out.png> [w h]"); process.exit(2); }
const candidates = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium", "/usr/bin/google-chrome", "/usr/bin/chromium"];
const chrome = candidates.find((c) => existsSync(c));
if (!chrome) { console.error("no Chrome found"); process.exit(1); }
const r = spawnSync(chrome, ["--headless=new", "--disable-gpu", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars", "--force-device-scale-factor=1", `--window-size=${w},${h}`, "--virtual-time-budget=3500", "--enable-logging=stderr", "--v=0", `--screenshot=${out}`, url], { encoding: "utf8", timeout: 60_000 });
const consoleLines = (r.stderr || "").split("\n").filter((l) => /CONSOLE\(/.test(l) && !/DevTools|Download the React|GPU stall/.test(l)).map((l) => l.replace(/^.*CONSOLE\(\d+\)\]\s*/, "").slice(0, 240));
if (consoleLines.length) console.error("console:\n  " + consoleLines.slice(0, 12).join("\n  "));
if (r.status !== 0) { console.error(r.stderr.slice(-600)); process.exit(r.status ?? 1); }
console.log(out);
