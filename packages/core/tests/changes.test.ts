import { describe, expect, it } from "vitest";
import { extractDeletes, classifyBash } from "../src/adapters/bash-intent.js";
import { toolCallToOutcome } from "../src/adapters/tool-call.js";
import { changesFromEvents, currentTurn } from "../src/changes/build.js";
import { headline, toMarkdown, toTree, turnSummary, PR_MARKER } from "../src/changes/format.js";
import { parseTranscript } from "../src/adapters/transcript.js";
import type { AgentEvent, AgentEventBody } from "../src/events/types.js";
import { findLeaks } from "../src/privacy/leaks.js";
import { readFixture, readJson } from "./_fixtures.js";

let seq = 0;
const ev = (body: AgentEventBody, extra: Partial<AgentEvent> = {}): AgentEvent => ({ id: `e${seq}`, seq: seq++, ts: 1000 + seq * 10, sessionId: "s1", source: "hook", ...body, ...extra }) as AgentEvent;

describe("extractDeletes", () => {
  it("finds rm, git rm, unlink and the source of mv", () => {
    expect(extractDeletes("rm old.ts")).toEqual(["old.ts"]);
    expect(extractDeletes("rm -rf build/ && echo ok")).toEqual(["build"]);
    expect(extractDeletes("git rm -q src/a.ts src/b.ts")).toEqual(["src/a.ts", "src/b.ts"]);
    expect(extractDeletes("unlink x.json")).toEqual(["x.json"]);
    expect(extractDeletes("mv old.ts new.ts")).toEqual(["old.ts"]);
    expect(extractDeletes("git mv a/one.ts b/one.ts")).toEqual(["a/one.ts"]);
    expect(extractDeletes("cd pkg && rm -f dist/index.js")).toEqual(["dist/index.js"]);
  });
  it("skips globs, variables, /dev paths and non-delete commands", () => {
    expect(extractDeletes("rm -f *.log")).toEqual([]);
    expect(extractDeletes("rm $TMPFILE")).toEqual([]);
    expect(extractDeletes("grep rm notes.txt")).toEqual([]);
    expect(extractDeletes("echo rm a.ts")).toEqual([]);
    expect(extractDeletes("cat <<'EOF' > x\nrm everything.ts\nEOF")).toEqual([]);
  });
  it("marks a delete-only command as file work", () => {
    expect(classifyBash("rm a.ts").intent).toBe("write_file");
    expect(classifyBash("rm a.ts").deletes).toEqual(["a.ts"]);
  });
  it("turns into delete_file events from a Bash call", () => {
    const out = toolCallToOutcome({ name: "Bash", input: { command: "git rm src/old.ts" } }, { cwd: "/repo" });
    expect(out.bodies).toContainEqual({ kind: "delete_file", path: "src/old.ts", via: "shell" });
  });
});

describe("shell paths after cd", () => {
  it("resolves relative targets against a leading cd", () => {
    const ctx = { cwd: "/home/me/repo", home: "/home/me" };
    const paths = (cmd: string) => toolCallToOutcome({ name: "Bash", input: { command: cmd } }, ctx).bodies.filter((b) => b.kind === "write_file" || b.kind === "delete_file").map((b) => (b as { path: string }).path);
    expect(paths("cd site && sed -i '' 's/a/b/' home.css")).toEqual(["site/home.css"]);
    expect(paths("cd ~/other && echo x > notes.md")).toEqual(["~/other/notes.md"]);
    expect(paths("cd /tmp/x && rm a.txt")).toEqual(["//ext/a.txt"]);
    expect(paths("echo x > here.md")).toEqual(["here.md"]);
  });
});

describe("shell guesses are confirmed", () => {
  const shellWrite = (path: string) => ev({ kind: "write_file", path, added: 1, created: false, via: "shell" });
  it("keeps a guessed write only if the file exists, a guessed delete only if it is gone, and drops stray punctuation", () => {
    const events = [shellWrite("real.ts"), shellWrite("ghost.ts"), ev({ kind: "delete_file", path: "gone.ts", via: "shell" }), ev({ kind: "delete_file", path: "still-here.ts", via: "shell" }), shellWrite("—"), shellWrite("?")];
    const on = new Set(["real.ts", "still-here.ts"]);
    const cs = changesFromEvents(events, { exists: (p) => on.has(p) });
    expect(cs.files.map((f) => `${f.path}:${f.action}`).sort()).toEqual(["gone.ts:deleted", "real.ts:edited"]);
    expect(cs.files.every((f) => f.inferred)).toBe(true);
  });
  it("a tool edit is never second-guessed, and a read survives a dropped guess", () => {
    const events = [ev({ kind: "edit_file", path: "tool.ts", added: 1, removed: 0, hunks: 1 }), ev({ kind: "read_file", path: "seen.ts" }), shellWrite("seen.ts")];
    const cs = changesFromEvents(events, { exists: () => false });
    expect(cs.files.find((f) => f.path === "tool.ts")).toMatchObject({ action: "edited" });
    expect(cs.files.find((f) => f.path === "tool.ts")!.inferred).toBeUndefined();
    expect(cs.files.find((f) => f.path === "seen.ts")).toMatchObject({ action: "read" });
  });
  it("with git, a guessed change must show up in the working tree", () => {
    const cs = changesFromEvents([shellWrite("clean.ts"), shellWrite("dirty.ts")], { git: { status: { "dirty.ts": "M" } } });
    expect(cs.files.map((f) => f.path)).toEqual(["dirty.ts"]);
  });
});

