import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as { contributes: { commands: Array<{ command: string }> }; main: string; engines: { vscode: string } };
const src = readFileSync(fileURLToPath(new URL("../src/extension.ts", import.meta.url)), "utf8");

describe("extension manifest", () => {
  it("every contributed command is registered in the extension source", () => {
    for (const c of pkg.contributes.commands) expect(src, c.command).toContain(`"${c.command}"`);
  });
  it("activates from the bundled CommonJS file and targets a published VS Code engine", () => {
    expect(pkg.main).toBe("./dist/extension.js");
    expect(pkg.engines.vscode).toMatch(/^\^1\.\d+\.0$/);
  });
  it("the webview only frames the loopback server", () => {
    expect(src).toContain("frame-src http://127.0.0.1:* http://localhost:*");
    expect(src).not.toMatch(/https?:\/\/(?!127\.0\.0\.1|localhost)[a-z]/);
  });
});
