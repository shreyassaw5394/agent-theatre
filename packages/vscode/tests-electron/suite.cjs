const vscode = require("vscode");
const fs = require("node:fs");
const LOG = "/private/tmp/claude-501/-Users-shreyassawant-ai-agent-browser/2782f23d-86de-44fc-b381-e1f5af206722/scratchpad/vstest-result.log";
const log = (m) => fs.appendFileSync(LOG, m + "\n");
exports.run = async () => {
  fs.writeFileSync(LOG, "");
  try {
    log("suite started; folders=" + JSON.stringify((vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath)));
    const ext = vscode.extensions.getExtension("agenttheatre.agent-theatre-vscode");
    log("extension found=" + !!ext);
    if (!ext) throw new Error("extension not found in the dev host");
    const api = await ext.activate();
    log("activated; api keys=" + Object.keys(api || {}));
    await vscode.commands.executeCommand("agentTheatre.open");
    log("open command returned");
    const t0 = Date.now(); let st = api.__state();
    while (Date.now() - t0 < 30000 && !st.ready) { await new Promise((r) => setTimeout(r, 500)); st = api.__state(); }
    log("STATE " + JSON.stringify(st));
    if (!st.server) throw new Error("server did not start");
    if (!st.panel) throw new Error("webview panel not created");
    if (!(st.scenesSent > 0)) throw new Error("webview never asked for the scene: the bundle did not boot inside the webview");
    if (!st.ready) throw new Error("the renderer never came up inside the webview (CSP? see the webview developer tools)");
    const cwd = vscode.workspace.workspaceFolders[0].uri.fsPath;
    await fetch(st.server + "hook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_id: "vstest", transcript_path: "/x", cwd, permission_mode: "default", hook_event_name: "PostToolUse", tool_name: "Read", tool_use_id: "toolu_vs_1", tool_input: { file_path: cwd + "/README.md" }, tool_response: { type: "text", file: { filePath: cwd + "/README.md", content: "x\n", numLines: 1, startLine: 1, totalLines: 1 } } }) });
    await new Promise((r) => setTimeout(r, 1500)); st = api.__state();
    log("STATE2 " + JSON.stringify(st));
    if (!(st.beatsRelayed > 0)) throw new Error("live beats were not relayed to the webview");
    log("PASS");
  } catch (e) { log("FAIL " + (e && e.stack || e)); throw e; }
};
