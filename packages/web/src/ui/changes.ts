import { changesFromEvents, headline, toMarkdown, type AgentEvent, type ChangeSet, type FileChange } from "@agent-theatre/core";

/**
 * The Changes view: what the agent touched, as a map. Folders are blocks, files are tiles sized by lines changed and
 * coloured by what happened (new, edited, deleted, read, changed outside the agent). A time slider and an agent
 * filter narrow it; clicking a file opens its diff (in VS Code: in the editor). Paths and counts only, except the diff,
 * which is loaded from this machine on request and never leaves it.
 */
export interface ChangesSource {
  load(q: { until?: number; agent?: string }): Promise<(ChangeSet & { git?: boolean }) | null>;
  /** The diff text, "opened" when the host showed it itself (VS Code), or an explanation when there is none. */
  diff(path: string): Promise<{ diff: string; truncated: boolean } | "opened" | string>;
}

/** Over the CLI's HTTP API (live: since the stage started, with git; a session: its own events). */
export function httpSource(base: string, session: string | null): ChangesSource {
  return {
    async load(q) {
      const p = new URLSearchParams();
      if (session) p.set("session", session);
      if (q.until !== undefined) p.set("until", String(Math.round(q.until)));
      if (q.agent) p.set("agent", q.agent);
      const r = await fetch(`${base}/api/changes?${p}`);
      return r.ok ? ((await r.json()) as ChangeSet & { git?: boolean }) : null;
    },
    async diff(path) {
      if (session) return "Diffs are shown for the live session; a past session's files may have changed since.";
      const r = await fetch(`${base}/api/diff?path=${encodeURIComponent(path)}`);
      if (!r.ok) return "No diff for this file (it may be unchanged against the last commit, or outside git).";
      return (await r.json()) as { diff: string; truncated: boolean };
    },
  };
}

/** Inside a VS Code webview: the extension host answers, and opens diffs in the editor. */
export function hostSource(host: { postMessage(m: unknown): void }): ChangesSource {
  let n = 0;
  const pending = new Map<number, (v: unknown) => void>();
  addEventListener("message", (ev: MessageEvent) => {
    const m = ev.data as { type?: string; reqId?: number; payload?: unknown };
    if (m?.type === "changes" && typeof m.reqId === "number") { pending.get(m.reqId)?.(m.payload ?? null); pending.delete(m.reqId); }
  });
  return {
    load: (q) => new Promise((res) => { const id = ++n; pending.set(id, res as (v: unknown) => void); host.postMessage({ type: "changes", reqId: id, ...q }); setTimeout(() => { if (pending.delete(id)) res(null); }, 8000); }),
    async diff(path) { host.postMessage({ type: "open-diff", path }); return "opened"; },
  };
}

/** No server (a demo or a static replay): built from the events in the page, without git. */
export function eventsSource(events: () => readonly AgentEvent[]): ChangesSource {
  return {
    async load(q) { return changesFromEvents(events(), q); },
    async diff() { return "Diffs need the local stage (run `agent-theatre`)."; },
  };
}

/** Clipboard API first; the old execCommand path when the page lacks permission (webviews, some browsers). */
async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch { /* none */ }
    ta.remove(); return ok;
  }
}
/** Paths sit in a right-to-left box so long ones are cut on the left; marks keep their dots and slashes where they belong. */
const ltr = (p: string) => `\u200e${p}\u200e`;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const LABEL: Record<string, string> = { created: "new", edited: "edited", deleted: "deleted", read: "read" };
const clock = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const linesOf = (f: FileChange) => (f.action === "deleted" ? "deleted" : f.action === "read" ? `read ${f.reads}×` : f.action === "created" ? `+${f.added}` : `+${f.added} −${f.removed}`);

