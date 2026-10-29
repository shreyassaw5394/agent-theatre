import { existsSync, readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { changesFromEvents, parseTranscript, toMarkdown, PR_MARKER, type ChangeSet } from "@agent-theatre/core";
import { gitView } from "./git.js";
import { listSessions } from "./sessions.js";
import { isWithin } from "./server.js";

/**
 * The change map outside the stage: for the `changes` command, the VS Code
 * tree and the PR comment. Prefers a running stage for this folder (it has
 * the live events and a baseline); otherwise reads the newest session's
 * transcript and reconciles it with git as the tree is now.
 */
export interface RepoChanges { cs: ChangeSet; source: "live" | "session" | "none"; sessionId?: string; mapUrl?: string }

export async function changesForRepo(cwd: string, opts: { sessionId?: string; preferLive?: boolean } = {}): Promise<RepoChanges> {
  if (opts.preferLive !== false && !opts.sessionId) {
    const live = await fromLiveStage(cwd);
    if (live && live.cs.files.length) return live;
  }
  const sessions = listSessions(cwd);
  const s = opts.sessionId ? sessions.find((x) => x.id === opts.sessionId || x.id.startsWith(opts.sessionId!)) : sessions[0];
  if (!s) return { cs: changesFromEvents([]), source: "none" };
  const { events } = parseTranscript(readFileSync(s.path, "utf8"), { home: homedir() });
  const base = changesFromEvents(events, { exists: (p: string) => existsSync(join(cwd, p)) });
  // the tree as it is now; "not by the agent" only for files modified after the session began
  const git = gitView(cwd, null);
  if (git) {
    const since = base.from || s.mtime - 3600_000;
    git.changedSinceBaseline = Object.keys(git.status).filter((p) => { try { return statSync(join(cwd, p)).mtimeMs >= since; } catch { return false; } });
  }
  const exists = (p: string) => existsSync(join(cwd, p));
  return { cs: changesFromEvents(events, { exists, ...(git ? { git } : {}) }), source: "session", sessionId: s.id };
}

/** Ask a running stage for this folder (registry: ~/.agent-theatre/ports/<port> holds its folder). */
async function fromLiveStage(cwd: string): Promise<RepoChanges | null> {
  const home = process.env.AGENT_THEATRE_HOME || join(homedir(), ".agent-theatre");
  let ports: string[] = [];
  try { ports = readdirSync(join(home, "ports")); } catch { return null; }
  for (const p of ports) {
    let dir = "";
    try { dir = readFileSync(join(home, "ports", p), "utf8").trim(); } catch { continue; }
    if (!dir || !(isWithin(cwd, dir) && isWithin(dir, cwd))) continue;
    try {
      const r = await fetch(`http://127.0.0.1:${parseInt(p, 10)}/api/changes`, { signal: AbortSignal.timeout(1500) });
      if (r.ok) return { cs: (await r.json()) as ChangeSet, source: "live", mapUrl: `http://127.0.0.1:${parseInt(p, 10)}/?live=1&view=changes` };
    } catch { /* dead stage */ }
  }
  return null;
}

/** The open pull request for this branch, via the person's own gh login. */
export function currentPr(cwd: string): { number: number; url: string } | { error: string } {
  const r = spawnSync("gh", ["pr", "view", "--json", "number,url"], { cwd, encoding: "utf8", timeout: 15000 });
  if (r.error) return { error: "GitHub CLI (gh) is not installed. Install it from https://cli.github.com and run `gh auth login`." };
  if (r.status !== 0) return { error: (r.stderr || "No pull request for this branch.").trim().split("\n")[0]! };
  try { const j = JSON.parse(r.stdout) as { number: number; url: string }; return { number: j.number, url: j.url }; } catch { return { error: "Could not read the pull request." }; }
}

/** Post the change map on the PR, replacing our earlier comment if there is one. Returns the comment URL. */
export function postPrComment(cwd: string, pr: number, cs: ChangeSet): { url: string; updated: boolean } | { error: string } {
  const body = toMarkdown(cs);
  const tmp = mkdtempSync(join(tmpdir(), "at-pr-"));
  const file = join(tmp, "body.md");
  writeFileSync(file, body);
  try {
    // our earlier comment: the newest one that starts with the marker and was written by the person posting now
    const me = spawnSync("gh", ["api", "user", "--jq", ".login"], { cwd, encoding: "utf8", timeout: 15000 }).stdout?.trim() ?? "";
    const list = spawnSync("gh", ["api", "--paginate", `repos/{owner}/{repo}/issues/${pr}/comments`, "--jq", `.[] | select(.body | startswith("${PR_MARKER}")) | "\\(.id) \\(.user.login)"`], { cwd, encoding: "utf8", timeout: 20000 });
    const rows = list.status === 0 ? list.stdout.split("\n").map((x) => x.trim().split(" ")).filter((x) => x.length === 2) : [];
    const existing = me ? rows.filter(([, who]) => who === me).map(([id]) => id!).pop() ?? null : null;
    if (existing) {
      const r = spawnSync("gh", ["api", "-X", "PATCH", `repos/{owner}/{repo}/issues/comments/${existing}`, "-F", `body=@${file}`, "--jq", ".html_url"], { cwd, encoding: "utf8", timeout: 20000 });
      if (r.status !== 0) return { error: (r.stderr || "Could not update the comment.").trim().split("\n")[0]! };
      return { url: r.stdout.trim(), updated: true };
    }
    const r = spawnSync("gh", ["pr", "comment", String(pr), "--body-file", file], { cwd, encoding: "utf8", timeout: 20000 });
    if (r.status !== 0) return { error: (r.stderr || "Could not post the comment.").trim().split("\n")[0]! };
    return { url: r.stdout.trim(), updated: false };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
