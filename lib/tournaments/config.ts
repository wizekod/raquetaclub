import { z } from "zod";

/**
 * Reglas de un torneo (columna `tournaments.config`). Los valores por defecto
 * son los de las bases de la Escalera 2027 (CLAUDE.md §5). El JSON guardado
 * puede venir incompleto o de una versión anterior: siempre se lee con
 * `parseConfig`, que rellena lo que falte.
 */

export const TIEBREAKERS = ["points", "head_to_head", "sets_diff", "games_diff", "matches_played"] as const;
export type Tiebreaker = (typeof TIEBREAKERS)[number];

export const TIEBREAKER_LABEL: Record<Tiebreaker, string> = {
  points: "Puntos",
  head_to_head: "Resultado entre ellos",
  sets_diff: "Diferencia de sets",
  games_diff: "Diferencia de games",
  matches_played: "Partidos jugados",
};

const points = z.number().min(0).max(100);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato HH:MM");

export const configSchema = z.object({
  group_size: z.number().int().min(3).max(10).default(5),
  promote: z.number().int().min(0).max(5).default(2),
  relegate: z.number().int().min(0).max(5).default(2),
  points: z
    .object({
      win: points.default(3),
      win_default: points.default(2),
      loss_played: points.default(1),
      loss_default: points.default(0),
      not_played: points.default(0),
    })
    .prefault({}),
  bonus: z
    .array(z.object({ week: z.number().int().min(1).max(5), value: z.number().min(0).max(10) }))
    .default([
      { week: 1, value: 0.25 },
      { week: 2, value: 0.1 },
    ]),
  bonus_on_default_win: z.boolean().default(false),
  match_format: z
    .object({
      sets: z.literal("best_of_3").default("best_of_3"),
      no_ad: z.boolean().default(true),
      third_set: z.enum(["match_tiebreak_10", "full_set"]).default("match_tiebreak_10"),
    })
    .prefault({}),
  results_deadline: z
    .object({ day: z.literal("last").default("last"), time: hhmm.default("14:00") })
    .prefault({}),
  next_round_publish_day: z.number().int().min(1).max(28).default(2),
  no_show_minutes: z.number().int().min(0).max(60).default(15),
  /** Rondas seguidas sin jugar para la baja automática. 0 = nunca. */
  auto_expel_after_inactive_rounds: z.number().int().min(0).max(12).default(2),
  tiebreakers: z.array(z.enum(TIEBREAKERS)).default([...TIEBREAKERS]),
});

export type TournamentConfig = z.infer<typeof configSchema>;

/** Lee el JSON guardado; lo que falte o sea inválido toma el valor por defecto. */
export function parseConfig(raw: unknown): TournamentConfig {
  const parsed = configSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : configSchema.parse({});
}

/** Valores iniciales según el tipo: el round robin no tiene ascensos ni descensos. */
export function defaultConfig(type: "ladder" | "round_robin"): TournamentConfig {
  const base = configSchema.parse({});
  return type === "round_robin" ? { ...base, promote: 0, relegate: 0, auto_expel_after_inactive_rounds: 0 } : base;
}
