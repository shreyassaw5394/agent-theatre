import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { request } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Theatre } from "../src/server.js";
import { gitStatus, gitNumstat, takeBaseline, gitView, diffFor } from "../src/git.js";

/** A real throwaway repo: one committed file, one file already dirty before the stage starts. */
function makeRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "at-changes-")));
  const g = (...a: string[]) => spawnSync("git", ["-C", dir, ...a], { encoding: "utf8" });
  g("init", "-q"); g("config", "user.email", "t@example.com"); g("config", "user.name", "t"); g("config", "commit.gpgsign", "false");
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src/app.ts"), "one\ntwo\nthree\n");
  writeFileSync(join(dir, "src/old.ts"), "old\n");
  writeFileSync(join(dir, "notes.md"), "notes\n");
  writeFileSync(join(dir, "README.md"), "readme\n");
  g("add", "."); g("commit", "-q", "-m", "init");
  writeFileSync(join(dir, "notes.md"), "notes\nedited before the session\n"); // dirty before the stage: not this session's change
  return dir;
}

describe("git views", () => {
  const dir = makeRepo();
  it("reads status, numstat and a baseline relative to the folder", () => {
    writeFileSync(join(dir, "src/new.ts"), "a\nb\n");
    const st = gitStatus(dir)!;
    expect(st).toMatchObject({ "notes.md": "M", "src/new.ts": "?" });
    const n = gitNumstat(dir, st);
    expect(n["notes.md"]).toEqual({ added: 1, removed: 0 });
    expect(n["src/new.ts"]).toEqual({ added: 2, removed: 0 });
    const base = takeBaseline(dir)!;
    writeFileSync(join(dir, "src/new.ts"), "a\nb\nc\n");
    const v = gitView(dir, base)!;
    expect(v.changedSinceBaseline).toEqual(["src/new.ts"]);
    rmSync(join(dir, "src/new.ts"));
  });
  it("diffs a tracked file and an untracked one, and refuses paths outside the folder", () => {
    writeFileSync(join(dir, "src/app.ts"), "one\nTWO\nthree\n");
    expect(diffFor(dir, "src/app.ts")!.diff).toMatch(/-two\n\+TWO/);
    writeFileSync(join(dir, "src/brand.ts"), "fresh\n");
    expect(diffFor(dir, "src/brand.ts")!.diff).toMatch(/\+fresh/);
    expect(diffFor(dir, "../etc/passwd")).toBeNull();
    expect(diffFor(dir, "/etc/passwd")).toBeNull();
    spawnSync("git", ["-C", dir, "checkout", "-q", "--", "src/app.ts"]); rmSync(join(dir, "src/brand.ts"));
  });
  it("returns null outside a git repo", () => {
    const plain = mkdtempSync(join(tmpdir(), "at-plain-"));
    expect(gitStatus(plain)).toBeNull();
    expect(gitView(plain, null)).toBeNull();
  });
});

