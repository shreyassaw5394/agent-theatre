import { Application } from "pixi.js";
import { direct, filesFromEvents, generateWorld, LAYOUTS, parseTranscript, relayoutWorld, type Beat, type World } from "@agent-theatre/core";
import { AudioEngine } from "./audio/engine.js";
import { ScenePlayer } from "./scene/player.js";
import { SETS, setById, suggestSets, type SetTheme } from "./sets/index.js";
// VS Code webviews (and any strict CSP) forbid unsafe-eval; this makes Pixi build its shaders without `new Function`.
import "pixi.js/unsafe-eval";
import { HostTransport, StaticTransport, WsTransport, replayTransport, type Transport } from "./transport.js";
import { Panel } from "./ui/panel.js";
import { previewSet } from "./render/preview.js";

// a host (the VS Code extension) injects the query; its webview has its own location.search, so the injected one wins
const q = new URLSearchParams((globalThis as { __AT_QUERY?: string }).__AT_QUERY ?? location.search);
const BASE = q.get("base") ?? "";
// acquireVsCodeApi may be called once per page: one handle, shared by the transport and the panel
const VS = (globalThis as { acquireVsCodeApi?: () => { postMessage: (m: unknown) => void } }).acquireVsCodeApi?.() ?? null;
(globalThis as { __vsapi?: unknown }).__vsapi = VS;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

interface DemoInfo { id: string; title: string; kind: string; set: string; blurb: string }
/** The bundled episodes. `any` picks one at random (the site's hero does this). */
async function demoInfo(name: string): Promise<DemoInfo | null> {
  try {
    const list = await (await fetch("/demo/demos.json")).json() as DemoInfo[];
    if (name === "any") return list[Math.floor(Math.random() * list.length)] ?? null;
    return list.find((d) => d.id === name) ?? null;
  } catch { return null; }
}
async function loadDemo(name: string): Promise<Transport> {
  const info = await demoInfo(name);
  if (info) { name = info.id; if (!q.has("episode")) q.set("episode", `${info.title} · ${info.kind}`); if (!q.has("set") && q.has("cinema")) q.set("set", info.set); }
  const text = await (await fetch(`/demo/${name}.jsonl`)).text();
  const { events } = parseTranscript(text);
  const inferred = filesFromEvents(events);
  // A real file tree when the host provides one (CLI/extension scan the repo); events-only otherwise.
  let files = inferred.files, repoId = (events[0] as { repoId?: string } | undefined)?.repoId ?? name;
  try { const extra = await (await fetch(`/demo/${name}.files.json`)).json() as { repoId?: string; files: typeof files }; if (Array.isArray(extra.files)) { const known = new Set(extra.files.map((f) => f.path)); files = [...extra.files, ...inferred.files.filter((f) => !known.has(f.path))]; if (extra.repoId) repoId = extra.repoId; } } catch { /* no tree; events-only world */ }
  const world = generateWorld({ repoId, files, touched: inferred.touched });
  const beats = direct(events, world);
  return new StaticTransport({ world, events, beats, repoId });
}

