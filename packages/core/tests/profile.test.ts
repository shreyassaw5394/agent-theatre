import { describe, expect, it } from "vitest";
import { profileRepo } from "../src/world/profile.js";
import { generateWorld } from "../src/world/generate.js";
import { filesFromEvents } from "../src/world/from-events.js";
import { parseTranscript } from "../src/adapters/transcript.js";
import { readFixture } from "./_fixtures.js";

const f = (...p: string[]) => p.map((path) => ({ path, loc: 50 }));
describe("profileRepo", () => {
  it("web frontend from deps and tsx", () => {
    const r = profileRepo(f("src/App.tsx", "src/Button.tsx", "src/Nav.tsx", "src/x.tsx", "index.html"), { "package.json": '{"dependencies":{"react":"18","vite":"5"}}' });
    expect(r.kinds[0]).toBe("web-frontend"); expect(r.languages[0]).toBe("TypeScript");
  });
  it("backend from routes + sql + deps", () => {
    expect(profileRepo(f("src/routes/users.ts", "db/schema.sql", "src/server.ts"), { "package.json": '{"dependencies":{"hono":"4"}}' }).kinds[0]).toBe("backend-api");
  });
  it("cli from bin; data-ml from notebooks; infra from terraform; mobile from swift; game from godot", () => {
    expect(profileRepo(f("src/cli.ts"), { "package.json": '{"bin":{"x":"dist/cli.js"},"dependencies":{"commander":"12"}}' }).kinds[0]).toBe("cli-tool");
    expect(profileRepo(f("notebooks/eda.ipynb", "train.py"), { "requirements.txt": "torch\npandas" }).kinds[0]).toBe("data-ml");
    expect(profileRepo(f("infra/main.tf", "infra/vars.tf")).kinds[0]).toBe("infra-devops");
    expect(profileRepo(f("ios/App.swift", "ios/View.swift")).kinds[0]).toBe("mobile");
    expect(profileRepo(f("scenes/main.tscn", "scripts/player.gd")).kinds[0]).toBe("game");
  });
  it("docs-heavy repo; monorepo; unknown", () => {
    expect(profileRepo(f("docs/a.md", "docs/b.md", "docs/c.md", "README.md", "mkdocs.yml")).kinds[0]).toBe("docs-content");
    expect(profileRepo(f("pnpm-workspace.yaml", "packages/a/package.json", "packages/b/package.json")).kinds).toContain("monorepo");
    expect(profileRepo([]).kinds).toEqual(["unknown"]);
  });
});
describe("touched cap + overflow", () => {
  it("a session that touched 1,500 files still yields a readable world, with overflow buildings per district", () => {
    const touched = Array.from({ length: 1500 }, (_, i) => `src/m${i % 7}/f${i}.ts`);
    const files = touched.map((path, i) => ({ path, loc: 10 + (i % 90) }));
    const w = generateWorld({ repoId: "big", files, touched });
    expect(w.places.filter((p) => p.kind === "building").length).toBeLessThanOrEqual(60);
    expect(w.places.filter((p) => p.kind === "overflow").length).toBeGreaterThan(0);
    expect(w.bounds.w).toBeLessThanOrEqual(96);
    expect(w.profile.languages[0]).toBe("TypeScript");
  });
  it("filesFromEvents orders touched by activity so the cap keeps the busiest files", () => {
    const { events } = parseTranscript(readFixture("episode-1.jsonl"));
    const { touched } = filesFromEvents(events);
    expect(touched[0]).toBe("src/api/login.ts");
  });
});
