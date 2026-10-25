import { chromium } from "playwright";
const [url, out] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
await p.goto(url, { waitUntil: "load" }); await p.waitForTimeout(2500);
// trigger every reveal
await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 350)); } scrollTo(0, 0); });
await p.waitForTimeout(2500);
await p.screenshot({ path: out, fullPage: true });
await b.close();
