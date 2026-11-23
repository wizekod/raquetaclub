/**
 * Premios de fin de temporada (bases de la Escalera):
 *  - Más consistente: más veces 1.º del grupo 1.
 *  - Mejor ascenso: más veces subió de grupo.
 *  - Más competitivo: más partidos jugados (incluye los ganados por default:
 *    él sí se presentó).
 * Con empate se devuelven todos los empatados.
 */

export type SnapshotForAwards = {
  entry_id: string;
  level: number;
  position: number;
  movement: "up" | "down" | "stay" | "out" | null;
  played: number;
  won_default: number;
};

export type Award = { entry_ids: string[]; value: number };
export type Awards = { most_consistent: Award; best_ascent: Award; most_competitive: Award };

function best(counts: Map<string, number>): Award {
  let value = 0;
  for (const v of counts.values()) value = Math.max(value, v);
  if (value === 0) return { entry_ids: [], value: 0 };
  return { entry_ids: [...counts].filter(([, v]) => v === value).map(([id]) => id), value };
}

export function computeAwards(snapshots: SnapshotForAwards[]): Awards {
  const consistent = new Map<string, number>();
  const ascent = new Map<string, number>();
  const competitive = new Map<string, number>();
  const add = (m: Map<string, number>, id: string, n: number) => m.set(id, (m.get(id) ?? 0) + n);

  for (const s of snapshots) {
    add(consistent, s.entry_id, s.level === 1 && s.position === 1 ? 1 : 0);
    add(ascent, s.entry_id, s.movement === "up" ? 1 : 0);
    add(competitive, s.entry_id, s.played + s.won_default);
  }
  return { most_consistent: best(consistent), best_ascent: best(ascent), most_competitive: best(competitive) };
}
