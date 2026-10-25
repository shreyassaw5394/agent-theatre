import { defineConfig, type Plugin } from "vite";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const fixtures = fileURLToPath(new URL("../../fixtures", import.meta.url));

/** Serves the synthetic demo sessions at /demo/* in dev and copies them into the build. */
function demoFixtures(): Plugin {
  return {
    name: "agent-theatre-demo-fixtures",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/demo\/([\w.-]+)$/.exec(req.url?.split("?")[0] ?? "");
        if (!m) return next();
        const file = join(fixtures, m[1]!);
        if (!existsSync(file)) { res.statusCode = 404; return res.end("not found"); }
        res.setHeader("Content-Type", file.endsWith(".json") ? "application/json" : "application/x-ndjson");
        res.end(readFileSync(file));
      });
    },
    closeBundle() {
      const out = fileURLToPath(new URL("./dist/demo", import.meta.url));
      mkdirSync(out, { recursive: true });
      for (const f of readdirSync(fixtures)) if (/\.(jsonl|json)$/.test(f) && !f.startsWith("secrets")) copyFileSync(join(fixtures, f), join(out, f));
    },
  };
}

export default defineConfig({
  plugins: [demoFixtures()],
  server: { port: 5173, strictPort: true, host: "127.0.0.1" },
  build: { target: "es2022", sourcemap: true },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