describe("changesFromEvents", () => {
  it("collects per-file actions, counts, agents and totals", () => {
    const events = [
      ev({ kind: "session_start", repoId: "r" }),
      ev({ kind: "read_file", path: "README.md" }),
      ev({ kind: "edit_file", path: "src/a.ts", added: 10, removed: 2, hunks: 1 }),
      ev({ kind: "edit_file", path: "src/a.ts", added: 3, removed: 1, hunks: 1 }),
      ev({ kind: "write_file", path: "src/new.ts", added: 40, created: true }),
      ev({ kind: "delete_file", path: "src/old.ts" }),
      ev({ kind: "read_file", path: "src/a.ts" }),
      ev({ kind: "edit_file", path: "lib/x.ts", added: 1, removed: 0, hunks: 1 }, { agentId: "sub1" }),
      ev({ kind: "edit_file", path: "~/.claude/settings.json", added: 1, removed: 0, hunks: 1 }),
      ev({ kind: "run_command", argv0: "pnpm", intent: "test", touched: [], ok: true }),
    ];
    const cs = changesFromEvents(events);
    const a = cs.files.find((f) => f.path === "src/a.ts")!;
    expect(a).toMatchObject({ action: "edited", edits: 2, reads: 1, added: 13, removed: 3, by: "agent" });
    expect(cs.files.find((f) => f.path === "src/new.ts")!.action).toBe("created");
    expect(cs.files.find((f) => f.path === "src/old.ts")!.action).toBe("deleted");
    expect(cs.files.find((f) => f.path === "lib/x.ts")!.agents).toEqual(["sub1"]);
    expect(cs.files.find((f) => f.path === "README.md")!.action).toBe("read");
    expect(cs.totals).toEqual({ changed: 4, edited: 2, created: 1, deleted: 1, read: 1, added: 54, removed: 3, outside: 0, external: 1 });
    // most impact first, reads last
    expect(cs.files[0]!.path).toBe("src/new.ts");
    expect(cs.files[cs.files.length - 1]!.action).toBe("read");
    expect(cs.agents.sort()).toEqual(["main", "sub1"]);
  });

  it("filters by time, session and agent", () => {
    const events = [ev({ kind: "edit_file", path: "a.ts", added: 1, removed: 0, hunks: 1 }), ev({ kind: "edit_file", path: "b.ts", added: 1, removed: 0, hunks: 1 }, { agentId: "s9" }), ev({ kind: "edit_file", path: "c.ts", added: 1, removed: 0, hunks: 1 }, { sessionId: "s2" })];
    expect(changesFromEvents(events, { until: events[0]!.ts }).files.map((f) => f.path)).toEqual(["a.ts"]);
    expect(changesFromEvents(events, { agent: "s9" }).files.map((f) => f.path)).toEqual(["b.ts"]);
    expect(changesFromEvents(events, { sessionId: "s2" }).files.map((f) => f.path)).toEqual(["c.ts"]);
  });

  it("a file deleted then rewritten ends up created; re-created then edited stays created", () => {
    const cs = changesFromEvents([ev({ kind: "delete_file", path: "x.ts" }), ev({ kind: "write_file", path: "x.ts", added: 5, created: true }), ev({ kind: "edit_file", path: "x.ts", added: 1, removed: 0, hunks: 1 })]);
    expect(cs.files[0]!.action).toBe("created");
  });

  it("reconciles with git: deletes, untracked, shell-write counts, and changes made outside the agent", () => {
    const events = [
      ev({ kind: "write_file", path: "gen.ts", added: 1, created: false }), // a heredoc: counts unreliable
      ev({ kind: "delete_file", path: "kept.ts" }), // rm failed: git says the file is still there and clean
      ev({ kind: "write_file", path: "fresh.ts", added: 3, created: false }),
      ev({ kind: "edit_file", path: "gone.ts", added: 1, removed: 0, hunks: 1 }),
    ];
    const cs = changesFromEvents(events, { exists: (p) => p !== "gone.ts", git: {
      status: { "gen.ts": "M", "fresh.ts": "?", "gone.ts": "D", "human.ts": "M", "old-work.ts": "M" },
      numstat: { "gen.ts": { added: 120, removed: 4 }, "human.ts": { added: 2, removed: 2 } },
      changedSinceBaseline: ["gen.ts", "fresh.ts", "gone.ts", "human.ts"],
    } });
    const by = (p: string) => cs.files.find((f) => f.path === p)!;
    expect(by("gen.ts")).toMatchObject({ added: 120, removed: 4, countsFromGit: true, action: "edited" });
    expect(by("kept.ts").action).toBe("edited");
    expect(by("fresh.ts").action).toBe("created");
    expect(by("gone.ts").action).toBe("deleted");
    expect(by("human.ts")).toMatchObject({ by: "outside", action: "edited" });
    expect(cs.files.find((f) => f.path === "old-work.ts")).toBeUndefined(); // dirty before the session began
    expect(cs.totals.outside).toBe(1);
  });

  it("keeps the privacy invariant: no planted secret reaches the change set or its text", () => {
    const { events } = parseTranscript(readFixture("secrets.jsonl"), { home: "/Users/someone" });
    const markers = Object.entries(readJson<Record<string, string>>("secrets.markers.json")).filter(([k]) => k !== "text").map(([, v]) => v);
    const cs = changesFromEvents(events);
    const all = JSON.stringify(cs) + toMarkdown(cs) + turnSummary(cs) + toTree(cs, { includeReads: true }).map((l) => l.text).join("\n");
    expect(findLeaks(all, markers)).toEqual([]);
  });
});

