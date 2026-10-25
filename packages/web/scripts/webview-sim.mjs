// Simulates the VS Code webview: the app served from a *different* origin than the Theatre server,
// with the query injected via window.__AT_QUERY and API/WS pointed at the server through `base`.
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
const [theatrePort = "4848", out = "webview-sim.png"] = process.argv.slice(2);
const root = new URL("../dist-vscode/", import.meta.url).pathname;
const srv = createServer((req, res) => {
  const p = req.url.split("?")[0] === "/" ? "/index.html" : req.url.split("?")[0];
  const f = join(root, p); if (!existsSync(f)) { res.statusCode = 404; return res.end(); }
  let body = readFileSync(f);
  if (p === "/index.html") body = Buffer.from(String(body).replace("<head>", `<head><script>window.__AT_QUERY=${JSON.stringify(`?live=1&nopreview=1&set=metropolis&base=http://127.0.0.1:${theatrePort}`)};</script>`));
  res.setHeader("content-type", p.endsWith(".js") ? "text/javascript" : p.endsWith(".css") ? "text/css" : p.endsWith(".html") ? "text/html" : "application/octet-stream"); res.end(body);
});
await new Promise((r) => srv.listen(8899, "127.0.0.1", r));
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await b.newContext({ viewport: { width: 1200, height: 700 } })).newPage();
const errs = []; p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); }); p.on("pageerror", (e) => errs.push("pageerror " + String(e).slice(0, 200)));
await p.goto("http://127.0.0.1:8899/", { waitUntil: "load" });
const ok = await p.waitForFunction(() => globalThis.__agentTheatre?.player?.world, null, { timeout: 15000 }).then(() => true).catch(() => false);
await p.waitForTimeout(2000);
const r = await p.evaluate(() => { const pl = globalThis.__agentTheatre?.player; return pl ? { repo: pl.world.repoId, places: pl.world.places.length, beats: pl.beatCount, title: document.getElementById("title")?.textContent } : null; });
console.log(JSON.stringify({ loaded: ok, r, errs: errs.slice(0, 5) }));
await p.screenshot({ path: out }); await b.close(); srv.close();
