import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
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
  type Got = { method: string; url: string; body: string };
  /** A fake listener: answers /healthz with `id` (or the old {ok, port} shape when id is null) and records every request. */
  const listener = async (id: string | null, stop?: string) => {
    const got: Got[] = [];
    const server = createServer((req, res) => {
      let b = ""; req.on("data", (c) => { b += c; }); req.on("end", () => {
        got.push({ method: req.method ?? "", url: req.url ?? "", body: b });
        const port = (server.address() as { port: number }).port;
        if (req.url === "/healthz") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(id === null ? { ok: true, port } : { ok: true, port, id })); return; }
        const ev = b ? JSON.parse(b).hook_event_name : "";
        if (ev === "Stop" && stop) { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ systemMessage: stop })); }
        else { res.writeHead(204); res.end(); }
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    return { server, got, port: (server.address() as { port: number }).port, posts: () => got.filter((g) => g.method === "POST").map((g) => g.body) };
  };
  let home = "";
  let stage: Awaited<ReturnType<typeof listener>>, imposter: Awaited<ReturnType<typeof listener>>, legacy: Awaited<ReturnType<typeof listener>>;
  beforeAll(async () => {
    stage = await listener("good-id", "Agent Theatre · this turn: 1 file changed (+3 −1)");
    imposter = await listener("someone-else");
    legacy = await listener(null);
    home = mkdtempSync(join(tmpdir(), "at-hook-"));
    mkdirSync(join(home, "ports"));
    writeFileSync(join(home, "ports", String(stage.port)), JSON.stringify({ cwd: "/repo", id: "good-id" }));
    writeFileSync(join(home, "ports", String(legacy.port)), "/repo"); // a stage started by an older build
  });
  afterAll(async () => { for (const l of [stage, imposter, legacy]) await new Promise<void>((r) => l.server.close(() => r())); });
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
  it("a listener that does not answer with the registered id gets no event at all, and its entry is removed", async () => {
    const f = join(home, "ports", String(imposter.port));
    writeFileSync(f, JSON.stringify({ cwd: "/repo", id: "expected-id" }));
    const before = stage.posts().length;
    await run({ hook_event_name: "PostToolUse", session_id: "s", cwd: "/repo", tool_name: "Read", tool_use_id: "t-imp", tool_input: { file_path: "/repo/a" } });
    expect(imposter.posts()).toEqual([]);
    expect(imposter.got.every((g) => g.body === "")).toBe(true);
    expect(existsSync(f)).toBe(false);
    expect(stage.posts().length).toBe(before + 1);
  });
  it("still reaches a stage registered by an older build", async () => {
    const before = legacy.posts().length;
    await run({ hook_event_name: "SessionStart", session_id: "s", cwd: "/repo" });
    expect(legacy.posts().length).toBe(before + 1);
  });
  it("sends only paths, counts and flags: planted contents never leave, and the stage still sees the same events", async () => {
    const SECRET = "MARKER_HOOK_SECRET_51f0";
    const raw: Array<Record<string, unknown>> = [
      { hook_event_name: "PostToolUse", tool_name: "Read", tool_use_id: "r1", tool_input: { file_path: "/repo/a.ts" }, tool_response: { type: "text", file: { filePath: "/repo/a.ts", content: `const k = "${SECRET}";\n` } } },
      { hook_event_name: "PostToolUse", tool_name: "Edit", tool_use_id: "r2", tool_input: { file_path: "/repo/a.ts", old_string: `a ${SECRET}`, new_string: `b ${SECRET}\nc` }, tool_response: { filePath: "/repo/a.ts", originalFile: `x ${SECRET}`, structuredPatch: [{ oldStart: 1, lines: [`-a ${SECRET}`, `+b ${SECRET}`, "+c", ` ${SECRET}`] }] } },
      { hook_event_name: "PostToolUse", tool_name: "Write", tool_use_id: "r3", tool_input: { file_path: "/repo/n.ts", content: `${SECRET}\n${SECRET}\n` }, tool_response: { type: "create", filePath: "/repo/n.ts", content: SECRET, originalFile: null } },
      { hook_event_name: "PostToolUse", tool_name: "Bash", tool_use_id: "r4", tool_input: { command: "npx vitest run", description: SECRET }, tool_response: { stdout: `${SECRET}\n Test Files  2 passed (2)\n      Tests  24 passed (24)\n${SECRET}`, stderr: SECRET, interrupted: false } },
      { hook_event_name: "PostToolUse", tool_name: "Task", tool_use_id: "r5", tool_input: { description: "Audit", subagent_type: "Explore", prompt: SECRET }, tool_response: { agentId: "a1", status: "completed", content: [{ type: "text", text: SECRET }] } },
      { hook_event_name: "PostToolUse", tool_name: "Grep", tool_use_id: "r6", tool_input: { pattern: SECRET }, tool_response: { numFiles: 3, filenames: [SECRET] } },
      { hook_event_name: "PostToolUse", tool_name: "mcp__x__y", tool_use_id: "r7", tool_input: { q: SECRET }, tool_response: [{ type: "text", text: SECRET }] },
      { hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_use_id: "r8", tool_input: { command: "x" }, error: SECRET },
      { hook_event_name: "UserPromptSubmit", prompt: SECRET },
      { hook_event_name: "SessionStart", source: "startup", transcript_path: `/x/${SECRET}.jsonl` },
    ].map((p) => ({ session_id: "s", cwd: "/repo", ...p }));
    const before = stage.posts().length;
    for (const p of raw) await run(p);
    const sent = stage.posts().slice(before);
    expect(sent).toHaveLength(raw.length);
    expect(sent.filter((b) => b.includes(SECRET))).toEqual([]);
    const { hookPayloadToEvents } = await import("@agent-theatre/core");
    const strip = (r: { events: Array<Record<string, unknown>> }) => r.events.map(({ id: _i, ts: _t, ...e }) => e);
    for (let i = 0; i < raw.length; i++) expect(strip(hookPayloadToEvents(JSON.parse(sent[i]!), { now: 1, home: "/h" }) as never), String(raw[i]!.tool_name ?? raw[i]!.hook_event_name)).toEqual(strip(hookPayloadToEvents(raw[i], { now: 1, home: "/h" }) as never));
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
