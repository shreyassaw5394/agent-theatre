import { defineConfig } from "tsup";
export default defineConfig([
  { entry: { cli: "src/cli.ts" }, format: ["esm"], target: "node22", platform: "node", sourcemap: true, clean: true, banner: { js: "#!/usr/bin/env node" } },
  { entry: { index: "src/index.ts" }, format: ["esm"], target: "node22", platform: "node", sourcemap: true, dts: true },
]);
