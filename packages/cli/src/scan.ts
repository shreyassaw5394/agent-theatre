import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { isIgnoredPath, type FileNode } from "@agent-theatre/core";

/** The repo's file tree as FileNodes. Counts lines only; never keeps contents. Bounded for huge repos. */
export function scanRepo(root: string, opts: { maxFiles?: number; maxBytesForLoc?: number } = {}): FileNode[] {
  const maxFiles = opts.maxFiles ?? 20_000, maxBytes = opts.maxBytesForLoc ?? 512_000;
  const files: FileNode[] = [];
  const walk = (dir: string): void => {
    if (files.length >= maxFiles) return;
    let ents: import("node:fs").Dirent[];
    try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of ents) {
      if (files.length >= maxFiles) return;
      const full = join(dir, ent.name);
      const rel = relative(root, full).replace(/\\/g, "/");
      if (isIgnoredPath(rel + (ent.isDirectory() ? "/" : ""))) continue;
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile()) {
        let size = 0;
        try { size = statSync(full).size; } catch { continue; }
        let loc: number | undefined;
        if (size < maxBytes) { try { const buf = readFileSync(full); if (!buf.subarray(0, 1024).includes(0)) loc = buf.toString("utf8").split("\n").length; } catch { /* unreadable */ } }
        files.push({ path: rel, size, ...(loc !== undefined ? { loc } : {}) });
      }
    }
  };
  walk(root);
  return files;
}

/** Stable repo identity: git remote URL when available, else the absolute path. */
export function repoIdFor(root: string): string {
  try {
    const cfg = readFileSync(join(root, ".git", "config"), "utf8");
    const m = /\[remote "origin"\]\s*\n\s*url\s*=\s*(\S+)/.exec(cfg);
    if (m) return m[1]!.replace(/\.git$/, "").replace(/^git@([^:]+):/, "$1/").replace(/^https?:\/\//, "");
  } catch { /* not a git repo */ }
  return root;
}
