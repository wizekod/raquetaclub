import type { TournamentConfig } from "./config";

/**
 * Escalera: tamaños de grupo, movimientos al cerrar una ronda y armado de la
 * siguiente. Los grupos van del nivel más alto (índice 0 = grupo 1) al más bajo.
 */

/**
 * Tamaños de grupo para `n` jugadores con tamaño ideal `size`: tantos grupos
 * como el redondeo de n/size, y el sobrante repartido de uno en uno empezando
 * por los grupos de abajo. Ej. con 5: 23 → [4,4,5,5,5], 22 → [5,5,6,6].
 */
export function groupSizes(n: number, size: number): number[] {
  if (n <= 0) return [];
  const k = Math.max(1, Math.round(n / size));
  const base = Math.floor(n / k);
  const extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i >= k - extra ? 1 : 0));
}

/** Parte una lista ordenada (mejor primero) en grupos con `groupSizes`. */
export function chunkIntoGroups<T>(ordered: T[], size: number): T[][] {
  const out: T[][] = [];
  let i = 0;
  for (const s of groupSizes(ordered.length, size)) {
    out.push(ordered.slice(i, i + s));
    i += s;
  }
  return out;
}

/** Sugerencia para la ronda 1: por siembra (los sin siembra al final, en el orden dado). */
export function suggestGroups<T extends { seed: number | null }>(entries: T[], size: number): T[][] {
  const sorted = entries
    .map((e, i) => ({ e, i }))
    .sort((x, y) => (x.e.seed ?? Infinity) - (y.e.seed ?? Infinity) || x.i - y.i)
    .map((x) => x.e);
  return chunkIntoGroups(sorted, size);
}

export type Movement = "up" | "down" | "stay" | "out";

/**
 * Movimiento de cada jugador según su posición final. `out` son los que dejan
 * el torneo (baja, expulsión): no cuentan y el siguiente ocupa su lugar.
 * El grupo 1 no asciende y el último no desciende. En un grupo chico los
 * ascensos tienen prioridad y nunca se mueve a todos: al menos uno se queda
 * si el grupo tiene 3 o más.
 */
export function ladderMovements(
  groups: string[][],
  config: Pick<TournamentConfig, "promote" | "relegate">,
  out: ReadonlySet<string> = new Set(),
): Map<string, Movement> {
  const moves = new Map<string, Movement>();
  groups.forEach((ordered, level) => {
    for (const id of ordered) if (out.has(id)) moves.set(id, "out");
    const active = ordered.filter((id) => !out.has(id));
    const n = active.length;
    const keep = n >= 3 ? 1 : 0;
    const up = level === 0 ? 0 : Math.min(config.promote, Math.max(0, n - keep));
    const down = level === groups.length - 1 ? 0 : Math.min(config.relegate, Math.max(0, n - keep - up));
    active.forEach((id, i) => moves.set(id, i < up ? "up" : i >= n - down ? "down" : "stay"));
  });
  return moves;
}

/**
 * Grupos de la siguiente ronda. Cada grupo nuevo se arma con los que bajan
 * del grupo de arriba, los que se quedan y los que suben del de abajo (en ese
 * orden: queda como siembra del grupo).
 *
 * Si nadie sale ni entra, se conservan los tamaños. Si cambia el número de
 * jugadores, la escalera completa (en ese orden, con los nuevos al final) se
 * vuelve a partir con `groupSizes`: los huecos se rellenan subiendo a los de
 * abajo, y los nuevos entran por el grupo más bajo.
 */
export function buildNextRound(
  groups: string[][],
  config: Pick<TournamentConfig, "promote" | "relegate" | "group_size">,
  out: ReadonlySet<string> = new Set(),
  newcomers: string[] = [],
): { groups: string[][]; movements: Map<string, Movement> } {
  const movements = ladderMovements(groups, config, out);
  const next: string[][] = groups.map(() => []);
  groups.forEach((ordered, level) => {
    const by = (m: Movement) => ordered.filter((id) => movements.get(id) === m);
    next[level - 1]?.push(...by("up")); // en el grupo 1 nadie tiene "up"
    next[level]!.push(...by("stay"));
    next[level + 1]?.push(...by("down"));
  });
  // Orden interno: los que bajaron, los que se quedan, los que subieron.
  // (sort es estable: dentro de cada bloque se conserva la posición final).
  const rank = (id: string) => ({ down: 0, stay: 1, up: 2, out: 3 })[movements.get(id) ?? "stay"];
  next.forEach((g) => g.sort((x, y) => rank(x) - rank(y)));

  if (!out.size && !newcomers.length) return { groups: next, movements };
  const ladder = [...next.flat(), ...newcomers];
  return { groups: chunkIntoGroups(ladder, config.group_size), movements };
}

/**
 * ¿Toca la baja automática? `activity` es, por ronda y de la más antigua a la
 * más reciente, cuántos partidos se presentó a jugar (jugados + ganados por
 * default). Las bases: "en caso de no jugar dos meses seguidos se darán de baja".
 */
export function shouldExpel(activity: number[], inactiveRounds: number): boolean {
  if (inactiveRounds <= 0 || activity.length < inactiveRounds) return false;
  return activity.slice(-inactiveRounds).every((n) => n === 0);
}
