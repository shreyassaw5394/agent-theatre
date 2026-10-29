import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { GitView } from "@agent-theatre/core";

/**
 * Read-only views of the working tree for the change map. Every call is a
 * direct `git` exec (no shell), bounded by a timeout, and never writes to the
 * repository. Paths come back relative to `cwd` (the stage's folder), the same
 * frame the agent's events use. Outside a git repo everything returns null.
 */
const MAX_FILES = 3000;
const MAX_HASH_BYTES = 5_000_000;

function git(cwd: string, args: string[], timeout = 4000): string | null {
  const r = spawnSync("git", ["-C", cwd, "-c", "core.quotepath=off", ...args], { encoding: "utf8", timeout, maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  return r.status === 0 ? r.stdout : null;
}

export function gitRoot(cwd: string): string | null {
  const out = git(cwd, ["rev-parse", "--show-toplevel"], 2000);
  return out ? out.trim() : null;
}

/** porcelain status per path, relative to cwd. Renames report the new path as R and the old one as D. */
export function gitStatus(cwd: string, timeout = 4000): Record<string, string> | null {
  const root = gitRoot(cwd);
  if (!root) return null;
  const out = git(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], timeout);
  if (out === null) return null;
  const status: Record<string, string> = {};
  const parts = out.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const rec = parts[i]!;
    if (rec.length < 4) continue;
    const x = rec[0]!, y = rec[1]!, path = rec.slice(3);
    const letter = x === "?" ? "?" : x === "R" || y === "R" ? "R" : x === "D" || y === "D" ? "D" : x === "A" ? "A" : "M";
    const rel = toCwd(root, cwd, path);
    if (rel) status[rel] = letter;
    if (x === "R" || x === "C") { const from = parts[++i]; const r = from ? toCwd(root, cwd, from) : null; if (r && x === "R") status[r] = "D"; }
    if (Object.keys(status).length >= MAX_FILES) break;
  }
  return status;
}

/** Lines added/removed against HEAD for tracked files; untracked files count every line as added. */
export function gitNumstat(cwd: string, status: Record<string, string>, timeout = 4000): Record<string, { added: number; removed: number }> {
  const root = gitRoot(cwd);
  const out: Record<string, { added: number; removed: number }> = {};
  if (!root) return out;
  const tracked = git(cwd, ["diff", "--numstat", "-z", "HEAD", "--", "."], timeout) ?? git(cwd, ["diff", "--numstat", "-z", "--", "."], timeout) ?? "";
  // -z numstat: "added\tremoved\tpath\0" (renames: "a\tr\t\0old\0new\0")
  const recs = tracked.split("\0");
  for (let i = 0; i < recs.length; i++) {
    const m = recs[i]!.match(/^(\d+|-)\t(\d+|-)\t(.*)$/);
    if (!m) continue;
    let path = m[3]!;
    if (!path) { i += 2; path = recs[i] ?? ""; }
    const rel = toCwd(root, cwd, path);
    if (rel) out[rel] = { added: m[1] === "-" ? 0 : Number(m[1]), removed: m[2] === "-" ? 0 : Number(m[2]) };
  }
  for (const [p, st] of Object.entries(status)) {
    if (st !== "?" || out[p]) continue;
    try { const s = statSync(join(cwd, p)); if (s.size < 2_000_000) { const t = readFileSync(join(cwd, p), "utf8"); out[p] = { added: t ? t.split("\n").length - (t.endsWith("\n") ? 1 : 0) : 0, removed: 0 }; } } catch { /* gone or unreadable */ }
  }
  return out;
}

/** Fingerprint of every dirty path: what the tree looked like when the stage started watching. */
export interface Baseline { at: number; hashes: Record<string, string>; head?: string }
export function takeBaseline(cwd: string): Baseline | null {
  const status = gitStatus(cwd);
  if (!status) return null;
  const hashes: Record<string, string> = {};
  for (const p of Object.keys(status)) hashes[p] = fingerprint(cwd, p);
  const head = git(cwd, ["rev-parse", "HEAD"], 2000)?.trim();
  return { at: Date.now(), hashes, ...(head ? { head } : {}) };
}

