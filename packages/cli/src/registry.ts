import { chmodSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The stage registry: one file per running stage at <home>/ports/<port>, holding JSON {cwd, id}. The id is a random
 * secret the stage also answers on /healthz, so the hook can tell a stage from whatever else later binds that port.
 * Files are 0600 and the folders 0700. Entries written by older builds hold the bare folder path; they still read.
 */
export interface StageEntry { port: number; cwd: string; id?: string }

export function parseEntry(port: number, text: string): StageEntry {
  const t = text.trim();
  if (t.startsWith("{")) {
    try {
      const j = JSON.parse(t) as { cwd?: unknown; id?: unknown };
      return { port, cwd: typeof j.cwd === "string" ? j.cwd : "", ...(typeof j.id === "string" && j.id ? { id: j.id } : {}) };
    } catch { return { port, cwd: "" }; }
  }
  return { port, cwd: t };
}

export function readRegistry(home: string): StageEntry[] {
  const out: StageEntry[] = [];
  let files: string[] = [];
  try { files = readdirSync(join(home, "ports")); } catch { return out; }
  for (const f of files) {
    const port = parseInt(f, 10);
    if (!(port > 0) || String(port) !== f) continue;
    try { out.push(parseEntry(port, readFileSync(join(home, "ports", f), "utf8"))); } catch { /* gone */ }
  }
  return out;
}

/** Create <home> and <home>/ports owner-only (tightening folders an older build created with default modes). */
export function ensurePrivateDirs(home: string): void {
  for (const d of [home, join(home, "ports")]) {
    mkdirSync(d, { recursive: true, mode: 0o700 });
    try { chmodSync(d, 0o700); } catch { /* not ours to change (or Windows) */ }
  }
}

export function writePrivate(file: string, text: string): void {
  writeFileSync(file, text, { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* Windows */ }
}
