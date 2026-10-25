/**
 * Test helper and runtime guard: given events and a list of strings that must
 * never appear (prompts, file contents, command bodies), return the ones found.
 */
export function findLeaks(events: unknown, markers: readonly string[]): string[] {
  const hay = JSON.stringify(events);
  return markers.filter((m) => m.length > 0 && hay.includes(m));
}
