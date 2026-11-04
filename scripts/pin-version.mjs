// Points every agent-run install snippet at this release: `agent-theatre@<version>` in the plugin, the /theatre command,
// the skill, READMEs and the site, and the Cursor / VS Code one-click MCP links. Run after bumping the version;
// packages/cli/tests/pins.test.ts fails while any pin is behind.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
export const PINNED_FILES = [".claude-plugin/plugin.json", "commands/theatre.md", "skills/agent-theatre/SKILL.md", "README.md", "packages/cli/README.md", "packages/vscode/README.md", "site/index.html"];
const version = JSON.parse(readFileSync(root + "packages/cli/package.json", "utf8")).version;
const pin = `agent-theatre@${version}`;
const config = { command: "npx", args: ["-y", pin, "serve"] };
const cursor = Buffer.from(JSON.stringify(config)).toString("base64");
const vscode = encodeURIComponent(JSON.stringify({ name: "agent-theatre", ...config }));

for (const f of PINNED_FILES) {
  const before = readFileSync(root + f, "utf8");
  const after = before
    .replace(/agent-theatre@(?:latest|\d+\.\d+\.\d+)/g, pin)
    .replace(/(install-mcp\?name=agent-theatre&(?:amp;)?config=)[A-Za-z0-9+/=]+/g, `$1${cursor}`)
    .replace(/(mcp\/install\?name=agent-theatre&(?:amp;)?config=)[^)"'\s]+/g, `$1${vscode}`);
  if (after !== before) { writeFileSync(root + f, after); console.log(`pinned ${f} → ${pin}`); }
}
