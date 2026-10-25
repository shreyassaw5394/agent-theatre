import type { FileNode } from "./types.js";

/** What kind of project this is, from the file tree alone. Several can apply; ordered by confidence. */
export type ProjectKind =
  | "web-frontend" | "backend-api" | "cli-tool" | "library" | "data-ml" | "mobile" | "game"
  | "infra-devops" | "docs-content" | "monorepo" | "systems" | "unknown";

export interface RepoProfile {
  kinds: ProjectKind[];
  /** Top languages by file count, most common first. */
  languages: string[];
  files: number;
}

const EXT_LANG: Record<string, string> = { ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", py: "Python", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", swift: "Swift", rb: "Ruby", php: "PHP", cs: "C#", cpp: "C++", cc: "C++", c: "C", h: "C", m: "Objective-C", scala: "Scala", ex: "Elixir", exs: "Elixir", dart: "Dart", lua: "Lua", zig: "Zig", sh: "Shell", sql: "SQL", md: "Markdown", mdx: "Markdown", html: "HTML", css: "CSS", scss: "CSS", vue: "Vue", svelte: "Svelte", tf: "Terraform", yaml: "YAML", yml: "YAML", ipynb: "Notebook" };

export function profileRepo(files: FileNode[], manifests: Record<string, string> = {}): RepoProfile {
  const paths = files.map((f) => f.path.toLowerCase());
  const has = (re: RegExp) => paths.some((p) => re.test(p));
  const count = (re: RegExp) => paths.filter((p) => re.test(p)).length;
  const langCount = new Map<string, number>();
  for (const p of paths) { const ext = p.slice(p.lastIndexOf(".") + 1); const l = EXT_LANG[ext]; if (l && !/^(markdown|yaml|html|css|shell|sql)$/i.test(l)) langCount.set(l, (langCount.get(l) ?? 0) + 1); }
  const languages = [...langCount.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l).slice(0, 4);
  const pkg = (manifests["package.json"] ?? "").toLowerCase();
  const py = ((manifests["pyproject.toml"] ?? "") + (manifests["requirements.txt"] ?? "")).toLowerCase();
  const dep = (re: RegExp) => re.test(pkg) || re.test(py);

  const scores = new Map<ProjectKind, number>();
  const add = (k: ProjectKind, n: number) => scores.set(k, (scores.get(k) ?? 0) + n);
  if (dep(/"(react|react-dom|next|vue|nuxt|svelte|@sveltejs\/kit|@angular\/core|solid-js|astro|remix|vite)"/)) add("web-frontend", 3);
  if (count(/\.(tsx|jsx|vue|svelte)$/) > 3) add("web-frontend", 2);
  if (has(/(^|\/)(index|app)\.html$/) || count(/\.(css|scss)$/) > 3) add("web-frontend", 1);
  if (dep(/"(express|fastify|hono|koa|@nestjs\/core|apollo-server|prisma|drizzle-orm|django|flask|fastapi|sqlalchemy|gin|fiber|actix|axum|rails|spring)"/)) add("backend-api", 3);
  if (has(/(^|\/)(routes?|controllers?|api|handlers?|migrations?)\//) || has(/\.(sql|prisma)$/)) add("backend-api", 2);
  if (pkg.includes('"bin"') || has(/(^|\/)(cli|cmd|bin)\//) || dep(/"(commander|yargs|clap|cobra|click|typer)"/)) add("cli-tool", 3);
  if (dep(/"(torch|tensorflow|jax|pandas|numpy|scikit-learn|sklearn|transformers|xgboost|lightgbm|polars)"/) || count(/\.ipynb$/) > 0 || has(/(^|\/)(notebooks?|models?|datasets?|training)\//)) add("data-ml", 3);
  if (has(/\.(swift|kt)$/) || has(/(^|\/)(ios|android)\//) || has(/package\.swift$/) || has(/build\.gradle(\.kts)?$/) || dep(/"(react-native|expo|flutter)"/) || has(/\.dart$/)) add("mobile", 3);
  if (has(/\.(unity|unitypackage|godot|tscn|gd)$/) || has(/(^|\/)assets\/.*\.(prefab|fbx)$/) || dep(/"(phaser|pixi\.js|three|babylonjs|@react-three\/fiber|excalibur|kaplay|bevy|godot)"/)) add("game", 3);
  if (has(/\.tf$/) || has(/(^|\/)(dockerfile|docker-compose\.ya?ml|helm|k8s|kubernetes|\.github\/workflows|ansible|pulumi)/) ) add("infra-devops", has(/\.tf$/) || has(/(^|\/)(helm|k8s|kubernetes|ansible|pulumi)\//) ? 3 : 1);
  const mdShare = count(/\.(md|mdx|rst)$/) / Math.max(1, paths.length);
  if (mdShare > 0.4 || has(/(^|\/)(mkdocs|docusaurus)\.config|(^|\/)docs\/.*\.mdx?$/) && mdShare > 0.25) add("docs-content", 3);
  if (has(/(^|\/)pnpm-workspace\.ya?ml$/) || has(/(^|\/)packages\/[^/]+\/package\.json$/) || has(/(^|\/)(lerna|nx|turbo)\.json$/) || has(/(^|\/)cargo\.toml$/) && count(/(^|\/)crates\/[^/]+\//) > 0) add("monorepo", 2);
  if (count(/\.(rs|go|c|cpp|cc|h|zig)$/) > 5 && !scores.has("web-frontend")) add("systems", 2);
  if (pkg.includes('"main"') && !pkg.includes('"bin"') && !scores.has("web-frontend") && !scores.has("backend-api")) add("library", 2);
  if (has(/(^|\/)(lib|src\/lib)\//) && !scores.has("web-frontend")) add("library", 1);

  const kinds = [...scores.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return { kinds: kinds.length ? kinds : ["unknown"], languages, files: files.length };
}
