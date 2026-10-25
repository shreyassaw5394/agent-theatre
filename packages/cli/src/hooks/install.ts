import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { hasOurHooks, patchSettings, unpatchSettings } from "./patch.js";
import { HOOK_SCRIPT } from "./script.js";

export interface InstallPaths { settings: string; home: string; script: string; backup: string }
export function installPaths(env: NodeJS.ProcessEnv = process.env): InstallPaths {
  const claude = env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  const home = env.AGENT_THEATRE_HOME || join(homedir(), ".agent-theatre");
  const settings = join(claude, "settings.json");
  return { settings, home, script: join(home, "hooks", "agent-theatre-hook.mjs"), backup: `${settings}.bak-agent-theatre` };
}
const read = (p: string): string | null => (existsSync(p) ? readFileSync(p, "utf8") : null);

/** Writes the hook script, then merges our entries into settings.json (backup first). Idempotent. */
export function installHooks(paths = installPaths()): { changed: boolean; backup: string | null } {
  mkdirSync(join(paths.home, "hooks"), { recursive: true });
  writeFileSync(paths.script, HOOK_SCRIPT, { mode: 0o755 });
  chmodSync(paths.script, 0o755);
  const existing = read(paths.settings);
  const { next, changed } = patchSettings(existing, paths.script);
  let backup: string | null = null;
  if (changed) {
    if (existing !== null) { copyFileSync(paths.settings, paths.backup); backup = paths.backup; }
    mkdirSync(join(paths.settings, ".."), { recursive: true });
    writeFileSync(paths.settings, next);
  }
  return { changed, backup };
}

/** Removes only our entries. Leaves the backup file in place for the user. */
export function uninstallHooks(paths = installPaths()): { changed: boolean } {
  const existing = read(paths.settings);
  if (existing === null) return { changed: false };
  const { next, changed } = unpatchSettings(existing);
  if (changed) { copyFileSync(paths.settings, paths.backup); writeFileSync(paths.settings, next); }
  return { changed };
}

export function hooksStatus(paths = installPaths()): { installed: boolean; scriptPresent: boolean; settings: string } {
  return { installed: hasOurHooks(read(paths.settings)), scriptPresent: existsSync(paths.script), settings: paths.settings };
}
