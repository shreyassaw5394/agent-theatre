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

export interface PanelHandlers { onPlayPause(): void; onSeek(ms: number): void; onRate(): void; onMute(): void; onAmbience(): void; onPickSet(id: SetTheme["id"]): void; onShuffle(): void }

/** All DOM. Reads PlayerState every frame; never touches Pixi. */
export class Panel {
  readonly root: HTMLElement;
  readonly stageEl: HTMLElement;
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
    const brand = el("div", "brand", `<div class="eyebrow">Agent Theatre</div><h1 id="title">Loading…</h1>`);
    const tb = el("div", "toolbar");
    this.setBtn = el("button", "btn ghost", "Set"); this.setBtn.type = "button"; this.setBtn.onclick = () => this.showPicker(true);
    this.muteBtn = el("button", "btn ghost", "Effects on"); this.muteBtn.type = "button"; this.muteBtn.title = "Sound effects"; this.muteBtn.onclick = () => h.onMute();
    this.ambBtn = el("button", "btn ghost", "Ambience on"); this.ambBtn.type = "button"; this.ambBtn.title = "Background sound"; this.ambBtn.onclick = () => h.onAmbience();
    tb.append(this.setBtn, this.muteBtn, this.ambBtn);
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
    this.stageEl.append(el("div", "vignette"), this.overlay, this.signal, this.chip, this.caption, this.title, this.end, this.picker);
    const controls = el("div", "controls");
    this.playBtn = el("button", "btn", `${PAUSE}<span>Pause</span>`); this.playBtn.type = "button"; this.playBtn.onclick = () => h.onPlayPause();
    const track = el("div", "track"); this.actsEl = el("div", "acts"); this.labelsEl = el("div", "actlabels"); this.head = el("div", "head"); track.append(this.actsEl, this.labelsEl, this.head);
    track.addEventListener("pointerdown", (e) => { const r = this.actsEl.getBoundingClientRect(); const u = (e.clientX - r.left) / r.width; h.onSeek(u * this.durationMs); });
    this.time = el("div", "time", "0:00 / 0:00");
    this.rateBtn = el("button", "btn ghost", "1×"); this.rateBtn.type = "button"; this.rateBtn.onclick = () => h.onRate();
    controls.append(this.playBtn, track, this.time, this.rateBtn);
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

  setTitle(repoId: string, episode?: string): void { (this.root.querySelector("#title") as HTMLElement).textContent = repoId; (this.root.querySelector("#titleBig") as HTMLElement).textContent = episode ?? repoId; }
  setMuted(m: boolean): void { this.muteBtn.textContent = m ? "Effects off" : "Effects on"; this.muteBtn.setAttribute("aria-pressed", String(!m)); }
  setAmbience(on: boolean): void { this.ambBtn.textContent = on ? "Ambience on" : "Ambience off"; this.ambBtn.setAttribute("aria-pressed", String(on)); }
  setRate(r: number): void { this.rateBtn.textContent = `${r}×`; }

  loadTimeline(beats: Beat[], events: AgentEvent[], world: World): void {
    this.durationMs = beats.length ? Math.max(...beats.map((b) => b.atMs + b.durationMs)) : 0;
    this.acts = deriveActs(beats);
    this.actsEl.innerHTML = ""; this.labelsEl.innerHTML = ""; this.actBtns = []; this.actLabels = [];
    for (const a of this.acts) {
      const w = ((a.toMs - a.fromMs) / Math.max(1, this.durationMs)) * 100;
      const b = el("button"); b.type = "button"; b.style.flex = `0 0 calc(${w}% - 3px)`; b.setAttribute("aria-label", `Jump to ${a.label}`); b.onclick = (e) => { e.stopPropagation(); this.h.onSeek(a.fromMs + 1); };
      const s = el("span", "", a.label); s.style.flex = `0 0 calc(${w}% - 3px)`;
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
      c.innerHTML = `<div class="sw" style="--a:${hex(s.sky[0])};--b:${hex(s.palettes[0]!.left)}">${img ? `<img src="${img}" alt="" />` : ""}</div><div class="nm">${s.name}${s.id === themeId ? " ·" : ""}</div><div class="tg">${s.tagline}</div>`;
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
    this.playBtn.innerHTML = s.playing ? `${PAUSE}<span>Pause</span>` : `${PLAY}<span>${s.t >= s.duration - 1 ? "Replay" : "Play"}</span>`;
    const cur = s.current;
    // cards
    this.title.style.opacity = String(cur && cur.kind === "curtain_up" ? 1 - Math.min(1, Math.max(0, (s.t - cur.atMs - 600) / 700)) : s.t < 600 ? 1 : 0);
    const endBeat = cur && cur.kind === "curtain_down" ? cur : null;
    this.end.style.opacity = String(endBeat ? Math.min(1, Math.max(0, (s.t - endBeat.atMs - 400) / 600)) : 0);
    // caption
    const text = cur ? captionFor(cur, world, helperLabel).replace(/\bPip\b/g, this.leadName) : "";
    if (cur && cur.id !== this.lastBeatId) { this.lastBeatId = cur.id; if (text) this.lastCaption = text; }
    const span = this.caption.firstElementChild as HTMLElement; span.textContent = this.lastCaption; span.style.opacity = this.lastCaption && !(cur?.kind === "curtain_up" && s.t - (cur?.atMs ?? 0) < 900) ? "1" : "0";
    // evidence chip
    if (s.evidence) { this.chip.hidden = false; this.chip.className = "chip ok"; this.chip.innerHTML = `${CHECK}Evidence · ${s.evidence.passed} tests passed`; }
    else if (cur?.kind === "unverified_claim" || (cur?.kind === "curtain_down" && !cur.verified)) { this.chip.hidden = false; this.chip.className = "chip warn"; this.chip.textContent = "No test evidence"; }
    else this.chip.hidden = true;
    this.signal.hidden = s.signal === "ok" || !this.liveMode; this.signal.className = `signal ${s.signal}`; (this.signal.lastElementChild as HTMLElement).textContent = s.signal === "lost" ? "can't hear the agent" : "live";
    // acts
    let ai = 0; this.acts.forEach((a, i) => { if (s.t >= a.fromMs) ai = i; });
    if (ai !== this.lastAct) { this.lastAct = ai; this.actBtns.forEach((b, i) => { b.classList.toggle("on", i < ai); b.classList.toggle("now", i === ai); }); this.actLabels.forEach((l, i) => l.classList.toggle("now", i === ai)); }
    // log
    let ei = -1; this.logBtns.forEach((l, i) => { if (s.t >= l.ms) ei = i; });
    if (ei !== this.lastEv) { this.lastEv = ei; this.logBtns.forEach((l, i) => { l.btn.classList.toggle("done", i < ei); l.btn.classList.toggle("now", i === ei); }); this.logBtns[ei]?.btn.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
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
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
