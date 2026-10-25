/**
 * Path redaction. Repo-relative when inside the repo; home-relative (~/…)
 * when inside the home directory (so a username never leaves the machine);
 * otherwise only the basename, prefixed so it is recognisably external.
 */
export interface PathContext {
  cwd: string;
  home?: string;
}

function norm(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function relativizePath(abs: string, ctx: PathContext): string {
  const p = norm(abs);
  const cwd = norm(ctx.cwd);
  if (cwd && (p === cwd || p.startsWith(cwd + "/"))) return p.slice(cwd.length + 1) || ".";
  if (ctx.home) {
    const home = norm(ctx.home);
    if (home && (p === home || p.startsWith(home + "/"))) return "~/" + p.slice(home.length + 1);
  }
  if (!p.startsWith("/")) return p; // already relative
  const base = p.slice(p.lastIndexOf("/") + 1);
  return `//ext/${base}`;
}

export function basename(p: string): string {
  const n = norm(p);
  return n.slice(n.lastIndexOf("/") + 1);
}

export function isTestPath(p: string): boolean {
  return /(^|\/)(tests?|__tests__|spec|specs)\//i.test(p) || /\.(test|spec)\.[cm]?[jt]sx?$/i.test(p) || /(^|\/)test_[^/]+\.py$/i.test(p) || /_test\.(go|rs|py)$/i.test(p);
}
