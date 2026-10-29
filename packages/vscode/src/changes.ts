import * as vscode from "vscode";
import { watch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import { changesForRepo, currentPr, listSessions, postPrComment, type Theatre } from "agent-theatre";
import { headline, toMarkdown, type ChangeSet, type FileChange } from "@agent-theatre/core";

/**
 * "Agent changes" in the Explorer: the files the agent touched, grouped by folder, with badges on the files themselves
 * and the editor's own diff on click. Data: the running stage when there is one (live, with git), otherwise the newest
 * Claude Code session for this folder, re-read when its transcript changes. Paths and counts only.
 */
type Node = { kind: "dir"; path: string; children: Node[] } | { kind: "file"; file: FileChange } | { kind: "note"; text: string; command?: vscode.Command };

const ICON: Record<string, string> = { created: "diff-added", edited: "diff-modified", deleted: "diff-removed", read: "eye", outside: "person" };
const COLOR: Record<string, string> = { created: "agentTheatre.created", edited: "agentTheatre.edited", deleted: "agentTheatre.deleted", read: "disabledForeground", outside: "agentTheatre.outside" };
const lines = (f: FileChange) => (f.action === "deleted" ? "deleted" : f.action === "read" ? `read ${f.reads}×` : f.action === "created" ? `new · +${f.added}` : `+${f.added} −${f.removed}`);

export class ChangesTree implements vscode.TreeDataProvider<Node>, vscode.FileDecorationProvider {
  private cs: ChangeSet | null = null;
  private source = "";
  private root = "";
  private showReads = false;
  private timer: NodeJS.Timeout | undefined;
  private watcher: FSWatcher | null = null;
  private watching = "";
  private readonly treeEvt = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.treeEvt.event;
  private readonly decoEvt = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this.decoEvt.event;
  /** Set by the extension: the stage it runs, if any. */
  theatre: () => Theatre | null = () => null;
  onSummary: (text: string) => void = () => {};

  constructor(private readonly workspaceRoot: () => string | null) {}

  get changes(): ChangeSet | null { return this.cs; }
  toggleReads(): void { this.showReads = !this.showReads; this.treeEvt.fire(undefined); }

  /** Refresh soon (coalesces bursts of agent activity). */
  poke(ms = 800): void { clearTimeout(this.timer); this.timer = setTimeout(() => void this.refresh(), ms); }

  async refresh(): Promise<void> {
    const cwd = this.workspaceRoot();
    if (!cwd) { this.cs = null; this.treeEvt.fire(undefined); return; }
    this.root = cwd;
    const t = this.theatre();
    try {
      if (t && t.changes().files.length) { this.cs = t.changes(); this.source = "live"; }
      else { const r = await changesForRepo(cwd); this.cs = r.source === "none" ? null : r.cs; this.source = r.source === "session" ? "newest session" : r.source; this.watchTranscript(cwd); }
    } catch { this.cs = null; }
    this.treeEvt.fire(undefined);
    this.decoEvt.fire(undefined);
    this.onSummary(this.cs ? headline(this.cs) : "");
  }

  /** No stage running: follow the newest session's transcript, which Claude Code writes as it works. */
  private watchTranscript(cwd: string): void {
    const s = listSessions(cwd)[0];
    if (!s || s.path === this.watching) return;
    this.watcher?.close();
    this.watching = s.path;
    try { this.watcher = watch(s.path, () => this.poke(1500)); } catch { this.watcher = null; }
  }

  dispose(): void { this.watcher?.close(); clearTimeout(this.timer); }

  // ---- tree ----
  getTreeItem(n: Node): vscode.TreeItem {
    if (n.kind === "note") { const i = new vscode.TreeItem(n.text); if (n.command) i.command = n.command; return i; }
    if (n.kind === "dir") {
      const i = new vscode.TreeItem(n.path.split("/").pop() || n.path, vscode.TreeItemCollapsibleState.Expanded);
      i.iconPath = vscode.ThemeIcon.Folder; i.resourceUri = vscode.Uri.file(join(this.root, n.path)); i.contextValue = "dir"; i.tooltip = n.path;
      return i;
    }
    const f = n.file;
    const kind = f.by === "outside" ? "outside" : f.action;
    const i = new vscode.TreeItem(f.path.split("/").pop() || f.path);
    i.description = lines(f) + (f.by === "outside" ? " · not by the agent" : "") + (f.agents.some((a) => a !== "main") ? " · helper" : "");
    i.iconPath = new vscode.ThemeIcon(ICON[kind]!, new vscode.ThemeColor(COLOR[kind]!));
    i.resourceUri = vscode.Uri.file(join(this.root, f.path));
    i.tooltip = new vscode.MarkdownString(`**${f.path}**\n\n${f.by === "outside" ? "Changed during the session, not by the agent" : `The agent ${f.action === "read" ? "read it" : f.action === "created" ? "created it" : f.action === "deleted" ? "deleted it" : "edited it"}`} · ${lines(f)}${f.inferred ? "\n\nSeen in a shell command." : ""}`);
    i.contextValue = f.action === "deleted" ? "file-deleted" : "file";
    i.command = { command: "agentTheatre.openChange", title: "Open diff", arguments: [f.path] };
    return i;
  }

  getChildren(n?: Node): Node[] {
    if (n?.kind === "dir") return n.children;
    if (n) return [];
    const cs = this.cs;
    if (!cs) return [{ kind: "note", text: "No Claude Code session for this folder yet." }];
    const files = cs.files.filter((f) => this.showReads || f.action !== "read");
    const head: Node[] = [{ kind: "note", text: `${headline(cs) || "No files changed yet"}${this.source ? ` · ${this.source}` : ""}` }];
    if (cs.totals.read && !this.showReads) head.push({ kind: "note", text: `${cs.totals.read} only read — show them`, command: { command: "agentTheatre.toggleReads", title: "Show reads" } });
    return [...head, ...tree(files)];
  }

  // ---- badges on the files themselves ----
  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (!this.cs || !this.root || !uri.fsPath.startsWith(this.root)) return undefined;
    const rel = uri.fsPath.slice(this.root.length + 1).split("\\").join("/");
    const f = this.cs.files.find((x) => x.path === rel);
    if (!f || f.action === "read" || f.by === "outside") return undefined;
    return { badge: "●", tooltip: `Agent: ${f.action} · ${lines(f)}`, color: new vscode.ThemeColor(COLOR[f.action]!), propagate: false };
  }
}

