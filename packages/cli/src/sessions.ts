import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** ~/.claude/projects/<slug>/<session>.jsonl — slug = cwd with every non-alphanumeric → '-'. */
export function projectSlug(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, "-");
}
export function claudeConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}
export interface SessionInfo { id: string; path: string; mtime: number; bytes: number; title: string }

/** Sessions for a repo, newest first, with a human title from the transcript's own title rows (local picker only; never into events). */
export function listSessions(cwd: string, env: NodeJS.ProcessEnv = process.env): SessionInfo[] {
  const dir = join(claudeConfigDir(env), "projects", projectSlug(cwd));
  let names: string[] = [];
  try { names = readdirSync(dir).filter((f) => f.endsWith(".jsonl")); } catch { return []; }
  const out: SessionInfo[] = [];
  for (const f of names) {
    const path = join(dir, f);
    try {
      const st = statSync(path);
      out.push({ id: f.replace(/\.jsonl$/, ""), path, mtime: st.mtimeMs, bytes: st.size, title: sessionTitle(path) });
    } catch { /* unreadable: skip */ }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

/** Title = latest `aiTitle` row, else the latest `lastPrompt` row (trimmed), else the id. Reads at most the last 256 KB. */
export function sessionTitle(path: string): string {
  let text = "";
  try {
    const st = statSync(path);
    const fd = readFileSync(path);
    text = fd.subarray(Math.max(0, st.size - 262_144)).toString("utf8");
  } catch { return ""; }
  let ai = "", prompt = "";
  for (const line of text.split("\n")) {
    if (!line.includes('"aiTitle"') && !line.includes('"lastPrompt"')) continue;
    try {
      const row = JSON.parse(line) as { aiTitle?: string; lastPrompt?: string };
      if (typeof row.aiTitle === "string" && row.aiTitle.trim()) ai = row.aiTitle.trim();
      if (typeof row.lastPrompt === "string" && row.lastPrompt.trim()) prompt = row.lastPrompt.trim();
    } catch { /* partial line */ }
  }
  const t = ai || prompt;
  return t.length > 80 ? t.slice(0, 77) + "…" : t;
}
