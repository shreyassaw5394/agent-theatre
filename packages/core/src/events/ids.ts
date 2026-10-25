/**
 * Tiny monotonic id for events that have no natural id (hook-minted events).
 * Not a full ULID — just time-ordered and unique within a process, with no
 * dependency on node:crypto so core stays runtime-neutral.
 */
let last = 0;
let counter = 0;
const ALPHA = "0123456789abcdefghjkmnpqrstvwxyz";

export function mintId(now: number = Date.now()): string {
  if (now === last) counter++;
  else {
    last = now;
    counter = 0;
  }
  let t = now;
  let s = "";
  for (let i = 0; i < 10; i++) {
    s = ALPHA[t % 32] + s;
    t = Math.floor(t / 32);
  }
  return `ev_${s}${counter.toString(32).padStart(3, "0")}`;
}