describe("currentTurn", () => {
  it("is the events between the previous turn_end and the last one", () => {
    const a = ev({ kind: "edit_file", path: "a.ts", added: 1, removed: 0, hunks: 1 });
    const t1 = ev({ kind: "turn_end", claimedSuccess: false });
    const b = ev({ kind: "edit_file", path: "b.ts", added: 1, removed: 0, hunks: 1 });
    const other = ev({ kind: "edit_file", path: "z.ts", added: 1, removed: 0, hunks: 1 }, { sessionId: "s2" });
    const t2 = ev({ kind: "turn_end", claimedSuccess: true });
    expect(currentTurn([a, t1, b, other, t2], "s1").map((e) => e.id)).toEqual([b.id, t2.id]);
    expect(currentTurn([a, t1], "s1").map((e) => e.id)).toEqual([a.id, t1.id]);
    expect(currentTurn([a], "s1").map((e) => e.id)).toEqual([a.id]);
  });
});

describe("formatting", () => {
  const cs = changesFromEvents([
    ev({ kind: "edit_file", path: "src/a.ts", added: 10, removed: 2, hunks: 1 }),
    ev({ kind: "write_file", path: "src/new.ts", added: 40, created: true }),
    ev({ kind: "delete_file", path: "old.ts" }),
    ev({ kind: "read_file", path: "README.md" }),
  ]);
  it("headline and turn summary", () => {
    expect(headline(cs)).toBe("3 files changed (+50 −2) · 1 new · 1 deleted");
    expect(turnSummary(cs, { mapUrl: "http://127.0.0.1:4000/?view=changes" })).toBe("Agent Theatre · this turn: 3 files changed (+50 −2) · 1 new · 1 deleted\nsrc/new.ts (new, +40), src/a.ts (+10 −2), old.ts (deleted) · map: http://127.0.0.1:4000/?view=changes");
    expect(turnSummary(changesFromEvents([ev({ kind: "read_file", path: "x" })]))).toBe("");
    const many = changesFromEvents(Array.from({ length: 8 }, (_, i) => ev({ kind: "edit_file", path: `f${i}.ts`, added: 1, removed: 0, hunks: 1 })));
    expect(turnSummary(many)).toMatch(/, 3 more$/);
  });
  it("markdown has the marker, a table, and reads folded away", () => {
    const md = toMarkdown(cs);
    expect(md.startsWith(PR_MARKER)).toBe(true);
    expect(md).toContain("| created | `src/new.ts` | +40 |");
    expect(md).toContain("| deleted | `old.ts` |  |");
    expect(md).toContain("<summary>Read only (1)</summary>");
    expect(toMarkdown(changesFromEvents([]))).toContain("The agent changed no files.");
  });
  it("escapes backticks and pipes in paths", () => {
    const md = toMarkdown(changesFromEvents([ev({ kind: "edit_file", path: "we|ird`name.ts", added: 1, removed: 0, hunks: 1 })]));
    expect(md).toContain("`we\\|ird'name.ts`");
  });
  it("tree groups by folder", () => {
    expect(toTree(cs).map((l) => "  ".repeat(l.depth) + l.text)).toEqual(["old.ts  deleted", "src/", "  a.ts  +10 −2", "  new.ts  new, +40"]);
  });
});

