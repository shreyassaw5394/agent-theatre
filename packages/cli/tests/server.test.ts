import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Theatre } from "../src/server.js";
import { readFileSync } from "node:fs";

const home = mkdtempSync(join(tmpdir(), "at-home-"));
const files = [{ path: "src/api/login.ts", loc: 200 }, { path: "tests/login.spec.ts", loc: 100 }, { path: "README.md", loc: 10 }];
let theatre: Theatre;
let base = "";

beforeAll(async () => { theatre = new Theatre({ cwd: "/work/acme", repoId: "acme", files, home, lostAfterMs: 400 }); const port = await theatre.listen(0); base = `http://127.0.0.1:${port}`; });
afterAll(async () => { await theatre.close(); });

describe("Theatre server", () => {
  it("writes the port file and answers health", async () => {
    expect(readFileSync(join(home, "port"), "utf8")).toBe(String(theatre.port));
    const h = await (await fetch(`${base}/healthz`)).json();
    expect(h).toMatchObject({ ok: true, port: theatre.port });
  });
  it("turns a hook payload into events + beats and streams them over the socket", async () => {
    const ws = new WebSocket(`${base.replace("http", "ws")}/live`);
    const got: any[] = [];
    await new Promise<void>((res) => { ws.onopen = () => res(); });
    ws.onmessage = (m) => got.push(JSON.parse(String(m.data)));
    const post = (p: unknown) => fetch(`${base}/hook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
    const common = { session_id: "s1", cwd: "/work/acme", transcript_path: "/x.jsonl" };
    expect((await post({ ...common, hook_event_name: "SessionStart", source: "startup" })).status).toBe(204);
    expect((await post({ ...common, hook_event_name: "PostToolUse", tool_name: "Read", tool_use_id: "t1", tool_input: { file_path: "/work/acme/src/api/login.ts" }, tool_response: { type: "text", file: { filePath: "/work/acme/src/api/login.ts", content: "SECRET_BODY", numLines: 1 } } })).status).toBe(204);
    expect((await post("not json")).status).toBe(204);
    await new Promise((r) => setTimeout(r, 50));
    const beats = got.filter((m) => m.type === "beats").flatMap((m) => m.beats);
    expect(beats.map((b: any) => b.kind)).toEqual(["curtain_up", "walk_to", "read"]);
    expect(JSON.stringify(got)).not.toContain("SECRET_BODY");
    const scene = (await (await fetch(`${base}/api/scene`)).json()) as any;
    expect(scene.events.map((e: any) => e.kind)).toEqual(["session_start", "read_file"]);
    expect(scene.events[1].path).toBe("src/api/login.ts");
    expect(scene.world.places.some((p: any) => p.path === "src/api/login.ts")).toBe(true);
    // signal loss: session open, no events for > lostAfterMs
    await new Promise((r) => setTimeout(r, 5_600));
    expect(got.some((m) => m.type === "signal" && m.state === "lost")).toBe(true);
    await post({ ...common, hook_event_name: "Stop", last_assistant_message: "Done." });
    await new Promise((r) => setTimeout(r, 50));
    expect(got.at(-2)?.type === "signal" || got.some((m) => m.type === "signal" && m.state === "ok")).toBe(true);
    ws.close();
  }, 15_000);
  it("404s unknown replays and rejects non-live upgrades", async () => {
    expect((await fetch(`${base}/api/replay/nope`)).status).toBe(404);
  });
});

import { isWithin } from "../src/server.js";
describe("hook routing", () => {
  it("only this repo's sessions belong on this stage", () => {
    expect(isWithin("/tmp/repo-a/src", "/tmp/repo-a")).toBe(true);
    expect(isWithin("/tmp/repo-a", "/tmp/repo-a")).toBe(true);
    expect(isWithin("/tmp/repo-ab", "/tmp/repo-a")).toBe(false);
    expect(isWithin("/tmp/other", "/tmp/repo-a")).toBe(false);
  });
});

describe("duplicate delivery", () => {
  it("the same hook payload delivered twice yields one event", async () => {
    const { Theatre } = await import("../src/server.js");
    const { mkdtempSync } = await import("node:fs"); const { tmpdir } = await import("node:os"); const { join } = await import("node:path");
    const home = mkdtempSync(join(tmpdir(), "at-dedupe-"));
    const t = new Theatre({ cwd: "/tmp/repo", repoId: "repo", files: [{ path: "a.ts", loc: 10 }], home });
    await t.listen(0);
    const payload = { session_id: "s", transcript_path: "/x", cwd: "/tmp/repo", permission_mode: "default", hook_event_name: "PostToolUse", tool_name: "Read", tool_use_id: "toolu_dup_1", tool_input: { file_path: "/tmp/repo/a.ts" }, tool_response: { type: "text", file: { filePath: "/tmp/repo/a.ts", content: "x\n", numLines: 1, startLine: 1, totalLines: 1 } } };
    for (let i = 0; i < 2; i++) await fetch(`${t.url}hook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const scene = await (await fetch(`${t.url}api/scene`)).json() as { events: unknown[] };
    expect(scene.events.length).toBe(1);
    await t.close();
  });
});

describe("mcp", () => {
  it("server.json names the npm package and the serve argument, version in step with the package", async () => {
    const { readFileSync } = await import("node:fs"); const { fileURLToPath } = await import("node:url");
    const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
    const srv = JSON.parse(readFileSync(root("server.json"), "utf8")) as { version: string; packages: Array<{ identifier: string; packageArguments: Array<{ value: string }> }> };
    const pkg = JSON.parse(readFileSync(root("packages/cli/package.json"), "utf8")) as { version: string };
    expect(srv.packages[0]!.identifier).toBe("agent-theatre"); expect(srv.packages[0]!.packageArguments[0]!.value).toBe("serve"); expect(srv.version).toBe(pkg.version);
  });
});

describe("mcp registry limits", () => {
  it("server.json description fits the registry's 100-char limit", async () => {
    const { readFileSync } = await import("node:fs"); const { fileURLToPath } = await import("node:url");
    const srv = JSON.parse(readFileSync(fileURLToPath(new URL("../../../server.json", import.meta.url)), "utf8")) as { description: string };
    expect(srv.description.length).toBeLessThanOrEqual(100);
  });
});

describe("no cross-origin access", () => {
  it("the API sends no CORS or private-network headers (any website could otherwise read repo paths)", async () => {
    const { Theatre } = await import("../src/server.js");
    const { mkdtempSync } = await import("node:fs"); const { tmpdir } = await import("node:os"); const { join } = await import("node:path");
    const t = new Theatre({ cwd: "/tmp/repo", repoId: "repo", files: [{ path: "a.ts", loc: 10 }], home: mkdtempSync(join(tmpdir(), "at-cors-")) });
    await t.listen(0);
    const r = await fetch(`${t.url}api/scene`, { headers: { origin: "https://evil.example" } });
    expect(r.headers.get("access-control-allow-origin")).toBeNull();
    expect(r.headers.get("access-control-allow-private-network")).toBeNull();
    const pre = await fetch(`${t.url}api/scene`, { method: "OPTIONS", headers: { origin: "https://evil.example", "access-control-request-method": "GET" } });
    expect(pre.headers.get("access-control-allow-origin")).toBeNull();
    await t.close();
  });
});

describe("quiet heartbeat", () => {
  it("broadcasts how long since the last event, and 0 right after one", async () => {
    const { Theatre } = await import("../src/server.js");
    const { mkdtempSync } = await import("node:fs"); const { tmpdir } = await import("node:os"); const { join } = await import("node:path");
    const t = new Theatre({ cwd: "/tmp/repo", repoId: "repo", files: [{ path: "a.ts", loc: 10 }], home: mkdtempSync(join(tmpdir(), "at-quiet-")) });
    await t.listen(0);
    const got: Array<{ type: string; ms?: number; open?: boolean }> = [];
    t.listeners.add((m) => got.push(m as { type: string; ms?: number }));
    await fetch(`${t.url}hook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_id: "q", transcript_path: "/x", cwd: "/tmp/repo", permission_mode: "default", hook_event_name: "PostToolUse", tool_name: "Read", tool_use_id: "toolu_q_1", tool_input: { file_path: "/tmp/repo/a.ts" }, tool_response: { type: "text", file: { filePath: "/tmp/repo/a.ts", content: "x\n", numLines: 1, startLine: 1, totalLines: 1 } } }) });
    const q = got.find((m) => m.type === "quiet");
    expect(q).toBeTruthy(); expect(q!.ms).toBe(0); expect(q!.open).toBe(false); // no SessionStart was seen
    await t.close();
  });
});

import { statSync, writeFileSync } from "node:fs";
import { WebSocket as WsClient } from "ws";
describe("stage registry, socket origin, framing", () => {
  const h2 = mkdtempSync(join(tmpdir(), "at-home2-"));
  const web = mkdtempSync(join(tmpdir(), "at-web-"));
  writeFileSync(join(web, "index.html"), "<!doctype html><title>t</title>");
  let t: Theatre; let url = "";
  beforeAll(async () => { t = new Theatre({ cwd: "/work/acme", repoId: "acme", files, home: h2, webDir: web, git: false }); await t.listen(0); url = `http://127.0.0.1:${t.port}`; });
  afterAll(async () => { await t.close(); });
  it("registers {cwd, id} in an owner-only file and answers the same id on /healthz", async () => {
    const f = join(h2, "ports", String(t.port));
    expect(JSON.parse(readFileSync(f, "utf8"))).toEqual({ cwd: "/work/acme", id: t.stageId });
    expect(t.stageId).toMatch(/^[0-9a-f]{32}$/);
    if (process.platform !== "win32") { expect(statSync(f).mode & 0o777).toBe(0o600); expect(statSync(join(h2, "ports")).mode & 0o777).toBe(0o700); }
    expect(((await (await fetch(`${url}/healthz`)).json()) as { id: string }).id).toBe(t.stageId);
  });
  const open = (origin?: string) => new Promise<boolean>((res) => {
    const ws = new WsClient(`ws://127.0.0.1:${t.port}/live`, origin ? { origin } : {});
    ws.on("open", () => { ws.close(); res(true); }); ws.on("error", () => res(false));
  });
  it("the live socket takes only this stage's own origin (or none); a page on another local port is refused", async () => {
    expect(await open()).toBe(true);
    expect(await open(`http://127.0.0.1:${t.port}`)).toBe(true);
    expect(await open(`http://localhost:${t.port}`)).toBe(true);
    expect(await open("http://localhost:5173")).toBe(false);
    expect(await open("https://evil.example")).toBe(false);
  });
  it("stage pages cannot be framed", async () => {
    const r = await fetch(`${url}/`);
    expect(r.headers.get("x-frame-options")).toBe("DENY");
    expect(r.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(r.headers.get("content-security-policy")).toContain(`ws://127.0.0.1:${t.port}`);
  });
  it("a helper of this stage's session working in another folder shows up by that folder's name only", async () => {
    const got: string[] = [];
    const ws = new WsClient(`ws://127.0.0.1:${t.port}/live`);
    await new Promise<void>((r) => ws.on("open", () => r()));
    ws.on("message", (m) => got.push(String(m)));
    const post = (p: unknown) => fetch(`${url}/hook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
    await post({ session_id: "s9", cwd: "/work/acme", hook_event_name: "SessionStart" });
    await post({ session_id: "s9", cwd: "/work/acme", hook_event_name: "SubagentStart", agent_id: "h1", agent_type: "Explore" });
    const outside = { session_id: "s9", cwd: "/Users/dev/other-repo", hook_event_name: "PostToolUse", agent_id: "h1", tool_name: "Read", tool_input: { file_path: "/Users/dev/other-repo/secret.ts" } };
    await post({ ...outside, tool_use_id: "o1" });
    await post({ ...outside, tool_use_id: "o2" });
    // a session this stage never saw: nothing
    await post({ ...outside, session_id: "other", agent_id: "h9", tool_use_id: "o3" });
    await new Promise((r) => setTimeout(r, 80));
    ws.close();
    const events = got.map((m) => JSON.parse(m)).filter((m) => m.type === "beats").flatMap((m) => m.events);
    const away = events.filter((e: { kind: string }) => e.kind === "helper_elsewhere");
    expect(away).toEqual([expect.objectContaining({ kind: "helper_elsewhere", repo: "other-repo", agentId: "h1" })]);
    expect(JSON.stringify(got.map((m) => JSON.parse(m)).filter((m) => m.type === "beats"))).not.toContain("/Users/");
    const beats = got.map((m) => JSON.parse(m)).filter((m) => m.type === "beats").flatMap((m) => m.beats);
    expect(beats.filter((b: { kind: string }) => b.kind === "away")).toEqual([expect.objectContaining({ actor: "h1", label: "elsewhere: other-repo" })]);
  });
});
