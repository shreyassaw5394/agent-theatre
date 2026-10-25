// Assembles the static site: site/* → site/dist, the built web app at /theatre/, demo fixtures at /demo/.
import { cpSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const here = fileURLToPath(new URL("./", import.meta.url));
const out = join(here, "dist");
const web = fileURLToPath(new URL("../packages/web/dist/", import.meta.url));
if (!existsSync(join(web, "index.html"))) { console.error("build @agent-theatre/web first (with --base=/theatre/)"); process.exit(1); }
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of readdirSync(here)) if (!["dist", "build.mjs", "node_modules"].includes(f)) cpSync(join(here, f), join(out, f), { recursive: true });
cpSync(web, join(out, "theatre"), { recursive: true });
if (existsSync(join(web, "demo"))) cpSync(join(web, "demo"), join(out, "demo"), { recursive: true });
console.log("site assembled at", out);
