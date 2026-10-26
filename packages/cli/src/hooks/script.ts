/**
 * The hook script Claude Code runs on every event. Dependency-free, starts in
 * ~40 ms, and can NEVER slow or block the agent: a dead server, a missing
 * port file, bad JSON — all exit 0 silently within 300 ms. It never writes to
 * stdout, so it can never inject context or block a tool.
 *
 * hooks/agent-theatre-hook.mjs must be byte-identical (tests/script.test.ts).
 */
export const HOOK_SCRIPT = `#!/usr/bin/env node
// Agent Theatre hook — forwards Claude Code events to the local theatre. Never blocks the agent.
import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
// Every running stage registers itself in ports/<port>; the event goes to all of them (browser, VS Code, a second repo…).
const home = process.env.AGENT_THEATRE_HOME || join(homedir(), ".agent-theatre");
const ports = new Set();
try { for (const f of readdirSync(join(home, "ports"))) { const n = parseInt(f, 10); if (n > 0) ports.add(n); } } catch { /* no registry yet */ }
try { const n = parseInt(readFileSync(join(home, "port"), "utf8").trim(), 10); if (n > 0) ports.add(n); } catch { /* no port file */ }
if (!ports.size) process.exit(0);
let body = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => { body += c; if (body.length > 2_000_000) body = body.slice(0, 2_000_000); });
process.stdin.on("end", async () => {
  try {
    await Promise.allSettled([...ports].map((port) => fetch(\`http://127.0.0.1:\${port}/hook\`, { method: "POST", headers: { "content-type": "application/json" }, body, signal: AbortSignal.timeout(300) })));
  } catch { /* a theatre not running or slow: that is fine */ }
  process.exit(0);
});
setTimeout(() => process.exit(0), 600).unref();
`;
