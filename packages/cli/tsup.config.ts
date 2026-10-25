import { defineConfig } from "tsup";
// core is bundled in: the published package must be self-contained (@agent-theatre/core is a workspace package, not on npm).
const shared = { format: ["esm"] as const, target: "node22" as const, platform: "node" as const, sourcemap: true, noExternal: ["@agent-theatre/core"] };
export default defineConfig([
  { ...shared, entry: { cli: "src/cli.ts" }, clean: true, banner: { js: "#!/usr/bin/env node" } },
  { ...shared, entry: { index: "src/index.ts" }, dts: { resolve: ["@agent-theatre/core"] } },
]);
