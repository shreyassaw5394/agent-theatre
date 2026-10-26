import * as vscode from "vscode";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Theatre, hooksStatus, installHooks, listSessions, repoIdFor, scanRepo, uninstallHooks } from "agent-theatre";

/**
 * The extension runs the same local server the CLI runs (same hooks, same
 * transcripts, same web bundle) and shows it in a webview. Nothing here is
 * VS Code-specific except the panel and the commands; the stage is the stage.
 */
let theatre: Theatre | null = null;
let panel: vscode.WebviewPanel | null = null;
let status: vscode.StatusBarItem;
/** What the webview last asked for; lets an integration test prove the bundle booted inside the webview. */
const probe = { lastWebviewMessage: "", scenesSent: 0, beatsRelayed: 0, ready: false };

export async function activate(ctx: vscode.ExtensionContext): Promise<{ __state: () => Record<string, unknown> }> {
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  status.command = "agentTheatre.open";
  status.text = "$(play) Theatre";
  status.tooltip = "Agent Theatre: open the stage";
  status.show();
  ctx.subscriptions.push(status,
    vscode.commands.registerCommand("agentTheatre.open", () => open(ctx, "live")),
    vscode.commands.registerCommand("agentTheatre.switchFolder", async () => { await theatre?.close(); theatre = null; panel?.dispose(); panel = null; await open(ctx, "live"); }),
    vscode.commands.registerCommand("agentTheatre.replay", () => replay(ctx)),
    vscode.commands.registerCommand("agentTheatre.openInBrowser", async () => { const t = await ensureServer(ctx); if (t) void vscode.env.openExternal(vscode.Uri.parse(`${t.url}?live=1`)); }),
    vscode.commands.registerCommand("agentTheatre.installHooks", () => {
      const r = installHooks();
      void vscode.window.showInformationMessage(r.changed ? `Agent Theatre hooks installed${r.backup ? ` (backup: ${r.backup})` : ""}. Claude Code picks them up without a restart.` : "Agent Theatre hooks were already installed.");
    }),
    vscode.commands.registerCommand("agentTheatre.uninstallHooks", () => {
      const r = uninstallHooks();
      void vscode.window.showInformationMessage(r.changed ? "Agent Theatre hooks removed." : "No Agent Theatre hooks were installed.");
    }),
  );
  if (vscode.workspace.getConfiguration("agentTheatre").get<boolean>("openOnStartup")) void open(ctx, "live");
  return { __state: () => ({ ...probe, server: theatre?.url ?? null, panel: !!panel }) };
}

export async function deactivate(): Promise<void> { await theatre?.close(); theatre = null; }

async function workspaceRoot(): Promise<string | null> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (!folders.length) return null;
  if (folders.length === 1) return folders[0]!.uri.fsPath;
  // several folders: prefer the one holding the active file, otherwise ask
  const active = vscode.window.activeTextEditor?.document.uri;
  const own = active && vscode.workspace.getWorkspaceFolder(active);
  if (own) return own.uri.fsPath;
  const pick = await vscode.window.showQuickPick(folders.map((f) => ({ label: f.name, description: f.uri.fsPath, path: f.uri.fsPath })), { placeHolder: "Which folder is the stage for?" });
  return pick?.path ?? null;
}

async function ensureServer(ctx: vscode.ExtensionContext): Promise<Theatre | null> {
  if (theatre) return theatre;
  const cwd = await workspaceRoot();
  if (!cwd) { void vscode.window.showWarningMessage("Agent Theatre needs an open folder."); return null; }
  const webDir = [join(ctx.extensionPath, "web"), join(ctx.extensionPath, "..", "web", "dist")].find((d) => existsSync(join(d, "index.html")));
  const files = scanRepo(cwd);
  theatre = new Theatre({ cwd, repoId: repoIdFor(cwd), files, ...(webDir ? { webDir } : {}) });
  await theatre.listen(0);
  ctx.subscriptions.push({ dispose: () => { void theatre?.close(); theatre = null; } });
  if (!hooksStatus().installed) {
    void vscode.window.showInformationMessage("Agent Theatre: Claude Code hooks are not installed, so the live stage will stay empty.", "Install hooks").then((pick) => { if (pick) void vscode.commands.executeCommand("agentTheatre.installHooks"); });
  }
  return theatre;
}

