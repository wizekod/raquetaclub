/**
 * Disponibilidad de canchas. Lógica pura (sin base ni red) para poder
 * probarla: la usan el calendario de ocupación del admin y, en el paso 5, el
 * link de partido para proponer horarios.
 *
 * Todo trabaja con instantes en milisegundos (UTC). La "hora de pared" del
 * club sólo entra al convertir el horario semanal con su zona horaria.
 */
import { dayOfWeek, wallTimeToInstant } from "@/lib/availability/tz";

export type Interval = { start: number; end: number };

export type WeeklyHours = { day_of_week: number; open_time: string; close_time: string };

/** Franjas abiertas de una fecha local según el horario semanal. */
export function openIntervals(hours: WeeklyHours[], date: string, timeZone: string): Interval[] {
  const dow = dayOfWeek(date);
  return hours
    .filter((h) => h.day_of_week === dow)
    .map((h) => ({
      start: wallTimeToInstant(date, h.open_time.slice(0, 5), timeZone).getTime(),
      end: wallTimeToInstant(date, h.close_time.slice(0, 5), timeZone).getTime(),
    }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);
}

/** Une intervalos que se tocan o se enciman. */
export function merge(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

/** `open` menos `busy`: lo que queda libre. */
export function subtract(open: Interval[], busy: Interval[]): Interval[] {
  const taken = merge(busy);
  const out: Interval[] = [];
  for (const o of merge(open)) {
    let cursor = o.start;
    for (const b of taken) {
      if (b.end <= cursor || b.start >= o.end) continue;
      if (b.start > cursor) out.push({ start: cursor, end: b.start });
      cursor = Math.max(cursor, b.end);
      if (cursor >= o.end) break;
    }
    if (cursor < o.end) out.push({ start: cursor, end: o.end });
  }
  return out;
}

/**
 * Inicios posibles de un partido de `durationMin` dentro de los intervalos
 * libres, cada `stepMin` desde el inicio de cada franja (si la cancha abre a
 * las 7:00, se ofrecen 7:00, 7:30…). `notBefore` descarta lo ya pasado.
 */
export function slotStarts(
  free: Interval[],
  durationMin: number,
  stepMin: number,
  notBefore = -Infinity,
): Interval[] {
  const dur = durationMin * 60_000;
  const step = stepMin * 60_000;
  const out: Interval[] = [];
  for (const f of free) {
    for (let t = f.start; t + dur <= f.end; t += step) {
      if (t >= notBefore) out.push({ start: t, end: t + dur });
    }
  }
  return out;
}

export type CourtDayInput = {
  courtId: string;
  hours: WeeklyHours[];
  /** Bloqueos de esa cancha y los de "todas las canchas". */
  blocks: Interval[];
  bookings: Interval[];
};

/** Horarios libres de cada cancha en una fecha local. */
export function freeSlotsByCourt(
  courts: CourtDayInput[],
  date: string,
  timeZone: string,
  opts: { durationMin: number; stepMin: number; now?: number },
): Map<string, Interval[]> {
  const out = new Map<string, Interval[]>();
  for (const c of courts) {
    const free = subtract(openIntervals(c.hours, date, timeZone), [...c.blocks, ...c.bookings]);
    out.set(c.courtId, slotStarts(free, opts.durationMin, opts.stepMin, opts.now));
  }
  return out;
}
