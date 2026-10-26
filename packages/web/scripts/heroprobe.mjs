import { chromium } from "playwright";
const [url, out] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await p.goto(url, { waitUntil: "load" }); await p.waitForTimeout(400); await p.screenshot({ path: out + "-0.4s.png" });
await p.waitForTimeout(2200); await p.screenshot({ path: out + "-2.6s.png" });
const r = await p.evaluate(() => { const ws = [...document.querySelectorAll(".hero h1 .w")]; const ops = ws.map((w) => +getComputedStyle(w).opacity); const em = document.querySelector(".hero h1 em .w"); return { words: ws.length, allVisible: ops.every((o) => o > 0.95), emColor: getComputedStyle(em).color, emClip: getComputedStyle(em).webkitBackgroundClip || getComputedStyle(em).backgroundClip, veilOpacity: getComputedStyle(document.querySelector(".veil")).opacity, blur: getComputedStyle(document.querySelector(".hero .copy")).backdropFilter }; });
console.log(JSON.stringify(r)); await b.close();
