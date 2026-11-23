import { zonedDateAndMinutes } from "@/lib/availability/tz";

import type { TournamentConfig } from "./config";
import { buildNextRound, shouldExpel, type Movement } from "./ladder";
import { nextRoundDraft, type RoundDraft } from "./rounds";
import type { ScoredMatch } from "./scoring";
import { computeStandings, type StandingRow } from "./standings";

/**
 * Plan de cierre de una ronda (lógica pura). Lo guarda `close_round` en una
 * sola transacción. Reglas:
 *  - "Por confirmar" cuenta como confirmado (se entregó a tiempo); sin
 *    resultado cuenta como no jugado. Con disputas no se puede cerrar.
 *  - Escalera: movimientos + grupos de la siguiente ronda (`buildNextRound`),
 *    bajas por inactividad y nuevos inscritos al grupo más bajo.
 *  - Round robin, o si la siguiente ronda caería después del fin del torneo:
 *    no hay siguiente ronda y el torneo se finaliza.
 */

export type CloseMatch = {
  id: string;
  group_id: string | null;
  entry_a: string;
  entry_b: string;
  status: string;
  result_type: "played" | "default" | "not_played" | null;
  winner_entry_id: string | null;
  score: unknown;
  scheduled_at: string | null;
  reported_at: string | null;
};

export type CloseInput = {
  type: "ladder" | "round_robin";
  config: TournamentConfig;
  timeZone: string;
  round: { number: number; starts_on: string; ends_on: string };
  tournamentEndsOn: string | null;
  today: string;
  /** Grupos de la ronda por nivel, con integrantes en orden de siembra. */
  groups: { id: string; level: number; entries: string[] }[];
  matches: CloseMatch[];
  /** Estado actual de cada inscripción del torneo. */
  entryStatus: Map<string, string>;
  /** Por entry: actividad de rondas anteriores (más antigua primero). */
  previousActivity: Map<string, number[]>;
};

export type SnapshotPlan = StandingRow & { group_id: string; movement: Movement | null };

export type ClosePlan =
  | { ok: false; error: string }
  | { ok: true; snapshots: SnapshotPlan[]; expel: string[]; next: (RoundDraft & { groups: { level: number; entries: string[] }[] }) | null; finish: boolean };

/** Fecha local en que se jugó: la agendada o, si no hubo reserva, la del reporte. */
function playedOn(m: CloseMatch, timeZone: string): string | null {
  const at = m.scheduled_at ?? m.reported_at;
  return at ? zonedDateAndMinutes(at, timeZone).date : null;
}

export function planClose(input: CloseInput): ClosePlan {
  const disputed = input.matches.filter((m) => m.status === "disputed").length;
  if (disputed) return { ok: false, error: `Hay ${disputed} resultado(s) en disputa: resuélvelos antes de cerrar la ronda.` };

  const effective: (ScoredMatch & { group_id: string | null })[] = input.matches
    .filter((m) => m.status !== "cancelled")
    .map((m) => {
      const closed = m.status === "reported" ? "confirmed" : m.status === "pending" || m.status === "scheduled" ? "not_played" : m.status;
      return {
        group_id: m.group_id,
        entry_a: m.entry_a,
        entry_b: m.entry_b,
        status: closed,
        result_type: closed === "not_played" ? "not_played" : m.result_type,
        winner_entry_id: closed === "not_played" ? null : m.winner_entry_id,
        score: m.score,
        played_on: playedOn(m, input.timeZone),
      };
    });

  const ordered = [...input.groups].sort((a, b) => a.level - b.level);
  const tables = ordered.map((g) => ({
    group: g,
    rows: computeStandings(g.entries, effective.filter((m) => m.group_id === g.id), input.round.starts_on, input.config),
  }));

  // Bajas: por inactividad (escalera) o porque ya no están aceptados.
  const expel: string[] = [];
  const out = new Set<string>();
  for (const { rows } of tables) {
    for (const r of rows) {
      if (input.entryStatus.get(r.entry_id) !== "accepted") out.add(r.entry_id);
      else if (
        input.type === "ladder" &&
        shouldExpel([...(input.previousActivity.get(r.entry_id) ?? []), r.played + r.won_default], input.config.auto_expel_after_inactive_rounds)
      ) {
        expel.push(r.entry_id);
        out.add(r.entry_id);
      }
    }
  }

  const inRound = new Set(ordered.flatMap((g) => g.entries));
  const newcomers = [...input.entryStatus].filter(([id, s]) => s === "accepted" && !inRound.has(id)).map(([id]) => id);

  let movements = new Map<string, Movement>();
  let next: Extract<ClosePlan, { ok: true }>["next"] = null;
  if (input.type === "ladder") {
    const built = buildNextRound(tables.map((t) => t.rows.map((r) => r.entry_id)), input.config, out, newcomers);
    movements = built.movements;
    const draft = nextRoundDraft({
      previous: { number: input.round.number, ends_on: input.round.ends_on },
      tournamentStartsOn: null,
      tournamentEndsOn: input.tournamentEndsOn,
      today: input.today,
      config: input.config,
      timeZone: input.timeZone,
    });
    const afterEnd = !!input.tournamentEndsOn && draft.starts_on > input.tournamentEndsOn;
    const players = built.groups.flat().length;
    if (!afterEnd && players >= 2) {
      next = { ...draft, groups: built.groups.filter((g) => g.length).map((entries, i) => ({ level: i + 1, entries })) };
    }
  }

  const snapshots: SnapshotPlan[] = tables.flatMap(({ group, rows }) =>
    rows.map((r) => ({ ...r, group_id: group.id, movement: input.type === "ladder" ? (movements.get(r.entry_id) ?? "stay") : null })),
  );
  return { ok: true, snapshots, expel, next, finish: next === null };
}