async function open(ctx: vscode.ExtensionContext, mode: "live" | { session: string }): Promise<void> {
  const t = await ensureServer(ctx);
  if (!t) return;
  const set = vscode.workspace.getConfiguration("agentTheatre").get<string>("set") || "";
  const query = (mode === "live" ? "live=1" : `session=${encodeURIComponent(mode.session)}`) + (set ? `&set=${encodeURIComponent(set)}` : "");
  if (!panel) {
    panel = vscode.window.createWebviewPanel("agentTheatre", `Agent Theatre — ${t.name}`, vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
    panel.iconPath = vscode.Uri.joinPath(ctx.extensionUri, "media", "icon.png");
    panel.onDidDispose(() => { panel = null; });
    // the page asks to bring Claude Code forward when the agent is waiting on the person
    const relay = (msg: unknown) => { probe.beatsRelayed++; void panel?.webview.postMessage(msg); };
    t.listeners.add(relay);
    panel.onDidDispose(() => t.listeners.delete(relay));
    // the webview never talks to the network itself: everything goes through here
    panel.webview.onDidReceiveMessage(async (m: { type?: string; id?: string; text?: string }) => {
      probe.lastWebviewMessage = m?.type ?? "";
      if (m?.type === "ready") { probe.ready = true; return; }
      if (m?.type === "scene") { probe.scenesSent++; void panel?.webview.postMessage({ type: "scene", payload: t.scene() }); return; }
      if (m?.type === "replay" && m.id) {
        try { const r = await fetch(`${t.url}api/replay/${encodeURIComponent(m.id)}`); void panel?.webview.postMessage({ type: "scene", payload: await r.json() }); }
        catch (e) { void vscode.window.showErrorMessage(`Agent Theatre: could not load the session (${String(e)})`); }
        return;
      }
      if (m?.type === "prompt" && m.text) {
        try { const r = await fetch(`${t.url}api/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: m.text }) }); const j = await r.json() as { ok?: boolean; error?: string }; if (!j.ok) void vscode.window.showWarningMessage(`Agent Theatre: ${j.error ?? "could not send the prompt"}`); }
        catch (e) { void vscode.window.showErrorMessage(`Agent Theatre: ${String(e)}`); }
        return;
      }
      if (m?.type !== "focus-agent") return;
      for (const cmd of ["claude-vscode.focus", "claude-vscode.editor.openLast", "workbench.action.terminal.focus"]) {
        try { await vscode.commands.executeCommand(cmd); return; } catch { /* next */ }
      }
    });
  }
  panel.webview.html = html(ctx, panel.webview, `?${query}`);
  panel.reveal(vscode.ViewColumn.Beside, true);
}

async function replay(ctx: vscode.ExtensionContext): Promise<void> {
  const cwd = await workspaceRoot();
  if (!cwd) return;
  const sessions = listSessions(cwd);
  if (!sessions.length) { void vscode.window.showInformationMessage("No Claude Code sessions found for this folder."); return; }
  const items = sessions.slice(0, 40).map((s) => ({ label: s.title || s.id, description: new Date(s.mtime).toLocaleString(), detail: `${(s.bytes / 1024).toFixed(0)} KB`, id: s.id }));
  const pick = await vscode.window.showQuickPick(items, { placeHolder: "Which session?" });
  if (pick) await open(ctx, { session: pick.id });
}

/**
 * The web app runs inside the webview itself (its bundle is shipped with the extension, built with a relative
 * base); only the API and the WebSocket go to the local server. Framing http://127.0.0.1 inside a webview
 * rendered blank, so nothing is framed.
 */
function html(ctx: vscode.ExtensionContext, webview: vscode.Webview, query: string): string {
  const root = vscode.Uri.joinPath(ctx.extensionUri, "web");
  const webRoot = webview.asWebviewUri(root).toString();
  let page = readFileSync(vscode.Uri.joinPath(root, "index.html").fsPath, "utf8");
  page = page.replace(/(src|href)="\.\//g, `$1="${webRoot}/`);
  const csp = `default-src 'none'; img-src ${webview.cspSource} data: blob:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src ${webview.cspSource} 'unsafe-inline'; connect-src http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:*; worker-src blob:; media-src blob:;`;
  page = page.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${csp}"><script>window.__AT_QUERY=${JSON.stringify(query)};</script>`);
  return page;
}
