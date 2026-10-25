import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A VS Code webview has no Node. Nothing in web/src may import one.
const FORBIDDEN = /from\s+["'](node:[^"']+|fs|path|os|child_process|ws|crypto|http|net|process|url)["']|require\(/;
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

describe("web has no Node imports", () => {
  it("every file under src is browser-only", () => {
    const src = new URL("../src", import.meta.url).pathname;
    const offenders = walk(src).filter((f) => /\.(ts|js)$/.test(f) && FORBIDDEN.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
