import { mkdtempSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listSessions, projectSlug, sessionTitle } from "../src/sessions.js";

describe("sessions", () => {
  it("slugs the cwd the way Claude Code does", () => {
    expect(projectSlug("/Users/shreyassawant/ai-agent-browser")).toBe("-Users-shreyassawant-ai-agent-browser");
    expect(projectSlug("C:\\dev\\my app")).toBe("C--dev-my-app");
  });
  it("lists a repo's sessions newest first with titles from the transcript's own title rows", () => {
    const cfg = mkdtempSync(join(tmpdir(), "at-cfg-"));
    const cwd = "/work/acme";
    const dir = join(cfg, "projects", projectSlug(cwd));
    mkdirSync(dir, { recursive: true });
    const row = (o: object) => JSON.stringify(o) + "\n";
    writeFileSync(join(dir, "old.jsonl"), row({ type: "user", message: { content: "hi" } }) + row({ type: "last-prompt", lastPrompt: "fix the login timeout please" }));
    writeFileSync(join(dir, "new.jsonl"), row({ type: "ai-title", aiTitle: "Login timeout fix" }) + row({ type: "last-prompt", lastPrompt: "later prompt" }));
    writeFileSync(join(dir, "notes.txt"), "ignored");
    utimesSync(join(dir, "old.jsonl"), new Date(1_700_000_000_000), new Date(1_700_000_000_000));
    utimesSync(join(dir, "new.jsonl"), new Date(1_700_000_900_000), new Date(1_700_000_900_000));
    const s = listSessions(cwd, { CLAUDE_CONFIG_DIR: cfg } as NodeJS.ProcessEnv);
    expect(s.map((x) => x.id)).toEqual(["new", "old"]);
    expect(s[0]!.title).toBe("Login timeout fix");
    expect(s[1]!.title).toBe("fix the login timeout please");
  });
  it("returns [] for a repo with no sessions and '' for an unreadable file", () => {
    expect(listSessions("/nowhere/x", { CLAUDE_CONFIG_DIR: "/nonexistent" } as NodeJS.ProcessEnv)).toEqual([]);
    expect(sessionTitle("/nonexistent/file.jsonl")).toBe("");
  });
});
