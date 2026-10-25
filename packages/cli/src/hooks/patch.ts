/**
 * Non-destructive edits to ~/.claude/settings.json. Pure text → text so it is
 * trivially testable; the caller handles files and backups.
 *
 * // suite: candidate for shared package (Debug Anything has the same shape)
 */
export const HOOK_MARKER = "agent-theatre-hook.mjs";
/** Events we observe. No matcher on PostToolUse: every tool is a beat. */
export const HOOK_EVENTS: ReadonlyArray<{ event: string; matcher?: string }> = [
  { event: "SessionStart" },
  { event: "PostToolUse" },
  { event: "PostToolUseFailure" },
  { event: "SubagentStart" },
  { event: "SubagentStop" },
  { event: "Notification" },
  { event: "Stop" },
  { event: "SessionEnd" },
];
export const HOOK_TIMEOUT_S = 5;

type Settings = Record<string, unknown> & { hooks?: Record<string, unknown[]> };

function parse(existing: string | null): Settings {
  if (existing === null || existing.trim() === "") return {};
  try {
    const obj = JSON.parse(existing);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("not an object");
    return obj as Settings;
  } catch {
    throw new Error("existing settings.json is not valid JSON; refusing to overwrite it");
  }
}
const isOurs = (group: unknown): boolean => {
  const g = group as { hooks?: Array<{ command?: unknown }> };
  return Array.isArray(g?.hooks) && g.hooks.some((h) => typeof h?.command === "string" && h.command.includes(HOOK_MARKER));
};

export function patchSettings(existing: string | null, scriptPath: string): { next: string; changed: boolean } {
  const obj = parse(existing);
  const hooks = (obj.hooks ??= {});
  const cmd = `node "${scriptPath}"`;
  let changed = false;
  for (const { event, matcher } of HOOK_EVENTS) {
    const list = (hooks[event] ??= []);
    const mine = list.find(isOurs) as { hooks: Array<{ command: string; timeout?: number }> } | undefined;
    if (mine) {
      // keep the path current if the install location moved
      for (const h of mine.hooks) if (h.command.includes(HOOK_MARKER) && h.command !== cmd) { h.command = cmd; changed = true; }
      continue;
    }
    list.push({ ...(matcher ? { matcher } : {}), hooks: [{ type: "command", command: cmd, timeout: HOOK_TIMEOUT_S }] });
    changed = true;
  }
  return { next: JSON.stringify(obj, null, 2) + "\n", changed };
}

export function unpatchSettings(existing: string | null): { next: string; changed: boolean } {
  const obj = parse(existing);
  let changed = false;
  const hooks = obj.hooks;
  if (hooks) {
    for (const event of Object.keys(hooks)) {
      const list = hooks[event];
      if (!Array.isArray(list)) continue;
      const kept = list.filter((g) => !isOurs(g));
      if (kept.length !== list.length) changed = true;
      if (kept.length) hooks[event] = kept;
      else delete hooks[event];
    }
    if (Object.keys(hooks).length === 0) delete obj.hooks;
  }
  return { next: JSON.stringify(obj, null, 2) + "\n", changed };
}

export function hasOurHooks(existing: string | null): boolean {
  try {
    const obj = parse(existing);
    return Object.values(obj.hooks ?? {}).some((l) => Array.isArray(l) && l.some(isOurs));
  } catch {
    return false;
  }
}
