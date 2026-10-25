// Integration test in the real VS Code: open the stage for a folder and confirm the webview booted and got a scene.
import { runTests } from "@vscode/test-electron";
import { fileURLToPath } from "node:url";
const here = fileURLToPath(new URL("./", import.meta.url));
const [workspace = "/Users/shreyassawant/ai-agent-browser"] = process.argv.slice(2);
try {
  await runTests({
    vscodeExecutablePath: "/Applications/Visual Studio Code.app/Contents/MacOS/Code",
    extensionDevelopmentPath: fileURLToPath(new URL("../", import.meta.url)),
    extensionTestsPath: here + "suite.cjs",
    launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust", "--new-window"],
  });
  console.log("VSCODE TEST: PASS");
} catch (e) { console.error("VSCODE TEST: FAIL", e?.message ?? e); process.exit(1); }
