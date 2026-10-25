import * as vscode from "vscode";
import { existsSync } from "node:fs";
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

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 50);
  status.command = "agentTheatre.open";
  status.text = "$(play) Theatre";
  status.tooltip = "Agent Theatre: open the stage";
  status.show();
  ctx.subscriptions.push(status,
    vscode.commands.registerCommand("agentTheatre.open", () => open(ctx, "live")),
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
}

export async function deactivate(): Promise<void> { await theatre?.close(); theatre = null; }

function workspaceRoot(): string | null {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
}

async function ensureServer(ctx: vscode.ExtensionContext): Promise<Theatre | null> {
  if (theatre) return theatre;
  const cwd = workspaceRoot();
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
  const url = `${t.url}?${query}`;
  if (!panel) {
    panel = vscode.window.createWebviewPanel("agentTheatre", "Agent Theatre", vscode.ViewColumn.Beside, { enableScripts: true, retainContextWhenHidden: true });
    panel.iconPath = vscode.Uri.joinPath(ctx.extensionUri, "media", "icon.png");
    panel.onDidDispose(() => { panel = null; });
  }
  panel.webview.html = html(url, panel.webview.cspSource);
  panel.reveal(vscode.ViewColumn.Beside, true);
}

async function replay(ctx: vscode.ExtensionContext): Promise<void> {
  const cwd = workspaceRoot();
  if (!cwd) return;
  const sessions = listSessions(cwd);
  if (!sessions.length) { void vscode.window.showInformationMessage("No Claude Code sessions found for this folder."); return; }
  const items = sessions.slice(0, 40).map((s) => ({ label: s.title || s.id, description: new Date(s.mtime).toLocaleString(), detail: `${(s.bytes / 1024).toFixed(0)} KB`, id: s.id }));
  const pick = await vscode.window.showQuickPick(items, { placeHolder: "Which session?" });
  if (pick) await open(ctx, { session: pick.id });
}

/** The webview is a frame onto the local server; VS Code forwards 127.0.0.1 ports in remote setups. */
function html(url: string, csp: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://127.0.0.1:* http://localhost:*; style-src 'unsafe-inline' ${csp};">
<style>html,body{margin:0;height:100%;background:#0d1829;overflow:hidden}iframe{border:0;width:100%;height:100%}</style>
</head><body><iframe src="${url}" allow="autoplay" title="Agent Theatre"></iframe></body></html>`;
}
