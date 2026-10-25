import { Application, Container, RenderTexture } from "pixi.js";
import type { World } from "@agent-theatre/core";
import { WorldLayer } from "./world-layer.js";
import { iso } from "./iso.js";
import type { SetTheme } from "../sets/types.js";

/** A small still of the world in a given set, as a data URL. Used by the set picker. */
export async function previewSet(app: Application, world: World, theme: SetTheme, w = 360, h = 200): Promise<string> {
  const layer = new WorldLayer(world, theme);
  layer.update(0);
  const root = new Container();
  const pts = world.places.flatMap((p) => [iso(p.gx, p.gy), iso(p.gx + p.footprint, p.gy + p.footprint)]);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const bw = Math.max(...xs) - Math.min(...xs) + 160, bh = Math.max(...ys) - Math.min(...ys) + 170;
  const z = Math.min(w / bw, h / bh);
  root.scale.set(z);
  root.position.set(w / 2 - ((Math.min(...xs) + Math.max(...xs)) / 2) * z, h / 2 - ((Math.min(...ys) + Math.max(...ys)) / 2 - 20) * z);
  root.addChild(layer.container);
  // Render into our own texture so the live canvas is never touched.
  const rt = RenderTexture.create({ width: w, height: h, resolution: 1 });
  app.renderer.render({ container: root, target: rt, clear: true, clearColor: theme.sky[1] });
  const url = await app.renderer.extract.base64(rt);
  rt.destroy(true);
  layer.destroy();
  root.destroy({ children: true });
  return url;
}
