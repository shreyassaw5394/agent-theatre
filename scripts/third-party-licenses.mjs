#!/usr/bin/env node
// Writes THIRD_PARTY_LICENSES.txt for the third-party code that is actually inlined into a bundle.
// The list comes from the bundle's source maps (every file the bundler pulled in), so it matches what ships.
// usage: node scripts/third-party-licenses.mjs <out.txt> <dir-or-.map> [<dir-or-.map> ...]
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

const [out, ...inputs] = process.argv.slice(2);
if (!out || !inputs.length) { console.error("usage: third-party-licenses.mjs <out.txt> <dir-or-map>..."); process.exit(2); }

const maps = [];
for (const i of inputs) {
  const p = resolve(i);
  if (!existsSync(p)) { console.error(`missing: ${p}`); process.exit(1); }
  if (statSync(p).isDirectory()) {
    const walk = (d) => { for (const f of readdirSync(d)) { const q = join(d, f); if (statSync(q).isDirectory()) walk(q); else if (f.endsWith(".map")) maps.push(q); } };
    walk(p);
  } else maps.push(p);
}
if (!maps.length) { console.error("no source maps found: build with sourcemap enabled"); process.exit(1); }

// package root = the path up to the last node_modules/<name> (or node_modules/@scope/<name>)
const roots = new Set();
for (const m of maps) {
  const { sources = [], sourceRoot = "" } = JSON.parse(readFileSync(m, "utf8"));
  for (const s of sources) {
    const abs = resolve(dirname(m), sourceRoot, s.replace(/^webpack:\/\/\//, ""));
    const parts = abs.split(sep); const i = parts.lastIndexOf("node_modules");
    if (i < 0) continue;
    const take = parts[i + 1]?.startsWith("@") ? i + 3 : i + 2;
    roots.add(parts.slice(0, take).join(sep));
  }
}

function mitText(holder) {
  return `MIT License\n\nCopyright (c) ${holder}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;
}

const entries = [];
for (const root of roots) {
  const pj = join(root, "package.json"); if (!existsSync(pj)) continue;
  const pkg = JSON.parse(readFileSync(pj, "utf8"));
  if (pkg.name?.startsWith("@agent-theatre/") || pkg.name === "agent-theatre") continue; // our own code, covered by LICENSE
  const lf = readdirSync(root).find((f) => /^(licen[sc]e|copying|notice)(\.|$)/i.test(f));
  const license = typeof pkg.license === "string" ? pkg.license : pkg.license?.type ?? (pkg.licenses?.map((l) => l.type).join(" OR ") || "UNKNOWN");
  const author = typeof pkg.author === "string" ? pkg.author.replace(/\s*[<(].*$/, "") : pkg.author?.name;
  // MIT without a licence file: reproduce the standard MIT text with the package's own copyright holder
  const text = lf ? readFileSync(join(root, lf), "utf8").trim() : license === "MIT" && author ? mitText(author) : null;
  entries.push({ id: `${pkg.name}@${pkg.version}`, license, text, repo: typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url });
}
entries.sort((a, b) => a.id.localeCompare(b.id));
const unknown = entries.filter((e) => e.license === "UNKNOWN" || !e.text);
const body = [
  "Third-party software included in this distribution",
  "",
  "Agent Theatre itself is MIT-licensed (see LICENSE). The bundled files also contain the following",
  "third-party packages, each under its own licence, reproduced below.",
  "",
  ...entries.map((e) => `- ${e.id} (${e.license})`),
  "",
  ...entries.flatMap((e) => ["=".repeat(78), `${e.id} — ${e.license}${e.repo ? ` — ${e.repo}` : ""}`, "=".repeat(78), e.text ?? `Licensed under ${e.license}. No licence file was included in the package.`, ""]),
].join("\n");
writeFileSync(out, body + "\n");
console.log(`${out}: ${entries.length} packages${unknown.length ? `; without licence text: ${unknown.map((e) => e.id).join(", ")}` : ""}`);
