import { Application } from "pixi.js";
import { direct, filesFromEvents, generateWorld, parseTranscript, type Beat } from "@agent-theatre/core";
import { AudioEngine } from "./audio/engine.js";
import { ScenePlayer } from "./scene/player.js";
import { SETS, setById, type SetTheme } from "./sets/index.js";
import { StaticTransport, type Transport } from "./transport.js";
import { Panel } from "./ui/panel.js";

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
  let theme: SetTheme = setById(q.get("set"));
  let player: ScenePlayer | null = null;
  let rate = Number(q.get("rate")) || 1;
  let muted = store.get("at:muted") === "1";
  audio.setMuted(muted);

  const panel = new Panel(host, {
    onPlayPause: () => { if (!player) return; void audio.arm(); if (player.playing) player.pause(); else { if (player.state.t >= player.state.duration - 1) player.seek(0); player.play(); } },
    onSeek: (ms) => { player?.seek(ms); },
    onRate: () => { rate = rate >= 4 ? 1 : rate * 2; player?.setRate(rate); panel.setRate(rate); },
    onMute: () => { muted = !muted; audio.setMuted(muted); store.set("at:muted", muted ? "1" : "0"); panel.setMuted(muted); void audio.arm(); },
    onPickSet: (id) => { theme = setById(id); if (player) { store.set(`at:set:${player.world.repoId}`, id); rebuild(); } },
    onShuffle: () => { const others = SETS.filter((s) => s.id !== theme.id); theme = others[Math.floor(Math.random() * others.length)]!; panel.showPicker(true, theme.id); },
  });
  panel.setMuted(muted); panel.setRate(rate);
  panel.liveMode = transport.mode === "live";

  const app = new Application();
  await app.init({ resizeTo: panel.stageEl, antialias: true, backgroundAlpha: 1, background: theme.sky[1], preference: "webgl", resolution: Math.min(2, devicePixelRatio || 1), autoDensity: true });
  panel.stageEl.prepend(app.canvas);

  let payload: Parameters<Parameters<Transport["onReady"]>[0]>[0] | null = null;
  let wasT = 0, wasPlaying = false;
  function rebuild(): void {
    if (!payload) return;
    if (player) { wasT = player.state.t; wasPlaying = player.playing; player.destroy(); }
    app.renderer.background.color = theme.sky[1];
    player = new ScenePlayer(app, payload.world, theme, audio, reducedMotion);
    player.load(payload.beats); player.setRate(rate); player.seek(wasT); if (wasPlaying) player.play();
  }

  transport.onReady((p) => {
    payload = p;
    const saved = store.get(`at:set:${p.repoId}`);
    const chosen = q.get("set") ?? saved;
    if (chosen) theme = setById(chosen); else theme = SETS[Math.floor(Math.random() * SETS.length)]!;
    panel.setTitle(p.repoId, q.get("episode") ?? undefined);
    panel.loadTimeline(p.beats, p.events, p.world);
    rebuild();
    const t = Number(q.get("t")); if (t > 0 && player) player.seek(t * 1000);
    if (!chosen && !q.has("t")) panel.showPicker(true, theme.id);
    if (q.get("paused") !== "1" && !reducedMotion) { player?.play(); }
    if (reducedMotion && !q.has("t")) player?.seek(Math.min(player.state.duration, 25_400));
  });
  transport.onBeats((beats: Beat[]) => { player?.append(beats); });
  transport.onSignal?.((s) => player?.setSignal(s));

  // Render loop: only while playing or something is animating; paused + hidden = zero work.
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(50, now - last); last = now;
    if (player && !document.hidden) {
      player.update(dt);
      panel.update(player.state, player.world, (id) => player!.worldLayer.lampOf(id));
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  document.addEventListener("visibilitychange", () => { if (document.hidden) app.ticker.stop(); else { app.ticker.start(); last = performance.now(); } });
}

const demo = q.get("demo") ?? "episode-1";
loadDemo(demo).then((t) => mount(document.getElementById("app")!, t)).catch((err) => { document.getElementById("app")!.textContent = `Could not load ${demo}: ${err}`; });
