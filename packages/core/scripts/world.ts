// Dev-only: generate and print the world for a directory. Not part of the library.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { generateWorld, worldToAscii, isIgnoredPath, type FileNode } from "../src/index.js";

const root = process.argv[2] ?? ".";
const files: FileNode[] = [];
const walk = (dir: string) => {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    const rel = relative(root, full).replace(/\\/g, "/");
    if (isIgnoredPath(rel + (ent.isDirectory() ? "/" : ""))) continue;
    if (ent.isDirectory()) walk(full);
    else if (ent.isFile()) {
      const size = statSync(full).size;
      let loc: number | undefined;
      if (size < 512_000) { try { loc = readFileSync(full, "utf8").split("\n").length; } catch { /* binary */ } }
      files.push({ path: rel, size, ...(loc !== undefined ? { loc } : {}) });
    }
  }
};
walk(root);
const touched = (process.argv[3] ?? "").split(",").filter(Boolean);
const world = generateWorld({ repoId: root, files, touched });
console.log(worldToAscii(world));
console.log(`\n${world.stats.placed}/${world.stats.files} files placed${world.stats.capped ? " (capped)" : ""} · ${world.districts.length} districts · ${world.places.filter((p) => p.kind === "beacon").length} beacons · bounds ${world.bounds.w}×${world.bounds.h}`);
for (const d of world.districts) console.log(`  ${d.label.padEnd(16)} ${d.placeIds.length} places at (${d.cx},${d.cy})`);
