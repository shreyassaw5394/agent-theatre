// Screenshots a page at several viewports and reports horizontal overflow + elements wider than the viewport.
import { chromium } from "playwright";
const [url, outdir] = process.argv.slice(2);
const sizes = [[390, 844], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const [w, h] of sizes) {
  const page = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
  const errs = []; page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 140)); });
  await page.goto(url, { waitUntil: "load" }); await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const over = document.documentElement.scrollWidth - innerWidth;
    const wide = [...document.querySelectorAll("body *")].filter((el) => { const b = el.getBoundingClientRect(); return b.width > innerWidth + 1 || b.right > innerWidth + 1 && b.width > 40; }).slice(0, 8).map((el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""} w${Math.round(el.getBoundingClientRect().width)} r${Math.round(el.getBoundingClientRect().right)}`);
    const frames = [...document.querySelectorAll("iframe")].map((f) => { const b = f.getBoundingClientRect(); return `iframe ${Math.round(b.width)}x${Math.round(b.height)}`; });
    return { overflowPx: over, wide, frames };
  });
  console.log(`${w}x${h}`, JSON.stringify(r), errs.length ? "errors: " + errs.join(" | ") : "");
  await page.screenshot({ path: `${outdir}/${w}.png`, fullPage: false });
  await page.close();
}
await browser.close();
