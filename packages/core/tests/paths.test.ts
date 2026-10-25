import { describe, expect, it } from "vitest";
import { isTestPath, relativizePath } from "../src/adapters/paths.js";

describe("relativizePath", () => {
  const ctx = { cwd: "/Users/dev/proj", home: "/Users/dev" };
  it("repo-relative inside cwd", () => expect(relativizePath("/Users/dev/proj/src/a.ts", ctx)).toBe("src/a.ts"));
  it("home-relative outside repo, inside home (never leaks the username)", () =>
    expect(relativizePath("/Users/dev/.claude/settings.json", ctx)).toBe("~/.claude/settings.json"));
  it("basename only for external absolute paths", () => expect(relativizePath("/etc/hosts", ctx)).toBe("//ext/hosts"));
  it("leaves relative paths alone", () => expect(relativizePath("src/a.ts", ctx)).toBe("src/a.ts"));
  it("handles windows separators", () => expect(relativizePath("C:\\x\\proj\\a.ts", { cwd: "C:\\x\\proj" })).toBe("a.ts"));
});

describe("isTestPath", () => {
  it("detects common test layouts", () => {
    for (const p of ["tests/a.ts", "src/__tests__/b.tsx", "src/a.test.ts", "src/a.spec.js", "test_thing.py", "pkg/x_test.go", "spec/y_spec.rb".replace("_spec.rb", ".rb")])
      expect(isTestPath(p), p).toBe(true);
    for (const p of ["src/a.ts", "README.md", "contest.ts"]) expect(isTestPath(p), p).toBe(false);
  });
});
