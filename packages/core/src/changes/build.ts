import type { AgentEvent } from "../events/types.js";

/**
 * What an agent touched in a session, per file: the change map behind the
 * Changes view, the end-of-turn summary, the VS Code tree and the PR comment.
 *
 * Pure: events (and optionally a plain description of `git status`) in, a
 * ChangeSet out. Like the events it is built from, it carries repo-relative
 * paths and counts only, never file contents.
 */
export type FileAction = "read" | "edited" | "created" | "deleted";
/** Who changed the file: the agent (seen in its events) or something else (seen only in git). */
export type ChangedBy = "agent" | "outside";

export interface FileChange {
  path: string;
  /** The strongest thing that happened to it: deleted > created > edited > read. */
  action: FileAction;
  by: ChangedBy;
  reads: number;
  edits: number;
  added: number;
  removed: number;
  /** Line counts came from git rather than from the agent's own tool results. */
  countsFromGit?: boolean;
  /** Every change to it was inferred from shell command text (not a file tool): kept only when confirmed on disk or in git. */
  inferred?: boolean;
  firstTs: number;
  lastTs: number;
  /** "main" for the lead agent, else the subagent id. */
  agents: string[];
  sessions: string[];
  eventIds: string[];
  /** The file's state in git now, when known: M modified, A added, D deleted, ? untracked, R renamed, "" clean. */
  git?: string;
}

export interface ChangeTotals {
  /** Files edited, created or deleted (by the agent). */
  changed: number;
  edited: number;
  created: number;
  deleted: number;
  /** Files only read. */
  read: number;
  added: number;
  removed: number;
  /** Files changed in the working tree that the agent's events never touched. */
  outside: number;
  /** Paths outside this folder (home, other repos) the agent changed. */
  external: number;
  /** Files the agent created and removed again in the window, never reaching git: no net change, so not on the map. */
  temporary: number;
}

export interface ChangeSet {
  files: FileChange[];
  totals: ChangeTotals;
  from: number;
  to: number;
  agents: string[];
  sessions: string[];
  /** The paths outside this folder that the agent changed (as the events name them, e.g. ~/other-repo/file), sorted, at most 500. */
  externalPaths: string[];
}

/** A plain description of the working tree, as the CLI reads it from git. Paths relative to the same folder as the events. */
export interface GitView {
  /** porcelain status letter per changed path (M, A, D, ?, R); clean files absent. */
  status: Record<string, string>;
  /** lines added/removed per path against HEAD (untracked: added = line count). */
  numstat?: Record<string, { added: number; removed: number }>;
  /** When known: the paths whose content changed since the session's baseline. Others are older, unrelated edits. */
  changedSinceBaseline?: string[];
  /** Paths changed by commits made since the baseline (letter as in status). The agent often commits mid-session. */
  committed?: Record<string, string>;
}

export interface ChangeOptions {
  /** Only events at or after this time. */
  since?: number;
  /** Only events up to this time (the Changes view's time slider). */
  until?: number;
  sessionId?: string;
  /** Only this agent ("main" or a subagent id). */
  agent?: string;
  git?: GitView;
  /** Does the path exist now? Lets shell-inferred writes and deletes be confirmed (the CLI passes fs.existsSync). */
  exists?: (path: string) => boolean;
}

const RANK: Record<FileAction, number> = { read: 0, edited: 1, created: 2, deleted: 3 };
const isExternal = (p: string) => p.startsWith("//ext/") || p.startsWith("~/") || p.startsWith("../") || p.startsWith("/") || p === ".";