describe("the change map, end to end through the hooks", () => {
  const dir = makeRepo();
  const home = mkdtempSync(join(tmpdir(), "at-home-"));
  let theatre: Theatre; let base = "";
  const post = (p: unknown) => fetch(`${base}/hook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
  const common = { session_id: "s1", cwd: dir, transcript_path: "/x.jsonl" };
  beforeAll(async () => { theatre = new Theatre({ cwd: dir, repoId: "r", files: [], home }); base = `http://127.0.0.1:${await theatre.listen(0)}`; });
  afterAll(async () => { await theatre.close(); });

  it("builds the map from real edits, shell deletes and heredoc writes, and answers Stop with a summary", async () => {
    await post({ ...common, hook_event_name: "SessionStart", source: "startup" });
    await post({ ...common, hook_event_name: "PostToolUse", tool_name: "Read", tool_use_id: "r1", tool_input: { file_path: join(dir, "README.md") }, tool_response: { file: { content: "readme" } } });
    writeFileSync(join(dir, "src/app.ts"), "one\nTWO\nthree\nfour\n");
    await post({ ...common, hook_event_name: "PostToolUse", tool_name: "Edit", tool_use_id: "e1", tool_input: { file_path: join(dir, "src/app.ts"), old_string: "two", new_string: "TWO" }, tool_response: { structuredPatch: [{ lines: ["-two", "+TWO", "+four"] }] } });
    rmSync(join(dir, "src/old.ts"));
    await post({ ...common, hook_event_name: "PostToolUse", tool_name: "Bash", tool_use_id: "b1", tool_input: { command: "rm src/old.ts" }, tool_response: { stdout: "" } });
    writeFileSync(join(dir, "src/gen.ts"), "1\n2\n3\n4\n5\n");
    await post({ ...common, hook_event_name: "PostToolUse", tool_name: "Bash", tool_use_id: "b2", tool_input: { command: "cat > src/gen.ts <<'EOF'\n1\n2\n3\n4\n5\nEOF" }, tool_response: { stdout: "" } });
    writeFileSync(join(dir, "human.txt"), "typed by the person\n"); // changed during the session, not by the agent
    const stop = await post({ ...common, hook_event_name: "Stop", last_assistant_message: "Done." });
    expect(stop.status).toBe(200);
    const { systemMessage } = (await stop.json()) as { systemMessage: string };
    expect(systemMessage).toMatch(/^Agent Theatre · this turn: 3 files changed/);
    expect(systemMessage).toContain("src/gen.ts (new, +5)");
    expect(systemMessage).toContain("src/old.ts (deleted)");
    expect(systemMessage).toContain("?live=1&view=changes");
    expect(systemMessage).not.toContain("human.txt");

    const cs = (await (await fetch(`${base}/api/changes`)).json()) as any;
    const by = (p: string) => cs.files.find((f: any) => f.path === p);
    expect(cs.git).toBe(true);
    expect(by("src/app.ts")).toMatchObject({ action: "edited", by: "agent", added: 2, removed: 1 });
    expect(by("src/old.ts")).toMatchObject({ action: "deleted", git: "D" });
    expect(by("src/gen.ts")).toMatchObject({ action: "created", added: 5 });
    expect(by("README.md")).toMatchObject({ action: "read" });
    expect(by("human.txt")).toMatchObject({ by: "outside", action: "created" });
    expect(by("notes.md")).toBeUndefined(); // dirty before the stage started
    expect(cs.totals).toMatchObject({ changed: 3, created: 1, deleted: 1, edited: 1, read: 1, outside: 1 });
  });

  it("a turn that changes nothing gets no summary (204), and the next turn counts only its own files", async () => {
    await post({ ...common, hook_event_name: "PostToolUse", tool_name: "Read", tool_use_id: "r2", tool_input: { file_path: join(dir, "README.md") }, tool_response: {} });
    expect((await post({ ...common, hook_event_name: "Stop", last_assistant_message: "Looked around." })).status).toBe(204);
    writeFileSync(join(dir, "README.md"), "readme\nmore\n");
    await post({ ...common, hook_event_name: "PostToolUse", tool_name: "Edit", tool_use_id: "e2", tool_input: { file_path: join(dir, "README.md"), old_string: "x", new_string: "x\nmore" }, tool_response: { structuredPatch: [{ lines: ["+more"] }] } });
    const r = (await (await post({ ...common, hook_event_name: "Stop", last_assistant_message: "ok" })).json()) as { systemMessage: string };
    expect(r.systemMessage).toMatch(/this turn: 1 file changed \(\+1 −0\)\nREADME\.md \(\+1 −0\)/);
  });

  it("serves diffs only for files on the map, never cached", async () => {
    const ok = await fetch(`${base}/api/diff?path=src/app.ts`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(((await ok.json()) as any).diff).toMatch(/\+TWO/);
    expect((await fetch(`${base}/api/diff?path=notes.md`)).status).toBe(404); // dirty, but not this session's
    expect((await fetch(`${base}/api/diff?path=../../etc/passwd`)).status).toBe(404);
  });

  it("filters by time and agent, and refuses foreign hosts", async () => {
    const all = (await (await fetch(`${base}/api/changes`)).json()) as any;
    const early = (await (await fetch(`${base}/api/changes?until=${all.from}`)).json()) as any;
    expect(early.files.filter((f: any) => f.by === "agent").length).toBeLessThan(all.files.filter((f: any) => f.by === "agent").length);
    const none = (await (await fetch(`${base}/api/changes?agent=nobody`)).json()) as any;
    expect(none.totals.changed).toBe(0);
    // fetch() ignores a custom Host header; a raw request can send one, the way a DNS-rebinding page would
    const status = await new Promise<number>((res) => { const r = request({ host: "127.0.0.1", port: theatre.port, path: "/api/changes", headers: { host: "evil.example" } }, (m) => { m.resume(); res(m.statusCode ?? 0); }); r.end(); });
    expect(status).toBe(403);
  });

  it("can be switched off", async () => {
    process.env.AGENT_THEATRE_SUMMARY = "0";
    writeFileSync(join(dir, "src/app.ts"), "x\n");
    await post({ ...common, hook_event_name: "PostToolUse", tool_name: "Edit", tool_use_id: "e3", tool_input: { file_path: join(dir, "src/app.ts"), old_string: "a", new_string: "b" }, tool_response: {} });
    expect((await post({ ...common, hook_event_name: "Stop", last_assistant_message: "ok" })).status).toBe(204);
    delete process.env.AGENT_THEATRE_SUMMARY;
    void readFileSync;
  });
});

describe("commits made mid-session", () => {
  it("keep their files on the map", async () => {
    const dir = makeRepo();
    const home = mkdtempSync(join(tmpdir(), "at-home-"));
    const t = new Theatre({ cwd: dir, repoId: "r", files: [], home });
    const base = `http://127.0.0.1:${await t.listen(0)}`;
    const post = (p: unknown) => fetch(`${base}/hook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
    const common = { session_id: "s1", cwd: dir, transcript_path: "/x.jsonl" };
    spawnSync("git", ["-C", dir, "rm", "-q", "src/old.ts"]);
    await post({ ...common, hook_event_name: "PostToolUse", tool_name: "Bash", tool_use_id: "b1", tool_input: { command: "git rm -q src/old.ts" }, tool_response: {} });
    spawnSync("git", ["-C", dir, "commit", "-qm", "remove old"]);
    const cs = (await (await fetch(`${base}/api/changes`)).json()) as any;
    expect(cs.files.find((f: any) => f.path === "src/old.ts")).toMatchObject({ action: "deleted", by: "agent" });
    await t.close();
  });
});