export async function mount(host: HTMLElement, transport: Transport): Promise<void> {
  const audio = new AudioEngine();
  let wake: () => void = () => {};
  const unlockAudio = async () => { await audio.arm(); if (audio.ready) player?.audioReady(); };
  // any first gesture on the page unlocks audio and starts the stage's ambience. The gesture that unlocks
  // may itself be a click on a sound toggle: that click must not also flip the toggle (it read "on" — keep it on).
  let justUnlocked = false;
  for (const ev of ["pointerdown", "keydown"]) addEventListener(ev, () => { if (!audio.ready) { justUnlocked = true; setTimeout(() => { justUnlocked = false; }, 700); void unlockAudio(); } }, { passive: true });
  let theme: SetTheme = setById(q.get("set"));
  let player: ScenePlayer | null = null;
  let rate = Number(q.get("rate")) || 1;
  // sound starts off; the person turns it on (a nudge points at the buttons until they do)
  let muted = store.get("at:muted") !== "0";
  let ambience = store.get("at:ambience") === "1";
  audio.setMuted(muted); audio.setAmbienceEnabled(ambience);

  const panel = new Panel(host, {
    onPlayPause: () => {
      if (!player) return; void unlockAudio();
      const atEnd = player.state.t >= player.state.duration - 1;
      // live at the edge: there is nothing to replay — stay live
      if (transport.mode === "live" && atEnd) { followLive = true; player.seek(Math.max(0, player.state.duration - 1)); player.play(); return; }
      if (player.playing) player.pause(); else { if (atEnd && transport.mode !== "live") player.seek(0); player.play(); }
    },
    // scrubbing back on a live stage means "let me watch this"; the stage stops yanking to the edge until Go live
    onSeek: (ms) => { if (player && transport.mode === "live") followLive = ms >= player.state.duration - 1500; player?.seek(ms); },
    onRate: () => { rate = rate >= 4 ? 1 : rate * 2; player?.setRate(rate); panel.setRate(rate); },
    // The first click on either toggle may be the gesture that unlocks audio: honour the state it already shows instead of flipping it.
    onMute: () => { if (!audio.ready || justUnlocked) { void unlockAudio(); if (muted) { muted = false; audio.setMuted(false); store.set("at:muted", "0"); panel.setMuted(false); } panel.nudgeSeen(); return; } muted = !muted; panel.nudgeSeen(); audio.setMuted(muted); store.set("at:muted", muted ? "1" : "0"); panel.setMuted(muted); },
    onAmbience: () => { if (!audio.ready || justUnlocked) { void unlockAudio(); if (!ambience) { ambience = true; audio.setAmbienceEnabled(true); store.set("at:ambience", "1"); panel.setAmbience(true); } panel.nudgeSeen(); return; } ambience = !ambience; panel.nudgeSeen(); audio.setAmbienceEnabled(ambience); store.set("at:ambience", ambience ? "1" : "0"); panel.setAmbience(ambience); },
    onPickSet: (id) => { theme = setById(id); if (player) { store.set(`at:set:${player.world.repoId}`, id); rebuild(); } },
    onGoLive: () => { followLive = true; if (player) { player.seek(Math.max(0, player.state.duration - 1)); player.play(); } wake(); },
    onOverview: (on) => { player?.setOverview(on); wake(); },
    onZoom: (f) => { player?.zoomBy(f); wake(); },
    onExport: () => { void exportClip(); },
    onPrompt: async (text) => {
      if (VS) { VS.postMessage({ type: "prompt", text }); return "sent — watch the stage"; }
      try {
        const r = await fetch(`${BASE}/api/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
        const j = await r.json() as { ok?: boolean; error?: string };
        return j.ok ? "sent — watch the stage" : `couldn't send: ${j.error ?? r.status}`;
      } catch (e) { return `couldn't send: ${String(e)}`; }
    },
    onShuffle: () => { const pool = suggestSets(payload?.world.profile).filter((s) => s.id !== theme.id); const pick = pool.slice(0, Math.max(3, Math.min(5, pool.length))); theme = pick[Math.floor(Math.random() * pick.length)] ?? SETS[0]!; if (player) { store.set(`at:set:${player.world.repoId}`, theme.id); rebuild(); } panel.showPicker(false); },
  });
  panel.setMuted(muted); panel.setAmbience(ambience); panel.setRate(rate);
  if (muted && ambience === false && !store.get("at:nudged")) panel.showNudge();
  panel.liveMode = transport.mode === "live";
  // ?cinema=1 — the stage alone, full-bleed, muted, looping. Used by the site's hero and for embeds.
  const cinema = q.has("cinema");
  if (cinema) { document.documentElement.classList.add("cinema"); muted = true; audio.setMuted(true); }

  // Export: record the stage canvas plus the synthesized sound to a .webm the person can post
  let recorder: MediaRecorder | null = null;
  async function exportClip(): Promise<void> {
    if (recorder) { recorder.stop(); return; }
    await unlockAudio();
    const canvas = app.canvas as HTMLCanvasElement;
    const stream = canvas.captureStream(30);
    const a = audio.captureStream(); if (a) for (const t of a.getAudioTracks()) stream.addTrack(t);
    const chunks: Blob[] = [];
    // mp4 (H.264/AAC) where the browser can mux it — Chrome 126+, Safari — else webm; both post fine on X and LinkedIn
    const mime = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      recorder = null; panel.exportBtn.textContent = "Export clip";
      const blob = new Blob(chunks, { type: mime.split(";")[0] || "video/webm" });
      const name = `agent-theatre-${(payload?.repoId ?? "stage").split(/[/\\]/).pop()}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${ext}`;
      const caption = `${player?.leadName ?? "The agent"} on the ${theme.name} stage — ${(payload?.repoId ?? "my repo").split(/[/\\]/).pop()} in Agent Theatre. Watch your coding agent work, as a film, not a log. https://agenttheatre.dev`;
      panel.showShare({ blob, name, caption });
    };
    recorder.start(500);
    panel.exportBtn.textContent = "■ Stop & save";
    if (player && !player.playing) player.play();
  }

  const app = new Application();
  await app.init({ resizeTo: panel.stageEl, antialias: true, backgroundAlpha: 1, background: theme.sky[1], preference: "webgl", resolution: Math.min(2, devicePixelRatio || 1), autoDensity: true });
  panel.stageEl.prepend(app.canvas);

  let payload: Parameters<Parameters<Transport["onReady"]>[0]>[0] | null = null;
  /** Every set shows the repo in its own arrangement, so twenty stages never read as one island recoloured. */
  const worldFor = (base: World, set: SetTheme): World => relayoutWorld(base, LAYOUTS[(base.seed + SETS.findIndex((s) => s.id === set.id) * 7) % LAYOUTS.length]!);
  let wasT = 0, wasPlaying = false, lastThemeId = "", followLive = true;
  function rebuild(): void {
    if (!payload) return;
    if (player) { wasT = player.state.t; wasPlaying = player.playing; player.destroy(); }
    app.renderer.background.color = theme.sky[1];
    const world = worldFor(payload.world, theme);
    const beats = world === payload.world ? payload.beats : direct(payload.events, world);
    player = new ScenePlayer(app, world, theme, audio, reducedMotion, q.get("cast") ?? store.get(`at:cast:${payload.repoId}`));
    (globalThis as any).__agentTheatre = { app, get player() { return player; }, panel };
    VS?.postMessage({ type: "ready", places: world.places.length });
    panel.leadName = player.leadName;
    panel.hitTester = (x, y) => player?.hitTest(x, y) ?? null;
    player.load(beats); player.setRate(rate);
    // a new set is a new performance: start from the top (a same-set rebuild keeps its place)
    if (player.theme.id !== lastThemeId) { player.seek(0); player.play(); } else { player.seek(wasT); if (wasPlaying) player.play(); }
    lastThemeId = player.theme.id;
    panel.loadTimeline(beats, payload.events, world);
  }

  transport.onReady((p) => {
    payload = p;
    const saved = store.get(`at:set:${p.repoId}`);
    const chosen = q.get("set") ?? saved;
    panel.profile = p.world.profile; panel.repoId = p.repoId; panel.cwd = p.cwd ?? ""; panel.elsewhere = p.elsewhere ?? "";
    // default: the stage that fits what this repo is, chosen deterministically per repo
    if (chosen) theme = setById(chosen); else theme = suggestSets(p.world.profile, p.world.seed)[0] ?? SETS[0]!;
    panel.setTitle(p.repoId, q.get("episode") ?? undefined);
    if (VS) panel.promptEnabled = true;
    else if (transport.mode === "live") { void fetch(`${BASE}/api/prompt`).then((r) => r.json()).then((j: { available?: boolean }) => { panel.promptEnabled = !!j.available; }).catch(() => {}); }
    panel.loadTimeline(p.beats, p.events, p.world);
    rebuild();
    const t = Number(q.get("t")); if (t > 0 && player) player.seek(t * 1000);
    // live: don't replay history on open — start a few seconds before the live edge
    if (transport.mode === "live" && player && !q.has("t") && player.state.duration > 1500) player.seek(Math.max(0, player.state.duration - 1200));
    // real previews for the picker, rendered from this repo's world in each set
    const buildPreviews = (async () => { if (q.has("nopreview")) return; for (const s of SETS) { try { panel.previews.set(s.id, await previewSet(app, worldFor(p.world, s), s)); } catch (err) { console.warn("set preview failed", s.id, err); } } if (panel.pickerOpen) panel.showPicker(true, theme.id); wake(); })();
    if (!chosen && !q.has("t")) void buildPreviews.then(() => panel.showPicker(true, theme.id));
    if (q.get("paused") !== "1" && !reducedMotion) { player?.play(); }
    if (cinema && player && !reducedMotion) { player.play(); }
    if (reducedMotion && !q.has("t")) player?.seek(Math.min(player.state.duration, 25_400));
  });
  transport.onBeats((beats: Beat[], events) => {
    if (!player || !payload) return;
    payload.beats.push(...beats); payload.events.push(...events);
    if (player.world === payload.world) player.append(beats);
    else { const all = direct(payload.events, player.world); player.append(all.slice(player.beatCount)); }
    // real time: a live stage shows what just happened now, not after replaying the backlog — jump to the newest beat
    const newest = Math.max(...beats.map((b) => b.atMs), 0);
    // let the current walk finish: only jump when well behind; otherwise the loop below catches up gently
    if (followLive && player.state.duration - player.state.t > 10000 && newest > player.state.t) player.seek(newest);
    panel.loadTimeline(player.world === payload.world ? payload.beats : direct(payload.events, player.world), payload.events, player.world);
    if (!player.playing) player.play();
    wake();
  });
  transport.onSignal?.((s) => player?.setSignal(s));
  transport.onElsewhere?.((cwd) => { panel.elsewhere = cwd; wake(); });

  // Render loop with a scheduler: runs while playing or settling; a paused, settled scene costs nothing.
  // `?step=<ms>` advances the scene by a fixed amount per frame (deterministic capture for clips/GIFs).
  const fixedStep = Number(q.get("step")) || 0;
  let last = performance.now(), settle = 0, scheduled = false, loopTimer: ReturnType<typeof setTimeout> | null = null;
  const frame = (now: number) => {
    scheduled = false;
    const dt = fixedStep || Math.min(50, now - last); last = now;
    if (player && !document.hidden) {
      // live: stay on the live edge. Open late → jump near the end; fall behind → catch up at up to 4x, then settle at 1x.
      if (transport.mode === "live" && player.playing && followLive) {
        const behind = player.state.duration - player.state.t;
        // catch up smoothly: the further behind, the faster (1x → 2.5x over ~6 s of deficit); never a cut unless hopelessly behind
        if (behind > 1500) { const want = Math.min(2.5, 1 + behind / 4000); if (Math.abs(player.state.rate - want) > 0.05) player.setRate(want); }
        else if (player.state.rate !== rate) player.setRate(rate);
      }
      if ((cinema || q.has("loop")) && player.state.t >= player.state.duration - 1 && player.state.duration > 0) { if (!loopTimer) loopTimer = setTimeout(() => { loopTimer = null; player?.seek(0); player?.play(); }, 600); }
      player.update(dt);
      panel.update(player.state, player.world, (id) => player!.worldLayer.lampOf(id));
      // live stages never go to sleep: the character keeps thinking between events
      if (player.playing || transport.mode === "live") settle = 45; else settle--;
    }
    if ((player?.playing || settle > 0) && !document.hidden) schedule();
  };
  const schedule = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(frame); } };
  wake = () => { settle = 45; last = performance.now(); schedule(); };
  wake();
  for (const ev of ["pointerdown", "keydown", "resize"]) addEventListener(ev, wake, { passive: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) wake(); });
  const origPlay = ScenePlayer.prototype.play; ScenePlayer.prototype.play = function (this: ScenePlayer) { origPlay.call(this); wake(); };
  const origSeek = ScenePlayer.prototype.seek; ScenePlayer.prototype.seek = function (this: ScenePlayer, ms: number) { origSeek.call(this, ms); wake(); };
}