export function changesFromEvents(events: readonly AgentEvent[], opts: ChangeOptions = {}): ChangeSet {
  const files = new Map<string, FileChange>();
  const external = new Set<string>();
  let from = Infinity, to = 0;
  const agentsSeen = new Set<string>(), sessionsSeen = new Set<string>();
  const shellSeen = new Set<string>(), toolSeen = new Set<string>(), toolReads = new Set<string>();
  /** Files whose first appearance in the window was their creation: if they end deleted, they never existed outside it. */
  const born = new Set<string>();
  /** Files the agent wrote (by any means) in the window. */
  const written = new Set<string>();
  const touch = (e: AgentEvent, path: string, action: FileAction): FileChange | null => {
    const p = path.replace(/\\/g, "/").replace(/^\.\//, "");
    if (!p || isExternal(p)) { if (action !== "read" && (!isShell(e) || fileLike(p))) external.add(p); return null; }
    let f = files.get(p);
    if (!f) {
      f = { path: p, action, by: "agent", reads: 0, edits: 0, added: 0, removed: 0, firstTs: e.ts, lastTs: e.ts, agents: [], sessions: [], eventIds: [] };
      files.set(p, f);
      if (action === "created") born.add(p);
    }
    if (action !== "read") (isShell(e) ? shellSeen : toolSeen).add(p);
    else if (!isShell(e)) toolReads.add(p);
    // a file deleted and then written again ends up created; edited after created stays created
    if (f.action === "deleted" && action !== "read" && action !== "deleted") f.action = action === "edited" ? "edited" : "created";
    else if (RANK[action] > RANK[f.action]) f.action = action;
    f.firstTs = Math.min(f.firstTs, e.ts); f.lastTs = Math.max(f.lastTs, e.ts);
    const who = e.agentId ?? "main";
    if (!f.agents.includes(who)) f.agents.push(who);
    if (!f.sessions.includes(e.sessionId)) f.sessions.push(e.sessionId);
    f.eventIds.push(e.id);
    return f;
  };
  for (const e of events) {
    if (opts.since !== undefined && e.ts < opts.since) continue;
    if (opts.until !== undefined && e.ts > opts.until) continue;
    if (opts.sessionId && e.sessionId !== opts.sessionId) continue;
    if (opts.agent && (e.agentId ?? "main") !== opts.agent) continue;
    let f: FileChange | null = null;
    switch (e.kind) {
      case "read_file": f = touch(e, e.path, "read"); if (f) f.reads++; break;
      case "edit_file": f = touch(e, e.path, "edited"); if (f) { f.edits++; f.added += e.added; f.removed += e.removed; } break;
      case "write_file": f = touch(e, e.path, e.created ? "created" : "edited"); if (f) { f.edits++; f.added += e.added; written.add(f.path); } break;
      case "delete_file": { const before = files.get(e.path.replace(/\\/g, "/").replace(/^\.\//, ""))?.action; f = touch(e, e.path, "deleted"); if (f) { f.edits++; if (before === "created") { f.added = 0; f.removed = 0; } } break; }
      default: continue;
    }
    if (!f) continue;
    from = Math.min(from, e.ts); to = Math.max(to, e.ts);
    agentsSeen.add(e.agentId ?? "main"); sessionsSeen.add(e.sessionId);
  }
  for (const [p, f] of files) if (f.action !== "read" && shellSeen.has(p) && !toolSeen.has(p)) f.inferred = true;
  // made and removed in the window (a scratch file, a temp script): it never existed before or after, so nothing changed.
  // Git has the last word: a path it still tracks (D) or that a commit touched did exist, and stays a deletion.
  // With git, "unknown to git" also covers files written by shell (cat > x … rm x), which carry no created flag. A delete
  // seen only in shell text of something git never knew and that isn't file-like (rm -rf dist) is cleanup, not a change.
  let temporary = 0;
  for (const [p, f] of [...files]) {
    if (f.action !== "deleted" || f.by !== "agent") continue;
    const gitKnows = !!opts.git && (opts.git.status[p] !== undefined || opts.git.committed?.[p] !== undefined);
    if (gitKnows) continue;
    // without git (a past session), "written here and gone from disk now" is the next best sign it was scratch
    const scratch = written.has(p) && (opts.git ? true : !!opts.exists && !opts.exists(p));
    if (born.has(p) || scratch) { files.delete(p); temporary++; }
    else if (opts.git && f.inferred && !fileLike(p)) files.delete(p);
  }
  confirmInferred(files, opts);
  // a read seen only in shell text (cat x, head y), including a dropped write guess that fell back to a read: it must look like a file and exist
  for (const [p, f] of files) if (f.action === "read" && !toolReads.has(p) && (!plausiblePath(p) || (opts.exists && !opts.exists(p)))) files.delete(p);
  // with a time or agent filter, git (which only knows "now") may correct the files in view but must not add others as "not by the agent"
  const filtered = opts.until !== undefined || opts.since !== undefined || !!opts.agent || !!opts.sessionId;
  if (opts.git) reconcileWithGit(files, opts.git, !filtered, opts.exists);
  const list = [...files.values()].sort(byImpact);
  const externalPaths = [...external].sort().slice(0, 500);
  return { files: list, totals: { ...totalsOf(list, external.size), temporary }, from: from === Infinity ? 0 : from, to, agents: [...agentsSeen], sessions: [...sessionsSeen], externalPaths };
}

const isShell = (e: AgentEvent): boolean => (e.kind === "write_file" || e.kind === "delete_file" || e.kind === "read_file") && e.via === "shell";
/**
 * A path whose last part looks like a file: a name with an extension, or a well-known extensionless file. Used for paths
 * known only from shell text, where words from quoted code ("await", "0,", "[Agent") would otherwise pass as files.
 */
const fileLike = (p: string): boolean => {
  const base = p.replace(/\/+$/, "").split("/").pop() ?? "";
  if (!plausiblePath(base) || /[[\](){}:,=$]/.test(base)) return false;
  return /\.[A-Za-z0-9]{1,10}$/.test(base) || /^(Makefile|Dockerfile|LICENSE|NOTICE|README|CHANGELOG|Procfile|Gemfile|Rakefile|Justfile)$/i.test(base);
};
/** A path that is plausibly a file name: shell parsing can produce stray punctuation ("—", "]", "?"). */
const plausiblePath = (p: string) => /[A-Za-z0-9]/.test(p) && !/[\s"'`<>|*?]/.test(p) && !/^[-.,:;]+$/.test(p);

/**
 * Changes known only from shell command text are guesses. With a way to look at the disk (or git), keep a guessed
 * write only if the file exists and a guessed delete only if it is gone; without one, keep them but marked.
 */
function confirmInferred(files: Map<string, FileChange>, opts: ChangeOptions): void {
  for (const [p, f] of files) {
    if (!f.inferred || f.action === "read") continue;
    if (!plausiblePath(p)) { if (f.reads > 0) { f.action = "read"; f.inferred = false; f.edits = 0; f.added = 0; f.removed = 0; } else files.delete(p); continue; }
    const st = opts.git?.status[p] ?? opts.git?.committed?.[p];
    let ok: boolean | undefined;
    if (opts.exists) ok = f.action === "deleted" ? !opts.exists(p) : opts.exists(p);
    if (ok !== false && opts.git) ok = st !== undefined; // git: a guessed change must show up in the working tree
    if (ok === false) {
      if (f.reads > 0) { f.action = "read"; f.inferred = false; f.edits = 0; f.added = 0; f.removed = 0; }
      else files.delete(p);
    }
  }
}

/** Git is the ground truth for the end state: a file the agent "wrote" that git reports deleted is deleted; untracked is created. */
function reconcileWithGit(files: Map<string, FileChange>, git: GitView, addOutside: boolean, exists?: (path: string) => boolean): void {
  const since = git.changedSinceBaseline ? new Set(git.changedSinceBaseline) : null;
  for (const f of files.values()) {
    const st = git.status[f.path] ?? git.committed?.[f.path];
    f.git = st ?? "";
    if (f.action === "read") continue;
    if (st === "D") f.action = "deleted";
    else if ((st === "?" || st === "A") && f.action !== "deleted") f.action = "created";
    // git has no record: either the delete was undone (the file is back, clean) or the file never reached git (made and removed this session)
    else if (st === undefined && f.action === "deleted" && exists?.(f.path)) f.action = "edited";
    const n = git.numstat?.[f.path];
    // a new file's line count from git is exact (the agent's own counts add up every write and edit to it)
    if (n && f.action === "created") { f.added = n.added; f.removed = 0; f.countsFromGit = true; continue; }
    // shell writes (heredocs, sed -i) report no reliable line counts; git's are better for those
    if (n && (f.added + f.removed === 0 || f.edits > 0 && f.added <= 1 && f.removed === 0)) { f.added = n.added; f.removed = n.removed; f.countsFromGit = true; }
  }
  if (!addOutside) return;
  const committed = git.committed ?? {};
  for (const [path, st] of [...Object.entries(committed), ...Object.entries(git.status)]) {
    if (files.has(path) || isExternal(path)) continue;
    if (since && !since.has(path) && !(path in committed)) continue;
    const n = git.numstat?.[path];
    files.set(path, { path, action: st === "D" ? "deleted" : st === "?" || st === "A" ? "created" : "edited", by: "outside", reads: 0, edits: 0, added: n?.added ?? 0, removed: n?.removed ?? 0, countsFromGit: !!n, firstTs: 0, lastTs: 0, agents: [], sessions: [], eventIds: [], git: st });
  }
}

function byImpact(a: FileChange, b: FileChange): number {
  if ((a.action === "read") !== (b.action === "read")) return a.action === "read" ? 1 : -1;
  if (a.by !== b.by) return a.by === "agent" ? -1 : 1;
  const d = (b.added + b.removed) - (a.added + a.removed);
  return d || a.path.localeCompare(b.path);
}

function totalsOf(list: FileChange[], external: number): ChangeTotals {
  const t: ChangeTotals = { changed: 0, edited: 0, created: 0, deleted: 0, read: 0, added: 0, removed: 0, outside: 0, external, temporary: 0 };
  for (const f of list) {
    if (f.by === "outside") { t.outside++; continue; }
    if (f.action === "read") { t.read++; continue; }
    t.changed++;
    t[f.action]++;
    t.added += f.added; t.removed += f.removed;
  }
  return t;
}

/** The events of the current turn: everything after the last turn_end of this session (exclusive). */
export function currentTurn(events: readonly AgentEvent[], sessionId?: string): AgentEvent[] {
  const own = sessionId ? events.filter((e) => e.sessionId === sessionId) : [...events];
  let cut = 0;
  for (let i = own.length - 1; i >= 0; i--) {
    if (own[i]!.kind === "turn_end") {
      // the turn_end that closes THIS turn is the last one; the previous one opens it
      for (let j = i - 1; j >= 0; j--) if (own[j]!.kind === "turn_end") { cut = j + 1; break; }
      return own.slice(cut, i + 1);
    }
  }
  return own;
}
