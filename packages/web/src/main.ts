import { Application } from "pixi.js";
import { direct, filesFromEvents, generateWorld, LAYOUTS, parseTranscript, relayoutWorld, type Beat, type World } from "@agent-theatre/core";
import { AudioEngine } from "./audio/engine.js";
import { ScenePlayer } from "./scene/player.js";
import { SETS, setById, suggestSets, type SetTheme } from "./sets/index.js";
import { StaticTransport, WsTransport, replayTransport, type Transport } from "./transport.js";
import { Panel } from "./ui/panel.js";
import { previewSet } from "./render/preview.js";

const q = new URLSearchParams(location.search);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const store = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

async function loadDemo(name: string): Promise<Transport> {
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
  let theme: SetTheme = setById(q.get("set"));
  let player: ScenePlayer | null = null;
  let rate = Number(q.get("rate")) || 1;
  let muted = store.get("at:muted") === "1";
  let ambience = store.get("at:ambience") !== "0";
  audio.setMuted(muted); audio.setAmbienceEnabled(ambience);

  const panel = new Panel(host, {
    onPlayPause: () => { if (!player) return; void audio.arm(); if (player.playing) player.pause(); else { if (player.state.t >= player.state.duration - 1) player.seek(0); player.play(); } },
    onSeek: (ms) => { player?.seek(ms); },
    onRate: () => { rate = rate >= 4 ? 1 : rate * 2; player?.setRate(rate); panel.setRate(rate); },
    onMute: () => { muted = !muted; audio.setMuted(muted); store.set("at:muted", muted ? "1" : "0"); panel.setMuted(muted); void audio.arm(); },
    onAmbience: () => { ambience = !ambience; audio.setAmbienceEnabled(ambience); store.set("at:ambience", ambience ? "1" : "0"); panel.setAmbience(ambience); void audio.arm(); },
    onPickSet: (id) => { theme = setById(id); if (player) { store.set(`at:set:${player.world.repoId}`, id); rebuild(); } },
    onShuffle: () => { const pool = suggestSets(payload?.world.profile).filter((s) => s.id !== theme.id); const pick = pool.slice(0, Math.max(3, Math.min(5, pool.length))); theme = pick[Math.floor(Math.random() * pick.length)] ?? SETS[0]!; if (player) { store.set(`at:set:${player.world.repoId}`, theme.id); rebuild(); } panel.showPicker(false); },
  });
  panel.setMuted(muted); panel.setAmbience(ambience); panel.setRate(rate);
  panel.liveMode = transport.mode === "live";
  // ?cinema=1 — the stage alone, full-bleed, muted, looping. Used by the site's hero and for embeds.
  const cinema = q.has("cinema");
  if (cinema) { document.documentElement.classList.add("cinema"); muted = true; audio.setMuted(true); }

  const app = new Application();
  await app.init({ resizeTo: panel.stageEl, antialias: true, backgroundAlpha: 1, background: theme.sky[1], preference: "webgl", resolution: Math.min(2, devicePixelRatio || 1), autoDensity: true });
  panel.stageEl.prepend(app.canvas);

  let payload: Parameters<Parameters<Transport["onReady"]>[0]>[0] | null = null;
  /** Every set shows the repo in its own arrangement, so twenty stages never read as one island recoloured. */
  const worldFor = (base: World, set: SetTheme): World => relayoutWorld(base, LAYOUTS[(base.seed + SETS.findIndex((s) => s.id === set.id) * 7) % LAYOUTS.length]!);
  let wasT = 0, wasPlaying = false;
  function rebuild(): void {
    if (!payload) return;
    if (player) { wasT = player.state.t; wasPlaying = player.playing; player.destroy(); }
    app.renderer.background.color = theme.sky[1];
    const world = worldFor(payload.world, theme);
    const beats = world === payload.world ? payload.beats : direct(payload.events, world);
    player = new ScenePlayer(app, world, theme, audio, reducedMotion, q.get("cast") ?? store.get(`at:cast:${payload.repoId}`));
    (globalThis as any).__agentTheatre = { app, get player() { return player; }, panel };
    panel.leadName = player.leadName;
    player.load(beats); player.setRate(rate); player.seek(wasT); if (wasPlaying) player.play();
    panel.loadTimeline(beats, payload.events, world);
  }

  transport.onReady((p) => {
    payload = p;
    const saved = store.get(`at:set:${p.repoId}`);
    const chosen = q.get("set") ?? saved;
    panel.profile = p.world.profile; panel.repoId = p.repoId;
    // default: the stage that fits what this repo is, chosen deterministically per repo
    if (chosen) theme = setById(chosen); else theme = suggestSets(p.world.profile, p.world.seed)[0] ?? SETS[0]!;
    panel.setTitle(p.repoId, q.get("episode") ?? undefined);
    panel.loadTimeline(p.beats, p.events, p.world);
    rebuild();
    const t = Number(q.get("t")); if (t > 0 && player) player.seek(t * 1000);
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
    panel.loadTimeline(player.world === payload.world ? payload.beats : direct(payload.events, player.world), payload.events, player.world);
    if (!player.playing) player.play();
    wake();
  });
  transport.onSignal?.((s) => player?.setSignal(s));

  // Render loop with a scheduler: runs while playing or settling; a paused, settled scene costs nothing.
  // `?step=<ms>` advances the scene by a fixed amount per frame (deterministic capture for clips/GIFs).
  const fixedStep = Number(q.get("step")) || 0;
  let last = performance.now(), settle = 0, scheduled = false, loopTimer: ReturnType<typeof setTimeout> | null = null;
  const frame = (now: number) => {
    scheduled = false;
    const dt = fixedStep || Math.min(50, now - last); last = now;
    if (player && !document.hidden) {
      if ((cinema || q.has("loop")) && player.state.t >= player.state.duration - 1 && player.state.duration > 0) { if (!loopTimer) loopTimer = setTimeout(() => { loopTimer = null; player?.seek(0); player?.play(); }, 1800); }
      player.update(dt);
      panel.update(player.state, player.world, (id) => player!.worldLayer.lampOf(id));
      if (player.playing) settle = 45; else settle--;
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
const boot = q.has("portrait") ? Promise.resolve<Transport>(new StaticTransport({ world: null as never, events: [], beats: [], repoId: "" })) : q.has("live") ? Promise.resolve<Transport>(new WsTransport()) : q.get("session") ? replayTransport(q.get("session")!) : loadDemo(q.get("demo") ?? "episode-1");
if (q.has("portrait")) portrait(q.get("portrait")!).catch((err) => { host.textContent = `Could not start: ${err}`; });
else boot.then((t) => mount(host, t)).catch((err) => { host.textContent = `Could not start: ${err}`; });