// ?portrait=<castId> — one character, idle, on a transparent canvas. The site renders the cast from this.
async function portrait(id: string): Promise<void> {
  const { Application } = await import("pixi.js");
  const { Pip } = await import("./scene/pip.js");
  const { castById, CAST } = await import("./scene/cast.js");
  const spec = castById(id) ?? CAST[0]!;
  const theme = setById(q.get("set") ?? "island");
  document.documentElement.style.background = "transparent"; document.body.style.background = "transparent"; document.body.style.margin = "0";
  const app = new Application();
  await app.init({ width: 320, height: 320, backgroundAlpha: 0, antialias: true, resolution: 2, autoDensity: true, preference: "webgl" });
  document.body.replaceChildren(app.canvas);
  if (id === "gremlin") {
    const { Gremlin } = await import("./scene/gremlin.js");
    const g = new Gremlin("g", theme, false);
    g.scale = 7; g.x = 160; g.y = 250; app.stage.addChild(g.container);
    app.ticker.add((tk) => g.update(tk.deltaMS));
  } else {
    const pip = new Pip(theme, false, spec);
    pip.container.scale.set(6 * spec.size); pip.pose.x = 160; pip.pose.y = 272;
    app.stage.addChild(pip.container);
    pip.pose.mood = (q.get("mood") ?? "curious") as typeof pip.pose.mood;
    app.ticker.add((tk) => pip.update(tk.deltaMS));
  }
  (globalThis as any).__agentTheatre = { app, player: true };
}

// Mode: ?live=1 (CLI live), ?session=<id> (CLI replay), else a bundled demo.
const host = document.getElementById("app")!;
const boot = q.has("portrait") ? Promise.resolve<Transport>(new StaticTransport({ world: null as never, events: [], beats: [], repoId: "" })) : VS && (q.has("live") || q.get("session")) ? Promise.resolve<Transport>(new HostTransport(VS, q.get("session"))) : q.has("live") ? Promise.resolve<Transport>(new WsTransport(BASE)) : q.get("session") ? replayTransport(q.get("session")!, BASE) : loadDemo(q.get("demo") ?? "episode-1");
if (q.has("portrait")) portrait(q.get("portrait")!).catch((err) => { host.textContent = `Could not start: ${err}`; });
else boot.then((t) => mount(host, t)).catch((err) => { host.textContent = `Could not start: ${err}${BASE ? ` (server: ${BASE})` : ""}`; });
