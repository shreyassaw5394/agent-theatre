#!/usr/bin/env node
// Agent Theatre hook — forwards Claude Code events to the local theatre. Never blocks the agent.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const portFile = join(process.env.AGENT_THEATRE_HOME || join(homedir(), ".agent-theatre"), "port");
let port = 0;
try { port = parseInt(readFileSync(portFile, "utf8").trim(), 10); } catch { process.exit(0); }
if (!port) process.exit(0);
let body = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => { body += c; if (body.length > 2_000_000) body = body.slice(0, 2_000_000); });
process.stdin.on("end", async () => {
  try {
    await fetch(`http://127.0.0.1:${port}/hook`, { method: "POST", headers: { "content-type": "application/json" }, body, signal: AbortSignal.timeout(300) });
  } catch { /* theatre not running or slow: that is fine */ }
  process.exit(0);
});
setTimeout(() => process.exit(0), 600).unref();