describe("shell reads are confirmed too", () => {
  it("drops reads parsed from shell text that are not real files, keeps tool reads", () => {
    const sr = (path: string) => ev({ kind: "read_file", path, via: "shell" });
    const cs = changesFromEvents([sr("—"), sr("(districts"), sr("*glob*"), sr("ghost.md"), sr("real.md"), ev({ kind: "read_file", path: "tool-read.md" })], { exists: (p) => p === "real.md" });
    expect(cs.files.map((f) => f.path).sort()).toEqual(["real.md", "tool-read.md"]);
  });
});

describe("a failed shell write that was also a shell read", () => {
  it("is dropped entirely when the file does not exist", () => {
    const cs = changesFromEvents([ev({ kind: "read_file", path: "cat", via: "shell" }), ev({ kind: "write_file", path: "cat", added: 3, created: false, via: "shell" })], { exists: () => false });
    expect(cs.files).toEqual([]);
  });
});

describe("changes committed during the session", () => {
  it("still count: a shell delete that was committed, and a commit by someone else", () => {
    const cs = changesFromEvents([ev({ kind: "delete_file", path: "old.ts", via: "shell" })], { exists: () => false, git: { status: {}, committed: { "old.ts": "D", "other.ts": "M" }, numstat: { "other.ts": { added: 3, removed: 1 } }, changedSinceBaseline: [] } });
    expect(cs.files.map((f) => `${f.path}:${f.action}:${f.by}`).sort()).toEqual(["old.ts:deleted:agent", "other.ts:edited:outside"]);
  });
});

describe("filters and git", () => {
  it("an agent or time filter never turns other files into 'not by the agent'", () => {
    const events = [ev({ kind: "edit_file", path: "a.ts", added: 1, removed: 0, hunks: 1 }), ev({ kind: "edit_file", path: "b.ts", added: 1, removed: 0, hunks: 1 }, { agentId: "h1" })];
    const git = { status: { "a.ts": "M", "b.ts": "M", "c.ts": "M" }, changedSinceBaseline: ["a.ts", "b.ts", "c.ts"] };
    expect(changesFromEvents(events, { git, agent: "h1" }).files.map((f) => f.path)).toEqual(["b.ts"]);
    expect(changesFromEvents(events, { git, until: events[0]!.ts }).files.map((f) => f.path)).toEqual(["a.ts"]);
    expect(changesFromEvents(events, { git }).files.map((f) => `${f.path}:${f.by}`)).toEqual(["a.ts:agent", "b.ts:agent", "c.ts:outside"]);
  });
});

describe("live test findings (1.6.1)", () => {
  it("a file created and deleted in the same session stays deleted, with nothing left to count", () => {
    const events = [ev({ kind: "write_file", path: "t/plan.md", added: 3, created: true }), ev({ kind: "delete_file", path: "t/plan.md", via: "shell" })];
    const plain = changesFromEvents(events);
    expect(plain.files[0]).toMatchObject({ action: "deleted", added: 0, removed: 0 });
    const withGit = changesFromEvents(events, { exists: () => false, git: { status: {} } });
    expect(withGit.files[0]).toMatchObject({ action: "deleted", added: 0, removed: 0 });
  });
  it("a delete that was undone (file back, clean in git) reads as edited", () => {
    const cs = changesFromEvents([ev({ kind: "delete_file", path: "kept.ts", via: "shell" }), ev({ kind: "write_file", path: "kept.ts", added: 2, created: false })], { exists: () => true, git: { status: {} } });
    expect(cs.files[0]!.action).not.toBe("deleted");
  });
  it("a new file takes git's exact line count, not the sum of its writes and edits", () => {
    const events = [ev({ kind: "write_file", path: "t/notes.md", added: 6, created: true }), ev({ kind: "edit_file", path: "t/notes.md", added: 3, removed: 1, hunks: 1 })];
    const cs = changesFromEvents(events, { exists: () => true, git: { status: { "t/notes.md": "?" }, numstat: { "t/notes.md": { added: 8, removed: 0 } } } });
    expect(cs.files[0]).toMatchObject({ action: "created", added: 8, removed: 0, countsFromGit: true });
  });
});
