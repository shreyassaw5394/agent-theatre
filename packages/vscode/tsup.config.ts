import { defineConfig } from "tsup";
// One CommonJS file: the extension host loads CJS, and the Marketplace package carries no node_modules.
export default defineConfig({ entry: { extension: "src/extension.ts" }, format: ["cjs"], target: "node20", platform: "node", sourcemap: true, clean: true, external: ["vscode"], noExternal: [/^(?!vscode$)/] });
