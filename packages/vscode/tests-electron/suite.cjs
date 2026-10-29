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
    // ---- Agent changes: an edit through the hook shows in the tree, badges the file, opens a diff, copies as Markdown ----
    const target = cwd + "/src/api/login.ts";
    if (fs.existsSync(target)) {
      fs.appendFileSync(target, "// edited by the agent in the vscode test\n");
      await fetch(st.server + "hook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session_id: "vstest", transcript_path: "/x", cwd, hook_event_name: "PostToolUse", tool_name: "Edit", tool_use_id: "toolu_vs_2", tool_input: { file_path: target, old_string: "a", new_string: "b" }, tool_response: { structuredPatch: [{ lines: ["+// edited by the agent in the vscode test"] }] } }) });
      await new Promise((r) => setTimeout(r, 2500));
      await vscode.commands.executeCommand("agentTheatre.refreshChanges");
      st = api.__state();
      log("CHANGES " + JSON.stringify(st.changes));
      if (!st.changes || !st.changes.files.includes("src/api/login.ts:edited:agent")) throw new Error("the edit did not reach the Agent changes tree");
      const deco = st.deco(target);
      log("DECO " + JSON.stringify(deco));
      if (!deco || deco.badge !== "●") throw new Error("no badge on the edited file");
      await vscode.commands.executeCommand("agentTheatre.openChange", "src/api/login.ts");
      await new Promise((r) => setTimeout(r, 1500));
      const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
      log("TAB " + (tab && tab.label) + " diff=" + !!(tab && tab.input && tab.input.modified));
      if (!tab || !tab.input || !tab.input.modified) throw new Error("clicking a change did not open a diff editor");
      await vscode.commands.executeCommand("agentTheatre.copyChanges");
      const md = await vscode.env.clipboard.readText();
      log("MD " + md.split("\n").slice(0, 6).join(" | "));
      if (!md.includes("`src/api/login.ts`")) throw new Error("copy as Markdown did not include the file");
      // the stage's Changes view asks the host for the map: open it and wait for an answered request
      await vscode.commands.executeCommand("agentTheatre.openChangesMap");
      const t1 = Date.now(); st = api.__state();
      while (Date.now() - t1 < 20000 && !(st.changesAnswered > 0)) { await new Promise((r) => setTimeout(r, 500)); st = api.__state(); }
      log("MAP answered=" + st.changesAnswered);
      if (!(st.changesAnswered > 0)) throw new Error("the Changes view inside the webview never got its map");
    } else log("no src/api/login.ts in this workspace: change-map checks skipped");
    log("PASS");
  } catch (e) { log("FAIL " + (e && e.stack || e)); throw e; }
};
