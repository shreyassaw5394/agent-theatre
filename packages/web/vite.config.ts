import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

// Fixtures are served at / so the demo can fetch /episode-1.jsonl without copying files.
export default defineConfig({
  publicDir: fileURLToPath(new URL("../../fixtures", import.meta.url)),
  server: { port: 5173, strictPort: true, host: "127.0.0.1" },
  build: { target: "es2022", sourcemap: true },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
