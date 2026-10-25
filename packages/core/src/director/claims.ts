/**
 * Claim check lexicon. Deliberately conservative and deliberately a plain
 * list so it can be reviewed and extended in a PR. Only the tail of a message
 * is examined, because conclusions come last. The text itself is never stored.
 */
export const SUCCESS_LEXICON: readonly RegExp[] = [
  /\ball (?:\d+ )?tests? (?:are )?pass(?:ing|ed)?\b/i,
  /\btests? (?:are |is )?(?:now )?(?:passing|green)\b/i,
  /\b(?:is|are|it's|that's|everything(?:'s| is)) (?:now )?(?:fixed|working|done|complete|resolved)\b/i,
  /\bshould (?:now )?work\b/i,
  /\bworks now\b/i,
  /\b(?:done|complete|completed|fixed|resolved|shipped|implemented)[.!]/i,
  /✅/,
];

export const HEDGE_LEXICON: readonly RegExp[] = [
  /\bnot (?:yet )?(?:done|fixed|working|tested|verified|complete)\b/i,
  /\bstill (?:fail|broken|not)/i,
  /\b(?:could ?n[’']?t|cannot|can ?not|unable to|wasn[’']?t able)\b/i,
  /\bfail(?:ed|ing|s)\b/i,
  /\bTODO\b/,
  /\bhaven[’']?t (?:run|tested|verified|checked)/i,
  /\buntested\b/i,
  /\bI did not (?:run|test|verify)/i,
];

const TAIL = 600;

export function claimsSuccess(text: string | undefined | null): boolean {
  if (!text) return false;
  const tail = text.length > TAIL ? text.slice(-TAIL) : text;
  if (HEDGE_LEXICON.some((r) => r.test(tail))) return false;
  return SUCCESS_LEXICON.some((r) => r.test(tail));
}
