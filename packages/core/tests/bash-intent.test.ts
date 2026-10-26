import { describe, expect, it } from "vitest";
import { argv0Of, classifyBash, extractReads, extractWrites } from "../src/adapters/bash-intent.js";

describe("argv0Of", () => {
  it("skips env assignments and cd", () => {
    expect(argv0Of("FOO=1 BAR=2 npm test")).toBe("npm");
    expect(argv0Of("cd /x/y && pnpm build")).toBe("pnpm");
    expect(argv0Of("/usr/local/bin/node -e 1")).toBe("node");
    expect(argv0Of("")).toBe("sh");
    expect(argv0Of("(node packages/cli/dist/cli.js --no-open &)")).toBe("node");
    expect(argv0Of("{ cat a; } > b")).toBe("cat");
  });
});

describe("extractWrites", () => {
  it("finds redirect, append, tee, sed -i, cp/mv dest, heredoc target", () => {
    expect(extractWrites("echo hi > out.txt")).toEqual(["out.txt"]);
    expect(extractWrites("cat >> src/a.ts <<'EOF'\nx\nEOF")).toEqual(["src/a.ts"]);
    expect(extractWrites("cmd 2>&1 | tee -a log.txt")).toEqual(["log.txt"]);
    expect(extractWrites("sed -i '' 's/a/b/' src/x.ts")).toEqual(["src/x.ts"]);
    expect(extractWrites("sed -i.bak -e 's/a/b/' lib/y.py")).toEqual(["lib/y.py"]);
    expect(extractWrites("cp -r a/b dest/c")).toEqual(["dest/c"]);
    expect(extractWrites("mv old.ts new.ts")).toEqual(["new.ts"]);
    expect(extractWrites("touch a.md b.md")).toEqual(["a.md", "b.md"]);
  });
  it("ignores /dev/null, fd dups and variables", () => {
    expect(extractWrites("cmd > /dev/null 2>&1")).toEqual([]);
    expect(extractWrites("echo $X > $OUT")).toEqual([]);
    expect(extractWrites("cmd 2>&1")).toEqual([]);
  });
});

describe("extractReads", () => {
  it("finds cat/head/tail targets, not numbers", () => {
    expect(extractReads("cat src/a.ts | head -5")).toEqual(["src/a.ts"]);
    expect(extractReads("head -n 20 README.md")).toEqual(["README.md"]);
    expect(extractReads("tail -20 log.txt")).toEqual(["log.txt"]);
  });
});

describe("classifyBash", () => {
  const i = (c: string) => classifyBash(c).intent;
  it("classifies intents", () => {
    expect(i("npm test")).toBe("test");
    expect(i("npx vitest run --reporter=dot")).toBe("test");
    expect(i("cd x && pnpm test 2>&1 | tail -20")).toBe("test");
    expect(i("go test ./...")).toBe("test");
    expect(i("cargo test")).toBe("test");
    expect(i("pnpm build")).toBe("build");
    expect(i("tsc -p .")).toBe("build");
    expect(i("pnpm add zod")).toBe("install");
    expect(i("pip install -r req.txt")).toBe("install");
    expect(i("git add -A && git commit -m x")).toBe("git");
    expect(i("gh pr create")).toBe("git");
    expect(i("cat > a.ts <<'EOF'\nx\nEOF")).toBe("write_file");
    expect(i("rg TODO src")).toBe("search");
    expect(i("grep -rn foo .")).toBe("search");
    expect(i("cat src/a.ts")).toBe("read_file");
    expect(i("ls -la")).toBe("other");
  });
  it("test intent wins over writes (redirected test output)", () => {
    expect(i("npm test > results.txt")).toBe("test");
  });
});

import { argv0Of as a0 } from "../src/adapters/bash-intent.js";
describe("argv0 skips shell tests", () => {
  it("[ -n \"$x\" ] && cmd → cmd", () => { expect(a0('[ -n "$B" ] && lsof -nP -p 1')).toBe("lsof"); expect(a0("test -f x && git status")).toBe("git"); expect(a0("! grep -q foo bar")).toBe("grep"); });
});
