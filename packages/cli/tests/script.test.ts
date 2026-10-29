import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HOOK_SCRIPT } from "../src/hooks/script.js";

const scriptPath = new URL("../hooks/agent-theatre-hook.mjs", import.meta.url);

describe("hook script", () => {
  const shipped = readFileSync(scriptPath, "utf8");
  it("shipped file is byte-identical to the source constant", () => { expect(shipped).toBe(HOOK_SCRIPT); });
  it("plugin copy is byte-identical too", () => { expect(readFileSync(new URL("../../../hooks-plugin/agent-theatre-hook.mjs", import.meta.url), "utf8")).toBe(HOOK_SCRIPT); });
  it("never blocks: no decision field, hard timeouts, exits 0 on every path, stdout only for a systemMessage", () => {
    expect(HOOK_SCRIPT).not.toMatch(/console\.log|"decision"|additionalContext|"block"/);
    expect(HOOK_SCRIPT.match(/stdout\.write/g)?.length).toBe(1);
    expect(HOOK_SCRIPT).toMatch(/stdout\.write\(JSON\.stringify\(\{ systemMessage: /);
    expect(HOOK_SCRIPT).toMatch(/AbortSignal\.timeout\(300\)/);
    expect(HOOK_SCRIPT).toMatch(/setTimeout\(\(\) => process\.exit\(0\), 600\)/);
    expect(HOOK_SCRIPT).not.toMatch(/process\.exit\([1-9]/);
    expect(HOOK_SCRIPT).not.toMatch(/\bimport .* from "(?!node:)/); // no third-party imports
  });
});

describe("hook script, run for real", () => {
  let server: Server; let home = ""; const got: string[] = [];
  beforeAll(async () => {
    server = createServer((req, res) => {
      let b = ""; req.on("data", (c) => { b += c; }); req.on("end", () => {
        got.push(b);
        const ev = JSON.parse(b).hook_event_name;
        if (ev === "Stop") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ systemMessage: "Agent Theatre · this turn: 1 file changed (+3 −1)" })); }
        else { res.writeHead(204); res.end(); }
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    home = mkdtempSync(join(tmpdir(), "at-hook-"));
    mkdirSync(join(home, "ports"));
    writeFileSync(join(home, "ports", String(port)), "/repo");
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));
  const run = (payload: object, env: Record<string, string> = {}) => new Promise<{ out: string; code: number | null; ms: number }>((resolve) => {
    const t0 = Date.now();
    const p = spawn(process.execPath, [fileURLToPath(scriptPath)], { env: { ...process.env, AGENT_THEATRE_HOME: home, ...env } });
    let out = ""; p.stdout.on("data", (c) => { out += c; });
    p.on("close", (code) => resolve({ out, code, ms: Date.now() - t0 }));
    p.stdin.end(JSON.stringify(payload));
  });

  it("prints the stage's summary as a systemMessage on Stop", async () => {
    const r = await run({ hook_event_name: "Stop", session_id: "s", cwd: "/repo", last_assistant_message: "done" });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toEqual({ systemMessage: "Agent Theatre · this turn: 1 file changed (+3 −1)" });
  });
  it("prints nothing for every other event", async () => {
    const r = await run({ hook_event_name: "PostToolUse", session_id: "s", cwd: "/repo", tool_name: "Read", tool_input: { file_path: "/repo/a" } });
    expect(r.code).toBe(0);
    expect(r.out).toBe("");
  });
  it("exits 0 quickly and silently when no stage is listening", async () => {
    const empty = mkdtempSync(join(tmpdir(), "at-hook-none-"));
    mkdirSync(join(empty, "ports")); writeFileSync(join(empty, "ports", "1"), "/repo");
    const r = await run({ hook_event_name: "Stop", session_id: "s", cwd: "/repo" }, { AGENT_THEATRE_HOME: empty });
    expect(r.code).toBe(0);
    expect(r.out).toBe("");
    expect(r.ms).toBeLessThan(1500);
  });
});
