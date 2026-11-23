import type { TournamentConfig } from "./config";

/**
 * Marcador y puntos de un partido. `score.sets` son los juegos de A y B por
 * set: [[6,4],[3,6],[10,7]]. En el 3.º set con match tie-break se guardan los
 * puntos del tie-break (10-7).
 */

export type SetScore = [number, number];
export type Score = { sets: SetScore[] };
export type Side = "a" | "b";

export type ScoreSummary = {
  winner: Side;
  sets: { a: number; b: number };
  /** El match tie-break cuenta como un game para quien lo gana. */
  games: { a: number; b: number };
};

type Format = TournamentConfig["match_format"];

const int = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0;

/** Set normal a 6 games, con tie-break en 6-6 (7-6). */
function regularSetWinner([x, y]: SetScore): Side | null {
  const [hi, lo] = x > y ? [x, y] : [y, x];
  const valid = (hi === 6 && lo <= 4) || (hi === 7 && (lo === 5 || lo === 6));
  if (!valid) return null;
  return x > y ? "a" : "b";
}

/** Match tie-break a 10, ganando por 2: 10-0…10-8, y desde 9-9 por exactamente 2. */
function matchTiebreakWinner([x, y]: SetScore): Side | null {
  const [hi, lo] = x > y ? [x, y] : [y, x];
  const valid = (hi === 10 && lo <= 8) || (hi > 10 && hi - lo === 2);
  if (!valid) return null;
  return x > y ? "a" : "b";
}

export function validateScore(score: unknown, format: Format): { ok: true; summary: ScoreSummary } | { ok: false; error: string } {
  const sets = (score as Score | null)?.sets;
  if (!Array.isArray(sets) || sets.length < 2 || sets.length > 3) {
    return { ok: false, error: "El partido es a 2 o 3 sets." };
  }
  if (!sets.every((s) => Array.isArray(s) && s.length === 2 && int(s[0]) && int(s[1]))) {
    return { ok: false, error: "Marcador incompleto." };
  }

  const won = { a: 0, b: 0 };
  const games = { a: 0, b: 0 };
  for (let i = 0; i < sets.length; i++) {
    if (won.a === 2 || won.b === 2) return { ok: false, error: "El partido ya estaba decidido en 2 sets." };
    const set = sets[i] as SetScore;
    const tiebreak = i === 2 && format.third_set === "match_tiebreak_10";
    const w = tiebreak ? matchTiebreakWinner(set) : regularSetWinner(set);
    if (!w) {
      return {
        ok: false,
        error: tiebreak
          ? `El 3.er set es un tie-break a 10 (ganando por 2): ${set[0]}-${set[1]} no es válido.`
          : `Set ${i + 1}: ${set[0]}-${set[1]} no es un marcador válido.`,
      };
    }
    won[w]++;
    if (tiebreak) games[w] += 1;
    else {
      games.a += set[0];
      games.b += set[1];
    }
  }
  if (won.a < 2 && won.b < 2) return { ok: false, error: "Nadie ganó 2 sets: falta el 3.er set." };

  return { ok: true, summary: { winner: won.a === 2 ? "a" : "b", sets: won, games } };
}

/** Semana de la ronda (1 = días 1-7) en que se jugó. `null` si cae antes del inicio. */
export function weekOfRound(playedOn: string, roundStartsOn: string): number | null {
  const days = Math.round((Date.parse(`${playedOn}T00:00:00Z`) - Date.parse(`${roundStartsOn}T00:00:00Z`)) / 86_400_000);
  return days < 0 ? null : Math.floor(days / 7) + 1;
}

export function bonusFor(playedOn: string | null, roundStartsOn: string, config: TournamentConfig): number {
  if (!playedOn) return 0;
  const week = weekOfRound(playedOn, roundStartsOn);
  return config.bonus.find((b) => b.week === week)?.value ?? 0;
}

/** Lo mínimo de un partido que hace falta para puntuarlo. */
export type ScoredMatch = {
  entry_a: string;
  entry_b: string;
  status: string;
  result_type: "played" | "default" | "not_played" | null;
  winner_entry_id: string | null;
  score: unknown;
  /** Fecha local (YYYY-MM-DD) en que se jugó, para el bonus. */
  played_on: string | null;
};

export type MatchPoints = { a: { points: number; bonus: number }; b: { points: number; bonus: number } };

/**
 * Puntos de un partido CERRADO (`confirmed` o `not_played`); cualquier otro
 * estado no suma todavía. El bonus por jugar pronto va para los dos, salvo en
 * un default: al ganador sólo si `bonus_on_default_win`, al perdedor nunca.
 */
export function matchPoints(m: ScoredMatch, roundStartsOn: string, config: TournamentConfig): MatchPoints | null {
  const p = config.points;
  if (m.status === "not_played" || (m.status === "confirmed" && m.result_type === "not_played")) {
    return { a: { points: p.not_played, bonus: 0 }, b: { points: p.not_played, bonus: 0 } };
  }
  if (m.status !== "confirmed" || !m.winner_entry_id) return null;

  const winner: Side = m.winner_entry_id === m.entry_a ? "a" : "b";
  const loser: Side = winner === "a" ? "b" : "a";
  const bonus = bonusFor(m.played_on, roundStartsOn, config);

  const out: MatchPoints = { a: { points: 0, bonus: 0 }, b: { points: 0, bonus: 0 } };
  if (m.result_type === "default") {
    out[winner] = { points: p.win_default, bonus: config.bonus_on_default_win ? bonus : 0 };
    out[loser] = { points: p.loss_default, bonus: 0 };
  } else {
    out[winner] = { points: p.win, bonus };
    out[loser] = { points: p.loss_played, bonus };
  }
  return out;
}