/** Files → folder tree (single-child folder chains collapsed: src/api rather than src > api). */
function tree(files: FileChange[]): Node[] {
  type Dir = { kind: "dir"; path: string; children: Node[]; dirs: Map<string, Dir> };
  const root: Dir = { kind: "dir", path: "", children: [], dirs: new Map() };
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const parts = f.path.split("/"); let d = root;
    for (const p of parts.slice(0, -1)) { let c = d.dirs.get(p); if (!c) { c = { kind: "dir", path: d.path ? `${d.path}/${p}` : p, children: [], dirs: new Map() }; d.dirs.set(p, c); d.children.push(c); } d = c; }
    d.children.push({ kind: "file", file: f });
  }
  const squash = (n: Node): Node => {
    if (n.kind !== "dir") return n;
    let cur = n as Dir;
    while (cur.children.length === 1 && cur.children[0]!.kind === "dir") cur = cur.children[0] as Dir;
    return { kind: "dir", path: cur.path, children: cur.children.map(squash) };
  };
  return root.children.map(squash).map((n) => (n.kind === "dir" ? { ...n } : n));
}

/** The editor's own diff: HEAD on the left (via the built-in git extension), the file now on the right. */
export async function openChange(root: string, path: string, cs: ChangeSet | null): Promise<void> {
  const f = cs?.files.find((x) => x.path === path);
  const uri = vscode.Uri.file(join(root, path));
  const gitApi = (vscode.extensions.getExtension("vscode.git")?.exports as { getAPI?: (v: 1) => { toGitUri(u: vscode.Uri, ref: string): vscode.Uri } } | undefined)?.getAPI?.(1);
  if (f?.action === "created" || !gitApi) { await vscode.commands.executeCommand("vscode.open", uri); return; }
  const head = gitApi.toGitUri(uri, "HEAD");
  if (f?.action === "deleted") { await vscode.commands.executeCommand("vscode.open", head); return; }
  await vscode.commands.executeCommand("vscode.diff", head, uri, `${path} (last commit ↔ now)`);
}

/** Post the map on this branch's pull request, after the person confirms. */
export async function postToPr(root: string, cs: ChangeSet | null): Promise<void> {
  if (!cs || !cs.totals.changed) { void vscode.window.showInformationMessage("Agent Theatre: the agent hasn't changed any files yet."); return; }
  const pr = currentPr(root);
  if ("error" in pr) { void vscode.window.showWarningMessage(`Agent Theatre: ${pr.error}`); return; }
  const go = await vscode.window.showInformationMessage(`Post "${headline(cs)}" on pull request #${pr.number}? It lists file paths and line counts only.`, { modal: true }, "Post", "Copy instead");
  if (go === "Copy instead") { await vscode.env.clipboard.writeText(toMarkdown(cs, { marker: false })); void vscode.window.showInformationMessage("Copied as Markdown."); return; }
  if (go !== "Post") return;
  const r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Posting to PR #${pr.number}…` }, async () => postPrComment(root, pr.number, cs));
  if ("error" in r) { void vscode.window.showErrorMessage(`Agent Theatre: ${r.error}`); return; }
  const open = await vscode.window.showInformationMessage(`${r.updated ? "Updated" : "Posted"} the change map on PR #${pr.number}.`, "Open");
  if (open) void vscode.env.openExternal(vscode.Uri.parse(r.url));
}
