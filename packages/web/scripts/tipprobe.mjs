import { chromium } from "playwright";
const [url, out] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await b.newContext({ viewport: { width: 1300, height: 760 } })).newPage();
await p.goto(url, { waitUntil: "load" }); await p.waitForFunction(() => globalThis.__agentTheatre?.player, null, { timeout: 20000 }); await p.waitForTimeout(1500);
// find a building's screen position via the player, then hover it
const pt = await p.evaluate(() => { const pl = globalThis.__agentTheatre.player; const r = document.querySelector(".stage").getBoundingClientRect(); const pick = pl.world.places.find((q) => q.kind === "building"); const pos = pl.worldLayer.positionOf(pick.id); const g = pl.camera.toScreen(pos.ground.x, pos.ground.y), t = pl.camera.toScreen(pos.top.x, pos.top.y); return { x: r.left + g.x, y: r.top + (g.y + t.y) / 2, label: pick.label }; });
await p.mouse.move(pt.x, pt.y); await p.waitForTimeout(300);
const tip = await p.evaluate(() => { const t = document.querySelector(".tip"); return t && !t.hidden ? t.textContent : null; });
const lead = await p.evaluate(() => { const pl = globalThis.__agentTheatre.player; const r = document.querySelector(".stage").getBoundingClientRect(); const d = pl.pip.drawn; const s = pl.camera.toScreen(d.x, d.y - 18); return { x: r.left + s.x, y: r.top + s.y }; });
await p.mouse.move(lead.x, lead.y); await p.waitForTimeout(300);
const tip2 = await p.evaluate(() => { const t = document.querySelector(".tip"); return t && !t.hidden ? t.textContent : null; });
await p.screenshot({ path: out });
console.log(JSON.stringify({ hovered: pt.label, tip, tip2 }));
await b.close();
