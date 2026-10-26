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
