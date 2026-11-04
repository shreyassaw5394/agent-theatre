/**
 * The hook script Claude Code runs on every event. Dependency-free, starts in
 * ~40 ms, never blocks the agent and gives up within 600 ms: a dead server, a missing
 * port file, bad JSON — all exit 0 silently. It reduces the payload to the paths, counts
 * and flags the stage reads, and sends it only to a listener that answers with the id
 * the stage registered (ports/<port>, 0600). It writes to stdout
 * only on Stop, and only a {"systemMessage"} the stage sent back (the files the
 * turn changed): shown to the person, never a decision, never context for the agent.
 *
 * hooks/agent-theatre-hook.mjs must be byte-identical (tests/script.test.ts).
 */
export const HOOK_SCRIPT = `#!/usr/bin/env node
// Agent Theatre hook — forwards Claude Code events to the local theatre. Never blocks the agent.
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
// Every running stage registers itself in ports/<port> as {cwd, id}; the event goes to each one that proves it is that stage.
const home = process.env.AGENT_THEATRE_HOME || join(homedir(), ".agent-theatre");
const stages = new Map(); // port -> id ("" = registered by an older build)
try {
  for (const f of readdirSync(join(home, "ports"))) {
    const n = parseInt(f, 10); if (!(n > 0)) continue;
    let id = "";
    try { const t = readFileSync(join(home, "ports", f), "utf8").trim(); if (t.startsWith("{")) id = String(JSON.parse(t).id || ""); } catch { /* unreadable */ }
    stages.set(n, id);
  }
} catch { /* no registry yet */ }
try { const n = parseInt(readFileSync(join(home, "port"), "utf8").trim(), 10); if (n > 0 && !stages.has(n)) stages.set(n, ""); } catch { /* no port file */ }
if (!stages.size) process.exit(0);

// Only what the stage reads leaves this process: paths, counts and flags. File contents, command output and prompts stay here.
const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
const pick = (o, keys) => { const r = {}; for (const k of keys) if (o[k] !== undefined) r[k] = o[k]; return r; };
const shape = (s) => (typeof s === "string" ? s.replace(/[^\\n]+/g, "x") : s); // line structure only, for line counts
const TESTY = /pass|fail|skip|ignor|pending|error|assert|tests?\\b|^\\s*ok\\b|[×✗✖]|={3,}/i;
const summary = (s) => (typeof s === "string" ? s.split("\\n").filter((l) => TESTY.test(l)).join("\\n").slice(-20_000) : undefined); // test-summary lines only
function slim(p) {
  const o = pick(p, ["hook_event_name", "session_id", "cwd", "agent_id", "agent_type", "tool_name", "tool_use_id", "duration_ms", "reason", "notification_type", "source", "last_assistant_message"]);
  if (typeof o.last_assistant_message === "string") o.last_assistant_message = o.last_assistant_message.slice(-20_000);
  if (p.hook_event_name !== "PostToolUse") return o;
  const i = obj(p.tool_input), r = p.tool_response, ro = obj(r);
  const flags = ro.interrupted === true ? { interrupted: true } : {};
  switch (p.tool_name) {
    case "Read": { const c = obj(ro.file).content; o.tool_input = pick(i, ["file_path", "path"]); o.tool_response = { ...flags, ...(typeof c === "string" ? { file: { bytes: c.length } } : {}) }; break; }
    case "Edit": case "MultiEdit": case "NotebookEdit": {
      o.tool_input = { ...pick(i, ["file_path", "notebook_path"]), ...(typeof i.old_string === "string" ? { old_string: shape(i.old_string) } : {}), ...(typeof i.new_string === "string" ? { new_string: shape(i.new_string) } : {}), ...(typeof i.new_source === "string" ? { new_source: shape(i.new_source) } : {}) };
      o.tool_response = { ...flags, ...(Array.isArray(ro.structuredPatch) ? { structuredPatch: ro.structuredPatch.map((h) => ({ lines: (Array.isArray(obj(h).lines) ? h.lines : []).filter((l) => typeof l === "string").map((l) => l.slice(0, 1)) })) } : {}) };
      break;
    }
    case "Write": o.tool_input = { ...pick(i, ["file_path"]), ...(typeof i.content === "string" ? { content: shape(i.content) } : {}) }; o.tool_response = { ...flags, ...pick(ro, ["type"]), ...(ro.originalFile === null ? { originalFile: null } : {}) }; break;
    case "Bash": o.tool_input = typeof i.command === "string" ? { command: i.command.slice(0, 100_000) } : {}; o.tool_response = typeof r === "string" ? summary(r) : { ...flags, ...(typeof ro.stdout === "string" ? { stdout: summary(ro.stdout) } : {}), ...(typeof ro.stderr === "string" ? { stderr: summary(ro.stderr) } : {}), ...(typeof ro.output === "string" ? { output: summary(ro.output) } : {}) }; break;
    case "Agent": case "Task": o.tool_input = pick(i, ["description", "subagent_type"]); o.tool_response = pick(ro, ["agentId", "agent_id", "status", "isAsync", "interrupted"]); break;
    case "Grep": case "Glob": case "LS": case "ToolSearch": o.tool_input = {}; o.tool_response = { ...flags, ...pick(ro, ["numFiles", "numLines", "count"]) }; break;
    default: o.tool_input = {}; o.tool_response = flags;
  }
  return o;
}
/** Is the listener on this port the stage that registered it? A stale entry whose port now belongs to something else gets nothing. */
async function isStage(port, id) {
  try {
    const j = await (await fetch(\`http://127.0.0.1:\${port}/healthz\`, { signal: AbortSignal.timeout(150) })).json();
    if (j && (id ? j.id === id : j.ok === true && j.port === port)) return true;
  } catch (e) { if (e?.cause?.code !== "ECONNREFUSED") return false; }
  try { rmSync(join(home, "ports", String(port))); } catch { /* already gone */ }
  return false;
}

let body = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => { body += c; if (body.length > 20_000_000) body = body.slice(0, 20_000_000); });
process.stdin.on("end", async () => {
  try {
    const payload = JSON.parse(body);
    const out = JSON.stringify(slim(obj(payload)));
    const replies = await Promise.allSettled([...stages].map(async ([port, id]) => {
      if (!(await isStage(port, id))) throw new Error("not a stage");
      return fetch(\`http://127.0.0.1:\${port}/hook\`, { method: "POST", headers: { "content-type": "application/json" }, body: out, signal: AbortSignal.timeout(300) });
    }));
    if (payload.hook_event_name === "Stop") {
      for (const r of replies) {
        if (r.status !== "fulfilled" || r.value.status !== 200) continue;
        const j = await r.value.json().catch(() => null);
        if (j && typeof j.systemMessage === "string" && j.systemMessage) { process.stdout.write(JSON.stringify({ systemMessage: j.systemMessage.slice(0, 2000) })); break; }
      }
    }
  } catch { /* bad input, or a theatre not running or slow: that is fine */ }
  process.exit(0);
});
setTimeout(() => process.exit(0), 600).unref();
`;