/** The full GitView for the change map: status now, line counts, and which paths changed since the baseline. */
export function gitView(cwd: string, baseline: Baseline | null, timeout = 4000): GitView | null {
  const status = gitStatus(cwd, timeout);
  if (!status) return null;
  const view: GitView = { status, numstat: gitNumstat(cwd, status, timeout) };
  if (baseline) view.changedSinceBaseline = Object.keys(status).filter((p) => baseline.hashes[p] !== fingerprint(cwd, p));
  // commits made since the stage started: their files changed during this session too
  if (baseline?.head) {
    const head = git(cwd, ["rev-parse", "HEAD"], timeout)?.trim();
    if (head && head !== baseline.head) {
      const root = gitRoot(cwd);
      const out = root ? git(cwd, ["diff", "--name-status", "-z", "--no-renames", baseline.head, head, "--", "."], timeout) : null;
      if (out && root) {
        const committed: Record<string, string> = {};
        const parts = out.split("\0");
        for (let i = 0; i + 1 < parts.length; i += 2) { const rel = toCwd(root, cwd, parts[i + 1]!); if (rel) committed[rel] = parts[i]![0] === "D" ? "D" : parts[i]![0] === "A" ? "A" : "M"; }
        view.committed = committed;
        // their line counts against the baseline commit, for files no longer dirty
        const ns = git(cwd, ["diff", "--numstat", "-z", "--no-renames", baseline.head, head, "--", "."], timeout) ?? "";
        for (const rec of ns.split("\0")) { const m = rec.match(/^(\d+|-)\t(\d+|-)\t(.+)$/); if (!m) continue; const rel = toCwd(root, cwd, m[3]!); if (rel && !view.numstat![rel]) view.numstat![rel] = { added: m[1] === "-" ? 0 : Number(m[1]), removed: m[2] === "-" ? 0 : Number(m[2]) }; }
      }
    }
  }
  return view;
}

/** sha1 of a file's bytes, "gone" when it no longer exists, "big" when too large to hash cheaply (compared by size+mtime). */
function fingerprint(cwd: string, p: string): string {
  try {
    const st = statSync(join(cwd, p));
    if (st.isDirectory()) return `dir:${st.mtimeMs}`;
    if (st.size > MAX_HASH_BYTES) return `big:${st.size}:${st.mtimeMs}`;
    return createHash("sha1").update(readFileSync(join(cwd, p))).digest("hex");
  } catch { return "gone"; }
}

function toCwd(root: string, cwd: string, repoPath: string): string | null {
  const rel = relative(cwd, join(root, repoPath)).split(sep).join("/");
  return !rel || rel.startsWith("..") ? null : rel;
}

/**
 * The unified diff for one path against HEAD (untracked: the whole file as added), capped.
 * The caller decides which paths are allowed; this only refuses anything outside cwd.
 */
export function diffFor(cwd: string, path: string, maxBytes = 400_000): { diff: string; truncated: boolean } | null {
  if (!path || path.includes("\0") || path.startsWith("/") || path.split("/").includes("..")) return null;
  const root = gitRoot(cwd);
  if (!root) return null;
  let out = git(cwd, ["diff", "--no-color", "--no-ext-diff", "HEAD", "--", path], 4000) ?? "";
  if (!out) {
    // untracked or new: diff against nothing. --no-index exits 1 when files differ, so read stdout regardless
    const r = spawnSync("git", ["-C", cwd, "diff", "--no-color", "--no-index", "--", "/dev/null", path], { encoding: "utf8", timeout: 4000, maxBuffer: 32 * 1024 * 1024, windowsHide: true });
    out = r.stdout ?? "";
  }
  const truncated = out.length > maxBytes;
  return { diff: truncated ? out.slice(0, maxBytes) : out, truncated };
}
