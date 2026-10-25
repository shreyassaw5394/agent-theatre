import { chromium } from "playwright";
const [url, out] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const [w, h] of [[1295, 635], [1440, 780], [1920, 1080], [820, 1180], [390, 844]]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
  await p.goto(url, { waitUntil: "load" }); await p.waitForTimeout(2500);
  const r = await p.evaluate(() => { const h1 = document.querySelector("h1").getBoundingClientRect(), nav = document.querySelector(".nav").getBoundingClientRect(), par = document.querySelector(".parade").getBoundingClientRect(); return { h1Top: Math.round(h1.top), navBottom: Math.round(nav.bottom), paradeBottom: Math.round(par.bottom), vh: innerHeight, scrollW: document.documentElement.scrollWidth, vw: innerWidth }; });
  console.log(`${w}x${h}`, JSON.stringify(r), r.h1Top < r.navBottom ? "HEADLINE UNDER NAV" : "", r.scrollW > r.vw ? "H-OVERFLOW" : "");
  await p.screenshot({ path: `${out}/${w}x${h}.png` }); await p.close();
}
await b.close();
