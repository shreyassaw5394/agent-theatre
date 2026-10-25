import { chromium } from "playwright";
const out = process.argv[2];
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const shots = [
  ["site-1728", "https://agenttheatre.dev/", 1728, 1117, 2],
  ["site-1728-scrolled", "https://agenttheatre.dev/#episodes", 1728, 1117, 2],
  ["site-1280x720", "https://agenttheatre.dev/", 1280, 720, 1],
  ["theatre-1728", "https://agenttheatre.dev/theatre/?demo=feature&set=harbour&t=10&paused=1&nopreview=1", 1728, 1117, 2],
  ["theatre-1280x720", "https://agenttheatre.dev/theatre/?demo=feature&set=harbour&t=10&paused=1&nopreview=1", 1280, 720, 1],
  ["theatre-900x1100", "https://agenttheatre.dev/theatre/?demo=feature&set=harbour&t=10&paused=1&nopreview=1", 900, 1100, 1],
];
for (const [name, url, w, h, dpr] of shots) {
  const p = await (await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr })).newPage();
  const errs = []; p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 120)); }); p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
  await p.goto(url, { waitUntil: "load" }); await p.waitForTimeout(3500);
  await p.screenshot({ path: `${out}/${name}.png` });
  console.log(name, errs.length ? "ERR " + errs.join(" | ") : "ok");
  await p.close();
}
await b.close();
