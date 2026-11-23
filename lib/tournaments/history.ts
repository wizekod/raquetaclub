/**
 * Rankings (lógica pura): posición global en la escalera, historial de
 * grupos por ronda y récord de un jugador.
 */

export type Move = "up" | "down" | "stay" | "out" | null;

/**
 * Escalera completa: grupo 1 primero y, dentro de cada grupo, su tabla.
 * `rank` es la posición global (1 = el mejor del grupo 1).
 */
export function ladderOrder<T extends { entry_id: string }>(groups: { level: number; rows: T[] }[]): (T & { rank: number; level: number })[] {
  let rank = 0;
  return [...groups]
    .sort((a, b) => a.level - b.level)
    .flatMap((g) => g.rows.map((r) => ({ ...r, level: g.level, rank: ++rank })));
}

export type HistoryCell = { level: number; position: number | null; points: number | null; movement: Move } | null;

/**
 * Historial por jugador: una celda por ronda (null si no jugó esa ronda).
 * Las rondas cerradas salen de los snapshots; la ronda vigente, de su grupo
 * actual (sin posición final todavía).
 */
export function buildHistory(
  rounds: { id: string; status: string }[],
  snapshots: { round_id: string; entry_id: string; level: number; position: number; points: number; movement: Move }[],
  current: { roundId: string; levelOf: Map<string, number> } | null,
): Map<string, HistoryCell[]> {
  const out = new Map<string, HistoryCell[]>();
  const entries = new Set([...snapshots.map((s) => s.entry_id), ...(current ? current.levelOf.keys() : [])]);
  for (const e of entries) {
    out.set(
      e,
      rounds.map((r) => {
        if (current && r.id === current.roundId && r.status !== "closed") {
          const level = current.levelOf.get(e);
          return level ? { level, position: null, points: null, movement: null } : null;
        }
        const s = snapshots.find((x) => x.round_id === r.id && x.entry_id === e);
        return s ? { level: s.level, position: s.position, points: s.points, movement: s.movement } : null;
      }),
    );
  }
  return out;
}

export type RecordMatch = {
  entry_a: string;
  entry_b: string;
  status: string;
  result_type: "played" | "default" | "not_played" | null;
  winner_entry_id: string | null;
};

export type EntryRecord = {
  won: number;
  wonDefault: number;
  lost: number;
  lostDefault: number;
  notPlayed: number;
  /** Por rival: partidos cerrados ganados y perdidos. */
  h2h: Map<string, { won: number; lost: number }>;
};

/** Récord con resultados cerrados (confirmados o no jugados). */
export function entryRecord(matches: RecordMatch[], entryId: string): EntryRecord {
  const rec: EntryRecord = { won: 0, wonDefault: 0, lost: 0, lostDefault: 0, notPlayed: 0, h2h: new Map() };
  for (const m of matches) {
    if (m.entry_a !== entryId && m.entry_b !== entryId) continue;
    const rival = m.entry_a === entryId ? m.entry_b : m.entry_a;
    if (m.status === "not_played" || (m.status === "confirmed" && m.result_type === "not_played")) {
      rec.notPlayed++;
      continue;
    }
    if (m.status !== "confirmed" || !m.winner_entry_id) continue;
    const won = m.winner_entry_id === entryId;
    const def = m.result_type === "default";
    if (won && def) rec.wonDefault++;
    else if (won) rec.won++;
    else if (def) rec.lostDefault++;
    else rec.lost++;
    const h = rec.h2h.get(rival) ?? { won: 0, lost: 0 };
    if (won) h.won++;
    else h.lost++;
    rec.h2h.set(rival, h);
  }
  return rec;
}
