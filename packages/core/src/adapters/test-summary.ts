/**
 * Parse test-runner summary lines out of command output. Heuristic by nature;
 * an unrecognised runner yields null and the caller falls back to exit status.
 * Only counts leave this function — never the output text.
 */
export interface TestSummary {
  passed: number;
  failed: number;
  skipped?: number;
  framework: string;
}

const num = (s: string | undefined) => (s ? parseInt(s, 10) : 0);

export function parseTestSummary(output: string): TestSummary | null {
  const tail = output.length > 20_000 ? output.slice(-20_000) : output;

  // vitest:  "Tests  3 failed | 21 passed | 2 skipped (26)"  or "Tests  24 passed (24)"
  let m = tail.match(/Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed(?:\s*\|\s*(\d+)\s+skipped)?/);
  if (m) return { failed: num(m[1]), passed: num(m[2]), ...(m[3] ? { skipped: num(m[3]) } : {}), framework: "vitest" };
  m = tail.match(/Tests\s+(\d+)\s+failed\s*\((\d+)\)/);
  if (m) return { failed: num(m[1]), passed: Math.max(0, num(m[2]) - num(m[1])), framework: "vitest" };

  // jest:  "Tests:       2 failed, 22 passed, 1 skipped, 25 total"
  m = tail.match(/Tests:\s+(?:(\d+)\s+failed,\s*)?(?:(\d+)\s+skipped,\s*)?(\d+)\s+passed,\s*(?:(\d+)\s+skipped,\s*)?\d+\s+total/);
  if (m) return { failed: num(m[1]), passed: num(m[3]), ...((m[2] ?? m[4]) ? { skipped: num(m[2] ?? m[4]) } : {}), framework: "jest" };
  m = tail.match(/Tests:\s+(\d+)\s+failed,\s*\d+\s+total/);
  if (m) return { failed: num(m[1]), passed: 0, framework: "jest" };

  // pytest:  "==== 2 failed, 22 passed, 1 skipped in 1.23s ====" / "==== 24 passed in 0.5s ===="
  m = tail.match(/=+\s*(?:(\d+)\s+failed,?\s*)?(?:(\d+)\s+passed,?\s*)?(?:(\d+)\s+skipped,?\s*)?(?:\d+\s+(?:error|errors|warnings?|deselected|xfailed|xpassed),?\s*)*in\s+[\d.]+s/);
  if (m && (m[1] || m[2])) return { failed: num(m[1]), passed: num(m[2]), ...(m[3] ? { skipped: num(m[3]) } : {}), framework: "pytest" };

  // go test:  "ok   pkg  0.12s" lines and "--- FAIL:" lines; summary "FAIL" / "PASS"
  if (/^--- (?:PASS|FAIL):/m.test(tail) || /^(?:ok|FAIL)\s+\S+\s+(?:[\d.]+s|\(cached\))/m.test(tail)) {
    const failed = (tail.match(/^--- FAIL:/gm) ?? []).length || (tail.match(/^FAIL\s+\S+\s+[\d.]+s/gm) ?? []).length;
    const passed = (tail.match(/^--- PASS:/gm) ?? []).length || (tail.match(/^ok\s+\S+/gm) ?? []).length;
    return { failed, passed, framework: "go" };
  }

  // cargo test:  "test result: ok. 24 passed; 0 failed; 1 ignored"
  m = tail.match(/test result:\s*\w+\.\s*(\d+)\s+passed;\s*(\d+)\s+failed;\s*(\d+)\s+ignored/);
  if (m) return { passed: num(m[1]), failed: num(m[2]), skipped: num(m[3]), framework: "cargo" };

  // mocha:  "  24 passing (1s)" / "  2 failing"
  const mp = tail.match(/^\s*(\d+)\s+passing\b/m);
  const mf = tail.match(/^\s*(\d+)\s+failing\b/m);
  if (mp || mf) {
    const ms = tail.match(/^\s*(\d+)\s+pending\b/m);
    return { passed: num(mp?.[1]), failed: num(mf?.[1]), ...(ms ? { skipped: num(ms[1]) } : {}), framework: "mocha" };
  }

  // playwright:  "  24 passed (12s)" / "  2 failed"
  const pp = tail.match(/^\s*(\d+)\s+passed\s*\(/m);
  const pf = tail.match(/^\s*(\d+)\s+failed\b/m);
  if (pp || pf) return { passed: num(pp?.[1]), failed: num(pf?.[1]), framework: "playwright" };

  return null;
}
