// Copies the built web bundle into the CLI package so `npx agent-theatre` serves it offline.
import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
const src = fileURLToPath(new URL("../../web/dist/", import.meta.url));
const dst = fileURLToPath(new URL("../web/", import.meta.url));
if (!existsSync(src + "index.html")) { console.error("web bundle missing: build @agent-theatre/web first"); process.exit(1); }
rmSync(dst, { recursive: true, force: true });
cpSync(src, dst, { recursive: true });
console.log("web bundle copied to packages/cli/web");
