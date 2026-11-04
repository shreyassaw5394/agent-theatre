/**
 * Offsets (stage px) for n actors sharing one standing spot: the first stays in the centre, the rest step out
 * alternately left and right, and every four more start a row behind. Pure and deterministic, so replays and
 * exports put everyone in the same place every time.
 */
export function slotOffset(i: number, n: number, cell = 18): { dx: number; dy: number } {
  if (n <= 1 || i <= 0) return { dx: 0, dy: 0 };
  const row = Math.floor((i - 1) / 4), k = (i - 1) % 4, side = k % 2 ? 1 : -1, step = Math.floor(k / 2) + 1;
  return { dx: side * step * cell, dy: -row * cell * 0.5 - (step - 1) * 2 };
}
