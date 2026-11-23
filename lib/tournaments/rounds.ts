import { addDays, addMonths, wallTimeToInstant } from "@/lib/availability/tz";

import type { TournamentConfig } from "./config";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

export type RoundDraft = {
  number: number;
  name: string;
  starts_on: string;
  ends_on: string;
  /** Instante ISO (UTC) de la fecha límite de resultados. */
  results_deadline: string;
};

/** Fecha límite: el último día de la ronda a la hora de la config, en la zona del club. */
export function resultsDeadline(endsOn: string, config: TournamentConfig, timeZone: string): string {
  return wallTimeToInstant(endsOn, config.results_deadline.time, timeZone).toISOString();
}

/**
 * Datos sugeridos de la siguiente ronda: 1 ronda = 1 mes (escalera). Empieza
 * el día siguiente al fin de la anterior (o en el inicio del torneo) y acaba
 * el último día de ese mes, sin pasarse del fin del torneo.
 */
export function nextRoundDraft(opts: {
  previous: { number: number; ends_on: string } | null;
  tournamentStartsOn: string | null;
  tournamentEndsOn: string | null;
  today: string;
  config: TournamentConfig;
  timeZone: string;
}): RoundDraft {
  const starts_on = opts.previous ? addDays(opts.previous.ends_on, 1) : (opts.tournamentStartsOn ?? opts.today);
  let ends_on = addDays(addMonths(starts_on, 1), -1);
  if (opts.tournamentEndsOn && opts.tournamentEndsOn < ends_on && opts.tournamentEndsOn >= starts_on) {
    ends_on = opts.tournamentEndsOn;
  }
  return {
    number: (opts.previous?.number ?? 0) + 1,
    name: MONTHS[Number(starts_on.slice(5, 7)) - 1] ?? `Ronda ${(opts.previous?.number ?? 0) + 1}`,
    starts_on,
    ends_on,
    results_deadline: resultsDeadline(ends_on, opts.config, opts.timeZone),
  };
}
