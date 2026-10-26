import type { AgentEvent, Beat, World } from "@agent-theatre/core";
import { captionFor, deriveActs, type Act } from "../scene/story.js";
import type { PlayerState } from "../scene/player.js";
import { SETS, suggestSets, type SetTheme } from "../sets/index.js";
import type { RepoProfile } from "@agent-theatre/core";

const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const PLAY = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.3-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5z"/></svg>';
const PAUSE = '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="3.5" y="3" width="3" height="10" rx="1"/><rect x="9.5" y="3" width="3" height="10" rx="1"/></svg>';
const CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';

export interface PanelHandlers { onGoLive(): void; onPlayPause(): void; onSeek(ms: number): void; onRate(): void; onMute(): void; onAmbience(): void; onPickSet(id: SetTheme["id"]): void; onShuffle(): void; onOverview(on: boolean): void; onZoom(factor: number): void; onExport(): void; }

/** All DOM. Reads PlayerState every frame; never touches Pixi. */
export class Panel {
  readonly root: HTMLElement;
  readonly stageEl: HTMLElement;
  private readonly nudge: HTMLElement;
  showNudge(): void { this.nudge.hidden = false; }
  /** After an export: download, system share, post intents, caption. */
  showShare(clip: { blob: Blob; name: string; caption: string }): void {
    const url = URL.createObjectURL(clip.blob);
    const file = new File([clip.blob], clip.name, { type: clip.blob.type });
    const canShare = typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
    const sheet = el("div", "share", `<div class="sh-head"><b>Your clip is ready</b><span>${(clip.blob.size / 1048576).toFixed(1)} MB · ${clip.name.split(".").pop()}</span></div>
      <div class="sh-row"><a class="btn primary" download="${clip.name}" href="${url}">Download</a>${canShare ? '<button type="button" class="btn ghost" data-act="share">Share…</button>' : ""}<a class="btn ghost" target="_blank" rel="noopener" href="https://x.com/intent/post?text=${encodeURIComponent(clip.caption)}">Post on X</a><a class="btn ghost" target="_blank" rel="noopener" href="https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(clip.caption)}">Post on LinkedIn</a><button type="button" class="btn ghost" data-act="caption">Copy caption</button><button type="button" class="btn ghost" data-act="close">Close</button></div>
      <p class="sh-note">Posts open with the caption; attach the downloaded clip there.</p>`);
    sheet.addEventListener("click", (ev) => {
      const act = (ev.target as HTMLElement).closest("[data-act]")?.getAttribute("data-act");
      if (act === "share") void navigator.share({ files: [file], title: "Agent Theatre", text: clip.caption }).catch(() => {});
      if (act === "caption") void navigator.clipboard?.writeText(clip.caption);
      if (act === "close") { sheet.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    });
    this.stageEl.append(sheet);
  }
  nudgeSeen(): void { this.nudge.hidden = true; try { localStorage.setItem("at:nudged", "1"); } catch { /* fine */ } }
  private readonly overviewBtn: HTMLButtonElement; private overviewOn = false; readonly exportBtn: HTMLButtonElement;
  private readonly fsBtn: HTMLButtonElement;
  /** Full screen keeps the stage, the caption and the live controls; the side panels and header go. */
  toggleFullscreen(): void {
    const root = this.root;
    if (document.fullscreenElement) { void document.exitFullscreen(); return; }
    if (root.requestFullscreen) void root.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    else { document.documentElement.classList.toggle("fullscreen"); dispatchEvent(new Event("resize")); } // no API (old Safari): CSS-only full-bleed
  }
  private readonly liveBtn: HTMLButtonElement;
  private readonly tip: HTMLElement;
  /** Set by the host: screen point → what is there. */
  hitTester: ((x: number, y: number) => ReturnType<import("../scene/player.js").ScenePlayer["hitTest"]>) | null = null;
  private fileStats = new Map<string, { reads: number; edits: number; added: number; removed: number; tests?: string }>();
  private describeHit(hit: NonNullable<ReturnType<import("../scene/player.js").ScenePlayer["hitTest"]>>): string {
    if (hit.kind === "lead") return `<b>${esc(hit.name)}</b> — the agent, your lead.<br><span>Mood: ${esc(hit.mood)}. The light on its head shows it.</span>`;
    if (hit.kind === "helper") return `<b>${esc(hit.name)}</b> — a helper (subagent).<br><span>Arrived at the dock; working on its own task.</span>`;
    const p = hit.place, st = this.fileStats.get(p.path);
    const activity = st ? [st.reads ? `read ${st.reads}×` : "", st.edits ? `edited ${st.edits}× (+${st.added} −${st.removed})` : ""].filter(Boolean).join(" · ") : "";
    switch (p.kind) {
      case "forge": return `<b>The forge</b> — shell work.<br><span>Commands that touch no particular file (installs, builds, git) happen here.</span>`;
      case "dock": return `<b>The dock</b> — where helpers arrive.<br><span>Subagents row in here and fan out to their districts.</span>`;
      case "beacon": return `<b>${esc(p.label)}</b> — a test suite.<br><span>${esc(p.path)}${st?.tests ? ` · last run: ${esc(st.tests)}` : ""}. Its lamp scans while tests run, goes red on failure, green on a pass.</span>`;
      case "archive": return `<b>${esc(p.label)}</b> — docs / data.<br><span>${esc(p.path)}${activity ? " · " + activity : ""}</span>`;
      case "overflow": return `<b>${esc(p.label)}</b> — the rest of this folder.<br><span>Files below the relevance cap share this building; activity on them lands here.</span>`;
      default: return `<b>${esc(p.label)}</b> — a file.<br><span>${esc(p.path)} · size class ${p.height}/5${activity ? " · " + activity : " · untouched this session"}</span>`;
    }
  }
  private readonly waiting: HTMLElement; private readonly vscode: { postMessage: (m: unknown) => void } | null; private notifiedFor = "";
  private readonly overlay: HTMLElement; private readonly caption: HTMLElement; private readonly chip: HTMLElement; private readonly signal: HTMLElement;
  private readonly title: HTMLElement; private readonly end: HTMLElement; private readonly picker: HTMLElement;
  private readonly playBtn: HTMLButtonElement; private readonly rateBtn: HTMLButtonElement; private readonly muteBtn: HTMLButtonElement; private readonly ambBtn: HTMLButtonElement; private readonly setBtn: HTMLButtonElement;
  private readonly actsEl: HTMLElement; private readonly labelsEl: HTMLElement; private readonly head: HTMLElement; private readonly time: HTMLElement; private readonly logEl: HTMLElement;
  private acts: Act[] = []; private actBtns: HTMLButtonElement[] = []; private actLabels: HTMLElement[] = [];
  private logBtns: Array<{ btn: HTMLButtonElement; ms: number }> = [];
  private lastCaption = ""; private lastBeatId = ""; private lastAct = -1; private lastEv = -2;
  private tagPool: HTMLElement[] = []; private bubbleEl: HTMLElement;

  constructor(host: HTMLElement, private readonly h: PanelHandlers) {
    this.root = el("div", "wrap");
    const header = el("header");
    const brand = el("div", "brand", `<div class="eyebrow"><a href="https://agenttheatre.dev/" title="Back to agenttheatre.dev">← Agent Theatre</a><span class="for"> · the stage for</span></div><h1 id="title">Loading…</h1>`);
    const tb = el("div", "toolbar");
    this.setBtn = el("button", "btn ghost", "Set"); this.setBtn.type = "button"; this.setBtn.onclick = () => this.showPicker(true);
    this.muteBtn = el("button", "btn ghost", "Effects on"); this.muteBtn.type = "button"; this.muteBtn.title = "Sound effects"; this.muteBtn.onclick = () => h.onMute();
    this.ambBtn = el("button", "btn ghost", "Ambience on"); this.ambBtn.type = "button"; this.ambBtn.title = "Background sound"; this.ambBtn.onclick = () => h.onAmbience();
    this.overviewBtn = el("button", "btn ghost", "Whole repo"); this.overviewBtn.type = "button"; this.overviewBtn.title = "Pull back to see every building (follow camera off)"; this.overviewBtn.onclick = () => { this.overviewOn = !this.overviewOn; this.overviewBtn.textContent = this.overviewOn ? "Follow" : "Whole repo"; this.overviewBtn.setAttribute("aria-pressed", String(this.overviewOn)); h.onOverview(this.overviewOn); };
    this.exportBtn = el("button", "btn ghost", "Export clip"); this.exportBtn.type = "button"; this.exportBtn.title = "Record the stage (with sound) to a .webm you can share"; this.exportBtn.onclick = () => h.onExport();
    this.fsBtn = el("button", "btn ghost", "⤢ Full screen"); this.fsBtn.type = "button"; this.fsBtn.title = "Stage only, full screen (F or Esc to leave)";
    this.fsBtn.onclick = () => this.toggleFullscreen();
    tb.append(this.setBtn, this.overviewBtn, this.muteBtn, this.ambBtn, this.exportBtn, this.fsBtn);
    document.addEventListener("fullscreenchange", () => { const on = !!document.fullscreenElement; document.documentElement.classList.toggle("fullscreen", on); this.fsBtn.textContent = on ? "⤡ Exit full screen" : "⤢ Full screen"; dispatchEvent(new Event("resize")); });
    addEventListener("keydown", (ev) => { if (ev.key === "f" && !(ev.target instanceof HTMLInputElement) && !ev.metaKey && !ev.ctrlKey) this.toggleFullscreen(); });
    this.nudge = el("div", "nudge", "Sound is off — turn on effects and ambience to hear the stage"); this.nudge.hidden = true; tb.append(this.nudge);
    header.append(brand, tb);
    const grid = el("div", "grid");
    const col = el("div", "stage-col");
    this.stageEl = el("div", "stage");
    this.overlay = el("div", "overlay");
    this.bubbleEl = el("div", "bubble"); this.bubbleEl.hidden = true; this.overlay.append(this.bubbleEl);
    this.signal = el("div", "signal", "<i></i><span>live</span>"); this.signal.hidden = true;
    this.chip = el("div", "chip ok"); this.chip.hidden = true;
    this.caption = el("div", "caption", "<span></span>");
    this.title = el("div", "card", `<div class="small">Agent Theatre</div><div class="big" id="titleBig">…</div>`);
    this.end = el("div", "card", `<div class="big">Every agent run has a story.</div><div class="small">Agent Theatre</div>`); this.end.style.opacity = "0";
    this.picker = el("div", "picker"); this.picker.hidden = true;
    // when the agent is waiting on the person, say so where they are looking and give them a way back to it
    this.waiting = el("div", "waiting", `<div class="wt"><b></b><span></span></div><button type="button" class="go"></button>`); this.waiting.hidden = true;
    this.vscode = (globalThis as { __vsapi?: { postMessage: (m: unknown) => void } | null }).__vsapi ?? null;
    (this.waiting.querySelector(".go") as HTMLButtonElement).onclick = () => { if (this.vscode) this.vscode.postMessage({ type: "focus-agent" }); else void this.notify(); };
    this.tip = el("div", "tip"); this.tip.hidden = true;
    this.stageEl.append(el("div", "vignette"), this.overlay, this.signal, this.chip, this.caption, this.title, this.end, this.picker, this.waiting, this.tip);
    // hover help: what is this building, and what happened to it this session
    this.stageEl.addEventListener("pointermove", (ev) => {
      const r = this.stageEl.getBoundingClientRect(); const hit = this.hitTester?.(ev.clientX - r.left, ev.clientY - r.top) ?? null;
      if (!hit) { this.tip.hidden = true; return; }
      this.tip.innerHTML = this.describeHit(hit); this.tip.hidden = false;
      const x = Math.min(ev.clientX - r.left + 14, r.width - this.tip.offsetWidth - 10), y = ev.clientY - r.top + 16;
      this.tip.style.left = `${Math.max(8, x)}px`; this.tip.style.top = `${Math.min(y, r.height - this.tip.offsetHeight - 10)}px`;
    });
    this.stageEl.addEventListener("pointerleave", () => { this.tip.hidden = true; });
    // wheel = zoom
    this.stageEl.addEventListener("wheel", (ev) => { if (!ev.ctrlKey && Math.abs(ev.deltaY) < 1) return; ev.preventDefault(); h.onZoom(Math.exp(-ev.deltaY * 0.0015)); }, { passive: false });
    const controls = el("div", "controls");
    this.playBtn = el("button", "btn", `${PAUSE}<span>Pause</span>`); this.playBtn.type = "button"; this.playBtn.onclick = () => h.onPlayPause();
    const track = el("div", "track"); this.actsEl = el("div", "acts"); this.labelsEl = el("div", "actlabels"); this.head = el("div", "head"); track.append(this.actsEl, this.labelsEl, this.head);
    track.addEventListener("pointerdown", (e) => { const r = this.actsEl.getBoundingClientRect(); const u = (e.clientX - r.left) / r.width; h.onSeek(u * this.durationMs); });
    this.time = el("div", "time", "0:00 / 0:00");
    this.liveBtn = el("button", "btn golive", `<i class="dot"></i><span>Go live</span>`); this.liveBtn.type = "button"; this.liveBtn.title = "Jump back to what is happening now"; this.liveBtn.hidden = true; this.liveBtn.onclick = () => h.onGoLive();
    this.rateBtn = el("button", "btn ghost", "1×"); this.rateBtn.type = "button"; this.rateBtn.onclick = () => h.onRate();
    controls.append(this.playBtn, track, this.time, this.liveBtn, this.rateBtn);
    col.append(this.stageEl, controls);
    const aside = el("aside");
    const logPanel = el("section", "panel", `<h2>Event log</h2><p class="sub">Every scene is driven by one of these agent events. Tap one to jump there.</p>`);
    this.logEl = el("ul", "log"); logPanel.append(this.logEl);
    const legend = el("section", "panel", `<h2>How to read the stage</h2><p class="sub">Buildings are files, districts are folders, beacons are test suites. Gremlins are failing tests. The lead character is the agent; its light shows its mood. Helpers are subagents. If the agent says it's done without a passing test, something hides behind it.</p>`);
    aside.append(logPanel, legend);
    grid.append(col, aside);
    this.root.append(header, grid, el("p", "note", "Everything you see is generated locally from agent events. No code, prompts or file contents are shown or sent anywhere."));
    host.append(this.root);
  }
  private durationMs = 0;
  repoId = "";
  /** Live: the folder this stage watches, and (if any) another folder where Claude Code is actually running. */
  cwd = ""; elsewhere = "";
  /** Live: ms since the last event and whether a session is open; drives the quiet banner. */
  quietMs = 0; sessionOpen = true; quietAfterMs = 90000; restAfterMs = ENDED_REST_MS;

  setTitle(repoId: string, episode?: string): void {
    // "github.com/org/repo" → "repo", "/Users/me/projects/x" → "x"; the full id stays in the tooltip
    const short = repoId.replace(/\/+$/, "").split(/[/\\]/).filter(Boolean).pop() ?? repoId;
    const t = this.root.querySelector("#title") as HTMLElement; t.textContent = short; t.title = repoId;
    (this.root.querySelector("#titleBig") as HTMLElement).textContent = episode ?? short;
  }
  setMuted(m: boolean): void { this.muteBtn.textContent = m ? "Effects off" : "Effects on"; this.muteBtn.setAttribute("aria-pressed", String(!m)); }
  setAmbience(on: boolean): void { this.ambBtn.textContent = on ? "Ambience on" : "Ambience off"; this.ambBtn.setAttribute("aria-pressed", String(on)); }
  setRate(r: number): void { this.rateBtn.textContent = `${r}×`; }

  loadTimeline(beats: Beat[], events: AgentEvent[], world: World): void {
    this.fileStats = new Map();
    const st = (path: string) => { let s = this.fileStats.get(path); if (!s) { s = { reads: 0, edits: 0, added: 0, removed: 0 }; this.fileStats.set(path, s); } return s; };
    for (const e of events) {
      if (e.kind === "read_file") st(e.path).reads++;
      else if (e.kind === "edit_file") { const s = st(e.path); s.edits++; s.added += e.added; s.removed += e.removed; }
      else if (e.kind === "write_file") { const s = st(e.path); s.edits++; s.added += e.added; }
      else if (e.kind === "test_result") { const summary = e.failed ? `${e.failed} failed, ${e.passed} passed` : `${e.passed} passed`; for (const p of world.places) if (p.kind === "beacon") st(p.path).tests = summary; }
    }
    this.durationMs = beats.length ? Math.max(...beats.map((b) => b.atMs + b.durationMs)) : 0;
    this.acts = deriveActs(beats);
    this.actsEl.innerHTML = ""; this.labelsEl.innerHTML = ""; this.actBtns = []; this.actLabels = [];
    for (const a of this.acts) {
      const w = ((a.toMs - a.fromMs) / Math.max(1, this.durationMs)) * 100;
      const b = el("button"); b.type = "button"; b.style.flex = `0 0 calc(${w}% - 3px)`; b.setAttribute("aria-label", `Jump to ${a.label}`); b.onclick = (e) => { e.stopPropagation(); this.h.onSeek(a.fromMs + 1); };
      // a label only where it fits; narrow acts (long live sessions) keep the name as a tooltip instead of piling up
      const s = el("span", "", w >= 7 ? a.label : ""); s.style.flex = `0 0 calc(${w}% - 3px)`; s.title = a.label;
      this.actsEl.append(b); this.labelsEl.append(s); this.actBtns.push(b); this.actLabels.push(s);
    }
    this.logEl.innerHTML = ""; this.logBtns = [];
    const t0 = events[0]?.ts ?? 0;
    const beatFor = (id: string) => beats.find((b) => b.sourceEventIds.includes(id));
    for (const e of events) {
      if (e.kind === "session_start" || e.kind === "session_end") continue;
      const b = beatFor(e.id); if (!b) continue;
      const li = el("li"); const btn = el("button"); btn.type = "button";
      const [title, sub] = describe(e, world);
      const failed = e.kind === "test_result" && !e.ok;
      btn.innerHTML = `<time>${fmt(b.atMs)}</time><span class="dot k-${e.kind}${failed ? " fail" : ""}"></span><span class="ev"><b>${esc(title)}</b><code>${esc(sub)}</code></span>`;
      btn.onclick = () => this.h.onSeek(b.atMs + 1);
      li.append(btn); this.logEl.append(li); this.logBtns.push({ btn, ms: b.atMs });
    }
    void t0;
  }

  previews = new Map<string, string>();
  get pickerOpen(): boolean { return !this.picker.hidden; }
  profile: RepoProfile | undefined;
  leadName = "Pip";
  showAll = false;
  showPicker(show: boolean, themeId?: string): void {
    this.picker.hidden = !show;
    if (!show) return;
    this.picker.innerHTML = "";
    const kind = this.profile?.kinds?.[0];
    const kindLabel = kind && kind !== "unknown" ? ({ "web-frontend": "a web app", "backend-api": "a backend", "cli-tool": "a CLI", library: "a library", "data-ml": "data & ML work", mobile: "a mobile app", game: "a game", "infra-devops": "infrastructure", "docs-content": "documentation", monorepo: "a monorepo", systems: "systems code" } as Record<string, string>)[kind] : null;
    const suggested = suggestSets(this.profile, hashSeed(this.repoId)).slice(0, 3);
    const list = this.showAll ? [...SETS] : suggested;
    this.picker.append(el("h3", "", this.showAll ? "All sets" : "Choose your set"), el("p", "", kindLabel && !this.showAll ? `This looks like ${kindLabel}${this.profile?.languages?.[0] ? ` in ${this.profile.languages[0]}` : ""}. These stages suit it — or browse them all.` : "Same repo, same story — pick the stage. You can change it any time."));
    const cards = el("div", "setcards");
    for (const s of list) {
      const c = el("button", "setcard"); c.type = "button";
      const img = this.previews.get(s.id);
      c.innerHTML = `<div class="sw" style="--a:${hex(s.sky[0])};--b:${hex(s.palettes[0]!.left)}">${img ? `<img src="${img}" alt="" />` : ""}</div><div class="nm">${s.name}${s.id === themeId ? " ✓" : ""}</div><div class="tg">${s.tagline}</div>`;
      c.onclick = () => { this.h.onPickSet(s.id); this.showPicker(false); };
      cards.append(c);
    }
    const row = el("div", "toolbar");
    const sh = el("button", "btn ghost", "Surprise me"); sh.type = "button"; sh.onclick = () => this.h.onShuffle();
    const all = el("button", "btn ghost", this.showAll ? "Suggested" : `All ${SETS.length} sets`); all.type = "button"; all.onclick = () => { this.showAll = !this.showAll; this.showPicker(true, themeId); };
    row.append(sh, all);
    this.picker.append(cards, row);
  }

  update(s: PlayerState, world: World, lampOf: (id: string) => string, helperLabel?: string): void {
    this.time.textContent = `${fmt(s.t)} / ${fmt(s.duration)}`;
    this.head.style.left = `${(s.t / Math.max(1, s.duration)) * 100}%`;
    // live: the end of the timeline is "now", not the end of a film — never offer a replay there
    const atEnd = s.t >= s.duration - 1;
    this.liveBtn.hidden = !(this.liveMode && s.duration - s.t > 1500);
    this.playBtn.innerHTML = this.liveMode && atEnd ? `<i class="dot"></i><span>Live</span>` : s.playing ? `${PAUSE}<span>Pause</span>` : `${PLAY}<span>${atEnd ? "Replay" : "Play"}</span>`;
    this.playBtn.title = this.liveMode && atEnd ? "You are watching the live edge; new events play as they arrive" : "";
    const cur = s.current;
    // cards
    this.title.style.opacity = String(cur && cur.kind === "curtain_up" ? 1 - Math.min(1, Math.max(0, (s.t - cur.atMs - 600) / 700)) : s.t < 600 ? 1 : 0);
    // a live stage has no ending: the end card belongs to a replay
    const endBeat = cur && cur.kind === "curtain_down" && !this.liveMode ? cur : null;
    this.end.style.opacity = String(endBeat ? Math.min(1, Math.max(0, (s.t - endBeat.atMs - 400) / 600)) : 0);
    // caption
    const text = cur ? captionFor(cur, world, helperLabel).replace(/\bPip\b/g, this.leadName) : "";
    if (cur && cur.id !== this.lastBeatId) { this.lastBeatId = cur.id; if (text) this.lastCaption = text; }
    const span = this.caption.firstElementChild as HTMLElement; span.textContent = this.lastCaption; span.style.opacity = this.lastCaption && !(cur?.kind === "curtain_up" && s.t - (cur?.atMs ?? 0) < 900) ? "1" : "0";
    // evidence chip
    if (s.evidence) { this.chip.hidden = false; this.chip.className = "chip ok"; this.chip.innerHTML = `${CHECK}Evidence · ${s.evidence.passed} tests passed`; }
    else if (cur?.kind === "unverified_claim" || (cur?.kind === "curtain_down" && !cur.verified)) { this.chip.hidden = false; this.chip.className = "chip warn"; this.chip.textContent = "No test evidence"; }
    else this.chip.hidden = true;
    // waiting banner (live only): permission or question → the person is the next actor
    const waitingNow = this.liveMode && cur?.kind === "blocked_on_you";
    this.waiting.hidden = !waitingNow;
    if (waitingNow && cur?.kind === "blocked_on_you") {
      const reason = cur.reason === "permission" ? "needs your permission to continue" : "has a question for you";
      (this.waiting.querySelector("b") as HTMLElement).textContent = `${this.leadName || "The agent"} ${reason}.`;
      (this.waiting.querySelector("span") as HTMLElement).textContent = this.vscode ? "Answer in Claude Code." : "Answer in the terminal or editor where Claude Code is running.";
      (this.waiting.querySelector(".go") as HTMLElement).textContent = this.vscode ? "Go to Claude Code" : "Notify me next time";
      if (this.notifiedFor !== cur.id) { this.notifiedFor = cur.id; if (!this.vscode && "Notification" in globalThis && Notification.permission === "granted") void new Notification("Agent Theatre", { body: `${this.leadName || "The agent"} ${reason}.` }); }
    }
    // live with nothing to perform yet: say what the stage is waiting for instead of sitting on a title card
    if (this.liveMode && s.duration === 0) {
      const short = (this.repoId || "this folder").split(/[/\\]/).filter(Boolean).pop();
      const other = this.elsewhere && this.elsewhere !== this.cwd ? this.elsewhere.split(/[/\\]/).filter(Boolean).pop() : "";
      this.caption.hidden = false;
      (this.caption.firstElementChild as HTMLElement).textContent = other
        ? `This stage watches ${short}, but Claude Code is working in ${other}. Start a stage there: cd ${this.elsewhere} && npx agent-theatre`
        : `Waiting for a Claude Code session in ${short}. Run \`claude\` in that folder and the stage comes alive.`;
    }
    // quiet banner: 20 s → thinking, 90 s → quiet with elapsed time, session closed → ended
    const q = this.liveMode ? this.quietMs : 0;
    const ago = elapsed(q);
    const quietAfter = this.quietAfterMs, thinkAfter = quietAfter * 0.22;
    this.signal.hidden = !this.liveMode || (q < thinkAfter && this.sessionOpen && s.signal === "ok");
    this.signal.className = `signal ${!this.sessionOpen ? "ended" : q >= quietAfter ? "lost" : "thinking"}`;
    const folder = (this.repoId || "this folder").split(/[/\\]/).filter(Boolean).pop();
    (this.signal.lastElementChild as HTMLElement).textContent = !this.sessionOpen
      ? (q < this.restAfterMs ? `session ended · last event ${ago} ago` : `session ended ${ago} ago · run claude in ${folder} to start a new one`)
      : q >= quietAfter ? `quiet · nothing from the agent for ${ago}` : `thinking… ${ago}`;
    // acts
    let ai = 0; this.acts.forEach((a, i) => { if (s.t >= a.fromMs) ai = i; });
    if (ai !== this.lastAct) { this.lastAct = ai; this.actBtns.forEach((b, i) => { b.classList.toggle("on", i < ai); b.classList.toggle("now", i === ai); }); this.actLabels.forEach((l, i) => l.classList.toggle("now", i === ai)); }
    // log
    let ei = -1; this.logBtns.forEach((l, i) => { if (s.t >= l.ms) ei = i; });
    if (ei !== this.lastEv) { this.lastEv = ei; this.logBtns.forEach((l, i) => { l.btn.classList.toggle("done", i < ei); l.btn.classList.toggle("now", i === ei); }); const b = this.logBtns[ei]?.btn; if (b) scrollWithin(b); }
    // tags
    const r = this.stageEl.getBoundingClientRect();
    const narrow = r.width < 600;
    const shown = s.labels.filter((l) => l.active || !narrow).sort((a, b) => a.screen.y - b.screen.y || a.screen.x - b.screen.x);
    for (let i = 0; i < shown.length; i++) for (let j = 0; j < i; j++) { const a = shown[j]!, b = shown[i]!; if (Math.abs(a.screen.x - b.screen.x) < 76 && Math.abs(a.screen.y - b.screen.y) < 20) b.screen = { x: b.screen.x, y: a.screen.y - 20 }; }
    while (this.tagPool.length < shown.length) { const t = el("div", "tag"); this.overlay.append(t); this.tagPool.push(t); }
    this.tagPool.forEach((t, i) => { const l = shown[i]; if (!l) { t.hidden = true; return; } t.hidden = false; t.textContent = l.text; const pid = world.places.find((p) => p.label === l.text)?.id ?? ""; const lamp = lampOf(pid); t.className = `tag${l.active ? " active" : ""}${lamp !== "idle" ? ` lamp-${lamp}` : ""}`; t.style.left = `${l.screen.x}px`; t.style.top = `${l.screen.y}px`; });
    // bubble
    if (s.bubble) { this.bubbleEl.hidden = false; this.bubbleEl.textContent = s.bubble.text; this.bubbleEl.style.color = hex(s.bubble.color); this.bubbleEl.style.left = `${s.bubble.screen.x}px`; this.bubbleEl.style.top = `${s.bubble.screen.y}px`; this.bubbleEl.classList.toggle("pulse", cur?.kind === "blocked_on_you"); }
    else this.bubbleEl.hidden = true;
  }
  liveMode = false;
  private async notify(): Promise<void> {
    if (!("Notification" in globalThis)) return;
    const p = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    if (p === "granted") void new Notification("Agent Theatre", { body: "You'll get a notification whenever the agent waits on you." });
  }
}

function describe(e: AgentEvent, world: World): [string, string] {
  const name = (p: string) => p.split("/").pop() ?? p;
  switch (e.kind) {
    case "read_file": return ["Read", e.path];
    case "edit_file": return ["Edit", `${e.path} · +${e.added} −${e.removed}`];
    case "write_file": return [e.created ? "Create" : "Write", e.path];
    case "run_command": return [e.intent === "test" ? "Run tests" : e.intent === "git" ? "Git" : e.intent === "build" ? "Build" : e.intent === "install" ? "Install" : "Run", `${e.argv0}${e.touched.length ? " · " + e.touched.map(name).join(", ") : ""}`];
    case "test_result": return [e.ok ? `${e.passed} passed` : `${e.failed} failed`, e.framework ? `${e.framework}` : ""];
    case "search": return ["Search", e.scope];
    case "subagent_start": return ["Helper", e.label ?? e.childId];
    case "subagent_stop": return ["Helper done", e.childId];
    case "waiting_for_user": return [e.reason === "permission" ? "Needs permission" : e.reason === "question" ? "Has a question" : "Waiting", ""];
    case "error": return ["Error", e.where];
    case "turn_end": return [e.claimedSuccess ? "Says it's done" : "Turn ends", ""];
    default: return [e.kind, ""];
  }
  void world;
}
const hashSeed = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** Scroll the event log's own pane to keep a row visible — never the page (scrollIntoView yanked the stage out of view). */
/** After an ended session the stage rests: lights up, the banner stops counting seconds (also in main.ts). */
export const ENDED_REST_MS = 5 * 60_000;

/** "12 s", "3 min 4 s", "2 h 14 min", "3 d 2 h" — the banner never reads "212 min 8 s". */
export function elapsed(ms: number): string {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (d) return `${d} d ${h % 24} h`;
  if (h) return `${h} h ${m % 60} min`;
  if (m) return `${m} min ${s % 60} s`;
  return `${s} s`;
}

function scrollWithin(el: HTMLElement): void {
  let c: HTMLElement | null = el.parentElement;
  while (c && !/(auto|scroll)/.test(getComputedStyle(c).overflowY)) c = c.parentElement;
  if (!c) return;
  const top = el.offsetTop - c.offsetTop, bottom = top + el.offsetHeight;
  if (top < c.scrollTop) c.scrollTo({ top, behavior: "smooth" });
  else if (bottom > c.scrollTop + c.clientHeight) c.scrollTo({ top: bottom - c.clientHeight, behavior: "smooth" });
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