export class ChangesView {
  readonly root: HTMLElement;
  private readonly map: HTMLElement; private readonly list: HTMLElement; private readonly ext: HTMLDetailsElement; private readonly head: HTMLElement; private readonly sub: HTMLElement;
  private readonly slider: HTMLInputElement; private readonly when: HTMLElement; private readonly agentSel: HTMLSelectElement; private readonly readsBox: HTMLInputElement;
  private readonly drawer: HTMLElement; private readonly copyBtn: HTMLButtonElement; private readonly empty: HTMLElement;
  private cs: (ChangeSet & { git?: boolean }) | null = null;
  private full: ChangeSet | null = null;
  private until: number | undefined; private agent = ""; private selected = "";
  private loading = 0; private visible = false; private timer = 0;
  private ro: ResizeObserver | null = null;

  constructor(private readonly source: ChangesSource) {
    this.root = el("section", "changes"); this.root.hidden = true; this.root.setAttribute("aria-label", "What the agent touched");
    const top = el("div", "ch-top");
    const titles = el("div", "ch-titles");
    this.head = el("h2", "", "What the agent touched");
    this.sub = el("p", "ch-sub", "Loading…");
    titles.append(this.head, this.sub);
    const tools = el("div", "ch-tools");
    this.readsBox = el("input"); this.readsBox.type = "checkbox"; this.readsBox.id = "ch-reads";
    const readsLbl = el("label", "ch-check"); readsLbl.htmlFor = "ch-reads"; readsLbl.append(this.readsBox, el("span", "", "Show reads"));
    this.readsBox.onchange = () => this.render();
    this.agentSel = el("select", "ch-select"); this.agentSel.setAttribute("aria-label", "Which agent");
    this.agentSel.onchange = () => { this.agent = this.agentSel.value; void this.reload(); };
    this.copyBtn = el("button", "btn ghost", "Copy as Markdown"); this.copyBtn.type = "button"; this.copyBtn.title = "For a pull request description or a chat";
    this.copyBtn.onclick = async () => {
      if (!this.cs) return;
      const ok = await copyText(toMarkdown(this.cs, { marker: false }));
      this.copyBtn.textContent = ok ? "Copied" : "Copy blocked by the browser";
      setTimeout(() => { this.copyBtn.textContent = "Copy as Markdown"; }, 1600);
    };
    tools.append(readsLbl, this.agentSel, this.copyBtn);
    top.append(titles, tools);
    const time = el("div", "ch-time");
    this.slider = el("input", "ch-slider"); this.slider.type = "range"; this.slider.min = "0"; this.slider.max = "1000"; this.slider.value = "1000"; this.slider.setAttribute("aria-label", "Show changes up to this time");
    this.when = el("span", "ch-when", "");
    this.slider.oninput = () => { this.scrub(); };
    time.append(el("span", "ch-k", "Up to"), this.slider, this.when);
    const legend = el("div", "ch-legend");
    for (const [k, t] of [["created", "new"], ["edited", "edited"], ["deleted", "deleted"], ["read", "read"], ["outside", "not by the agent"]] as const) { const s = el("span", `lg-${k}`); s.append(el("i"), document.createTextNode(t)); legend.append(s); }
    const body = el("div", "ch-body");
    this.map = el("div", "ch-map"); this.map.setAttribute("role", "group"); this.map.setAttribute("aria-label", "Map of changed files by folder");
    this.empty = el("div", "ch-empty", ""); this.empty.hidden = true;
    this.map.append(this.empty);
    const side = el("div", "ch-side");
    this.list = el("ul", "ch-list");
    // files the agent changed in other folders (another repo, home): not on the map, but never hidden
    this.ext = document.createElement("details"); this.ext.className = "ch-ext"; this.ext.hidden = true;
    side.append(this.list, this.ext);
    this.drawer = el("div", "ch-drawer"); this.drawer.hidden = true;
    body.append(this.map, side, this.drawer);
    this.root.append(top, time, legend, body);
    this.ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { if (this.visible) this.drawMap(); }) : null;
    this.ro?.observe(this.map);
    addEventListener("keydown", (e) => { if (e.key === "Escape" && !this.drawer.hidden) this.closeDiff(); });
  }

  get shown(): boolean { return this.visible; }
  show(on: boolean): void {
    this.visible = on; this.root.hidden = !on;
    if (on) void this.reload(true);
  }
  /** New agent activity: refresh soon if open (live). */
  poke(): void { if (!this.visible) return; clearTimeout(this.timer); this.timer = window.setTimeout(() => void this.reload(), 900); }

  private async reload(resetTime = false): Promise<void> {
    const ticket = ++this.loading;
    if (resetTime) this.until = undefined;
    const all = await this.source.load(this.agent ? { agent: this.agent } : {}).catch(() => null);
    const cs = this.until !== undefined ? await this.source.load({ until: this.until, ...(this.agent ? { agent: this.agent } : {}) }).catch(() => null) : all;
    if (ticket !== this.loading) return;
    this.full = all; this.cs = cs;
    if (all && all.agents.length !== this.agentSel.options.length - 1) this.fillAgents(all);
    this.render();
  }

  private fillAgents(all: ChangeSet): void {
    const cur = this.agentSel.value;
    this.agentSel.innerHTML = "";
    this.agentSel.append(new Option("All agents", ""));
    let n = 0;
    for (const a of all.agents) this.agentSel.append(new Option(a === "main" ? "Lead agent" : `Helper ${++n}`, a));
    this.agentSel.value = cur;
    this.agentSel.hidden = all.agents.length < 2;
  }

  private scrub(): void {
    const full = this.full; if (!full || !full.to) return;
    const u = Number(this.slider.value) / 1000;
    this.until = u >= 0.999 ? undefined : full.from + (full.to - full.from) * u;
    this.when.textContent = this.until === undefined ? "now" : clock(this.until);
    clearTimeout(this.timer); this.timer = window.setTimeout(() => void this.reload(), 120);
  }

  private files(): FileChange[] {
    const cs = this.cs; if (!cs) return [];
    return cs.files.filter((f) => this.readsBox.checked || f.action !== "read");
  }

  private render(): void {
    const cs = this.cs;
    if (!cs) { this.sub.textContent = "Could not load the change map."; this.list.innerHTML = ""; this.drawMap(); return; }
    const t = cs.totals;
    const bits = [headline(cs) || "No files changed yet"];
    if (t.read) bits.push(`${t.read} only read`);
    if (t.outside) bits.push(`${t.outside} changed not by the agent`);
    if (t.external) bits.push(`${t.external} outside this folder`);
    if (t.temporary) bits.push(`${t.temporary} temporary (made and removed)`);
    this.sub.textContent = bits.join(" · ");
    if (this.full?.to && this.until === undefined) this.when.textContent = "now";
    this.slider.disabled = !this.full || this.full.to <= this.full.from;
    const files = this.files();
    this.list.innerHTML = "";
    for (const f of files.slice(0, 400)) {
      const li = el("li"); const b = el("button", `ch-row a-${f.by === "outside" ? "outside" : f.action}${f.path === this.selected ? " on" : ""}`); b.type = "button";
      b.append(el("i"), el("span", "ch-path", ltr(f.path)), el("span", "ch-n", linesOf(f)));
      b.title = `${f.path} · ${f.by === "outside" ? "changed, not by the agent" : LABEL[f.action]}${f.inferred ? " · seen in a shell command" : ""}`;
      b.onclick = () => void this.openDiff(f);
      li.append(b); this.list.append(li);
    }
    if (files.length > 400) this.list.append(el("li", "ch-more", `…and ${files.length - 400} more`));
    this.renderExternal(cs.externalPaths ?? [], t.external);
    this.drawMap();
  }

  /** The outside-this-folder paths, grouped by their top folder (e.g. ~/other-repo), as plain text. */
  private renderExternal(paths: readonly string[], total: number): void {
    const wasOpen = this.ext.open;
    this.ext.replaceChildren();
    this.ext.hidden = !paths.length;
    if (!paths.length) return;
    const groups = new Map<string, string[]>();
    for (const p of paths) {
      // events name home paths ~/…, paths above the repo ../…, and anything else (temp folders) //ext/<name>
      const ext = p.startsWith("//ext/");
      const parts = (ext ? p.slice(6) : p).split("/");
      const key = ext ? "elsewhere" : parts[0] === "~" || parts[0] === ".." ? parts.slice(0, 2).join("/") : parts[0]!;
      const rest = (ext ? p.slice(6) : p.slice(key.length).replace(/^\//, "")) || p;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(rest);
    }
    this.ext.append(el("summary", "", `Outside this folder (${total})`));
    for (const [dir, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
      const g = el("div", "ch-ext-g");
      g.append(el("b", "ch-ext-h", `${dir} · ${list.length}`));
      const ul = el("ul");
      for (const f of list.slice(0, 60)) ul.append(el("li", "ch-path", ltr(f)));
      if (list.length > 60) ul.append(el("li", "ch-more", `…and ${list.length - 60} more`));
      g.append(ul); this.ext.append(g);
    }
    if (total > paths.length) this.ext.append(el("p", "ch-more", `…and ${total - paths.length} more`));
    this.ext.open = wasOpen;
  }

  private drawMap(): void {
    for (const n of this.map.querySelectorAll(":scope > :not(.ch-empty)")) n.remove(); // a static list: safe to remove while iterating
    const files = this.files();
    const r = this.map.getBoundingClientRect();
    if (!files.length || r.width < 40 || r.height < 40) {
      this.empty.hidden = !this.visible || !!files.length;
      this.empty.textContent = this.cs ? (this.cs.totals.read && !this.readsBox.checked ? "No files changed yet. Turn on “Show reads” to see what the agent looked at." : "Nothing touched yet. When the agent reads or edits files, they appear here.") : "";
      return;
    }
    this.empty.hidden = true;
    const weight = (f: FileChange) => (f.action === "read" ? 2 : Math.max(4, f.added + f.removed, f.action === "deleted" ? 8 : 0));
    const groups = new Map<string, FileChange[]>();
    for (const f of files) { const d = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "."; const g = groups.get(d) ?? []; g.push(f); groups.set(d, g); }
    const gList = [...groups.entries()].map(([dir, fs]) => ({ dir, fs: fs.sort((a, b) => weight(b) - weight(a)), w: fs.reduce((s, f) => s + Math.sqrt(weight(f)), 0) })).sort((a, b) => b.w - a.w);
    const W = r.width, H = r.height;
    for (const g of squarify(gList.map((g) => ({ item: g, w: g.w })), { x: 0, y: 0, w: W, h: H })) {
      const box = el("div", "ch-dir"); place(box, g.rect, 2);
      const label = el("span", "ch-dirname", g.item.dir === "." ? "(top level)" : `${g.item.dir}/`); label.title = g.item.dir;
      box.append(label);
      this.map.append(box);
      const inner = { x: g.rect.x + 4, y: g.rect.y + 22, w: g.rect.w - 8, h: g.rect.h - 26 };
      if (inner.w < 8 || inner.h < 8) continue;
      for (const t of squarify(g.item.fs.map((f) => ({ item: f, w: Math.sqrt(weight(f)) })), inner)) {
        const f = t.item;
        const tile = el("button", `ch-tile a-${f.by === "outside" ? "outside" : f.action}${f.path === this.selected ? " on" : ""}`); tile.type = "button";
        place(tile, t.rect, 1.5);
        const name = f.path.slice(f.path.lastIndexOf("/") + 1);
        if (t.rect.w > 46 && t.rect.h > 22) { tile.append(el("b", "", name)); if (t.rect.h > 40) tile.append(el("span", "", linesOf(f))); }
        tile.title = `${f.path} · ${f.by === "outside" ? "changed, not by the agent" : LABEL[f.action]} · ${linesOf(f)}`;
        tile.setAttribute("aria-label", tile.title);
        tile.onclick = () => void this.openDiff(f);
        this.map.append(tile);
      }
    }
  }

  private async openDiff(f: FileChange): Promise<void> {
    this.selected = f.path;
    for (const n of this.root.querySelectorAll(".on")) n.classList.remove("on");
    for (const n of this.root.querySelectorAll<HTMLElement>(".ch-tile,.ch-row")) if (n.title.startsWith(`${f.path} ·`)) n.classList.add("on");
    const res = await this.source.diff(f.path);
    if (res === "opened") return;
    this.drawer.hidden = false; this.drawer.innerHTML = "";
    const bar = el("div", "ch-dbar");
    const close = el("button", "btn ghost", "Close"); close.type = "button"; close.onclick = () => this.closeDiff();
    bar.append(el("b", "", f.path), el("span", "", `${f.by === "outside" ? "not by the agent · " : ""}${LABEL[f.action]} · ${linesOf(f)}`), close);
    const pre = el("pre", "ch-diff");
    if (typeof res === "string") pre.append(el("span", "dm", res));
    else {
      for (const line of res.diff.split("\n").slice(0, 4000)) {
        const cls = line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("index ") ? "dh" : line.startsWith("@@") ? "dk" : line.startsWith("+") ? "da" : line.startsWith("-") ? "dr" : "";
        const s = el("span", cls, line + "\n"); pre.append(s);
      }
      if (res.truncated) pre.append(el("span", "dm", "\n… diff truncated"));
      if (!res.diff) pre.append(el("span", "dm", "No differences against the last commit."));
    }
    this.drawer.append(bar, pre);
    close.focus();
  }
  private closeDiff(): void { this.drawer.hidden = true; }
}

function place(n: HTMLElement, r: Rect, gap: number): void {
  n.style.left = `${r.x + gap}px`; n.style.top = `${r.y + gap}px`;
  n.style.width = `${Math.max(0, r.w - gap * 2)}px`; n.style.height = `${Math.max(0, r.h - gap * 2)}px`;
}

interface Rect { x: number; y: number; w: number; h: number }
/** Squarified treemap (Bruls, Huizing, van Wijk): rows laid along the shorter side, keeping tiles close to square. */
export function squarify<T>(items: Array<{ item: T; w: number }>, rect: Rect): Array<{ item: T; rect: Rect }> {
  const total = items.reduce((s, i) => s + Math.max(0, i.w), 0);
  if (!items.length || total <= 0 || rect.w <= 0 || rect.h <= 0) return [];
  const scale = (rect.w * rect.h) / total;
  const queue = items.map((i) => ({ item: i.item, a: Math.max(0, i.w) * scale })).sort((a, b) => b.a - a.a);
  const out: Array<{ item: T; rect: Rect }> = [];
  let r = { ...rect };
  const worst = (row: Array<{ a: number }>, side: number) => { const s = row.reduce((x, i) => x + i.a, 0); const max = Math.max(...row.map((i) => i.a)), min = Math.min(...row.map((i) => i.a)); return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min)); };
  while (queue.length) {
    const side = Math.min(r.w, r.h);
    const row = [queue.shift()!];
    while (queue.length && worst([...row, queue[0]!], side) <= worst(row, side)) row.push(queue.shift()!);
    const s = row.reduce((x, i) => x + i.a, 0);
    if (r.w >= r.h) { const colW = s / r.h; let y = r.y; for (const i of row) { const h = i.a / colW; out.push({ item: i.item, rect: { x: r.x, y, w: colW, h } }); y += h; } r = { x: r.x + colW, y: r.y, w: r.w - colW, h: r.h }; }
    else { const rowH = s / r.w; let x = r.x; for (const i of row) { const w = i.a / rowH; out.push({ item: i.item, rect: { x, y: r.y, w, h: rowH } }); x += w; } r = { x: r.x, y: r.y + rowH, w: r.w, h: r.h - rowH }; }
  }
  return out;
}
