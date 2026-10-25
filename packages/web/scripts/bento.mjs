import { chromium } from "playwright";
const [url, out] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const [w, h] of [[1295, 635], [2590, 1270], [1024, 768]]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  await p.goto(url + "#why", { waitUntil: "load" }); await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelector("#why").scrollIntoView());
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => { const cells = [...document.querySelectorAll(".cell:has(.mascot)")].map((c) => { const m = c.querySelector(".mascot").getBoundingClientRect(), t = c.querySelector("h3").getBoundingClientRect(), n = c.querySelector(".n").getBoundingClientRect(); return { overlapH3: m.left < t.right && m.bottom > t.top, overlapN: m.left < n.right && m.bottom > n.top }; }); return { cells, scrollW: document.documentElement.scrollWidth, vw: innerWidth }; });
  console.log(`${w}x${h}`, JSON.stringify(r));
  await p.screenshot({ path: `${out}/bento-${w}.png` }); await p.close();
}
await b.close();
