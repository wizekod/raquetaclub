/** "6-4 3-6 10-7" desde el punto de vista de A, o de B con `flip`. */
export function formatScore(score: unknown, flip = false): string {
  const sets = (score as { sets?: unknown } | null)?.sets;
  if (!Array.isArray(sets)) return "";
  return sets
    .filter((s): s is [number, number] => Array.isArray(s) && s.length === 2)
    .map(([a, b]) => (flip ? `${b}-${a}` : `${a}-${b}`))
    .join(" ");
}
