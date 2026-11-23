import type { Tiebreaker, TournamentConfig } from "./config";
import { matchPoints, validateScore, type ScoredMatch } from "./scoring";

/** Fila de la tabla de un grupo. Mismos campos que `standings_snapshots`. */
export type StandingRow = {
  entry_id: string;
  position: number;
  played: number;
  won: number;
  won_default: number;
  lost: number;
  lost_default: number;
  not_played: number;
  sets_won: number;
  sets_lost: number;
  games_won: number;
  games_lost: number;
  bonus: number;
  points: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function emptyRow(entry_id: string): StandingRow {
  return {
    entry_id, position: 0, played: 0, won: 0, won_default: 0, lost: 0, lost_default: 0, not_played: 0,
    sets_won: 0, sets_lost: 0, games_won: 0, games_lost: 0, bonus: 0, points: 0,
  };
}

/** Puntos (con bonus) que cada entry sacó de los partidos dados. */
function pointsFrom(matches: ScoredMatch[], roundStartsOn: string, config: TournamentConfig) {
  const pts = new Map<string, number>();
  for (const m of matches) {
    const mp = matchPoints(m, roundStartsOn, config);
    if (!mp) continue;
    pts.set(m.entry_a, (pts.get(m.entry_a) ?? 0) + mp.a.points + mp.a.bonus);
    pts.set(m.entry_b, (pts.get(m.entry_b) ?? 0) + mp.b.points + mp.b.bonus);
  }
  return pts;
}

/**
 * Tabla de un grupo. `entryIds` va en orden de siembra: es el último criterio
 * de desempate, así el resultado es siempre determinista.
 *
 * Desempates (`config.tiebreakers`, en orden). Se aplican por bloques: cada
 * criterio sólo separa a los que siguen empatados tras el anterior.
 * `head_to_head` compara los puntos sacados en los partidos ENTRE los
 * empatados (con dos, es quién le ganó a quién).
 */
export function computeStandings(
  entryIds: string[],
  matches: ScoredMatch[],
  roundStartsOn: string,
  config: TournamentConfig,
): StandingRow[] {
  const rows = new Map(entryIds.map((id) => [id, emptyRow(id)]));

  for (const m of matches) {
    const a = rows.get(m.entry_a);
    const b = rows.get(m.entry_b);
    const mp = matchPoints(m, roundStartsOn, config);
    if (!a || !b || !mp) continue;

    a.points += mp.a.points + mp.a.bonus;
    b.points += mp.b.points + mp.b.bonus;
    a.bonus += mp.a.bonus;
    b.bonus += mp.b.bonus;

    if (m.status === "not_played" || m.result_type === "not_played") {
      a.not_played++;
      b.not_played++;
      continue;
    }
    const [w, l] = m.winner_entry_id === m.entry_a ? [a, b] : [b, a];
    if (m.result_type === "default") {
      w.won_default++;
      l.lost_default++;
      continue;
    }
    w.won++;
    l.lost++;
    a.played++;
    b.played++;
    const s = validateScore(m.score, config.match_format);
    if (s.ok) {
      a.sets_won += s.summary.sets.a;
      a.sets_lost += s.summary.sets.b;
      b.sets_won += s.summary.sets.b;
      b.sets_lost += s.summary.sets.a;
      a.games_won += s.summary.games.a;
      a.games_lost += s.summary.games.b;
      b.games_won += s.summary.games.b;
      b.games_lost += s.summary.games.a;
    }
  }

  for (const r of rows.values()) {
    r.points = round2(r.points);
    r.bonus = round2(r.bonus);
  }

  const seedOrder = new Map(entryIds.map((id, i) => [id, i]));
  const key = (crit: Tiebreaker, cluster: StandingRow[]): Map<string, number> => {
    const out = new Map<string, number>();
    if (crit === "head_to_head") {
      const ids = new Set(cluster.map((r) => r.entry_id));
      const h2h = pointsFrom(matches.filter((m) => ids.has(m.entry_a) && ids.has(m.entry_b)), roundStartsOn, config);
      for (const r of cluster) out.set(r.entry_id, round2(h2h.get(r.entry_id) ?? 0));
      return out;
    }
    for (const r of cluster) {
      out.set(
        r.entry_id,
        crit === "points" ? r.points
          : crit === "sets_diff" ? r.sets_won - r.sets_lost
          : crit === "games_diff" ? r.games_won - r.games_lost
          : r.played + r.won_default,
      );
    }
    return out;
  };

  const rank = (cluster: StandingRow[], crits: Tiebreaker[]): StandingRow[] => {
    if (cluster.length < 2) return cluster;
    if (!crits.length) return [...cluster].sort((x, y) => seedOrder.get(x.entry_id)! - seedOrder.get(y.entry_id)!);
    const [crit, ...rest] = crits as [Tiebreaker, ...Tiebreaker[]];
    const k = key(crit, cluster);
    const sorted = [...cluster].sort((x, y) => k.get(y.entry_id)! - k.get(x.entry_id)!);
    const out: StandingRow[] = [];
    for (let i = 0; i < sorted.length; ) {
      let j = i + 1;
      while (j < sorted.length && k.get(sorted[j]!.entry_id) === k.get(sorted[i]!.entry_id)) j++;
      out.push(...rank(sorted.slice(i, j), rest));
      i = j;
    }
    return out;
  };

  // `points` siempre manda primero, aunque la config no lo diga.
  const crits = config.tiebreakers[0] === "points" ? config.tiebreakers : (["points", ...config.tiebreakers.filter((c) => c !== "points")] as Tiebreaker[]);
  return rank([...rows.values()], crits).map((r, i) => ({ ...r, position: i + 1 }));
}
