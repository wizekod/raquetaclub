/** Nombres y formatos de fecha en español, con la zona horaria del club. */

export const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;
export const DAY_SHORT = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;
/** Orden de la semana para mostrar: lunes primero. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export const SPORT_LABEL = { tennis: "Tenis", padel: "Pádel" } as const;

export function formatTime(iso: string | number | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es-MX", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(
    new Date(iso),
  );
}

export function formatDateTime(iso: string | number | Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** "lunes 1 de febrero de 2027" para una fecha local "YYYY-MM-DD". */
export function formatLongDate(date: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** "07:00:00" → "07:00". */
export const hhmm = (t: string) => t.slice(0, 5);

/**
 * Resumen corto del horario semanal: agrupa días consecutivos con las mismas
 * franjas ("Lun–Vie 07:00–22:00 · Sáb–Dom 08:00–20:00").
 */
export function summarizeHours(hours: { day_of_week: number; open_time: string; close_time: string }[]): string {
  if (!hours.length) return "Sin horario: cerrada";
  const key = (d: number) =>
    hours
      .filter((h) => h.day_of_week === d)
      .map((h) => `${hhmm(h.open_time)}–${hhmm(h.close_time)}`)
      .join(", ");
  const groups: { from: number; to: number; label: string }[] = [];
  for (const d of WEEK_ORDER) {
    const label = key(d);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.to = d;
    else groups.push({ from: d, to: d, label });
  }
  return groups
    .filter((g) => g.label)
    .map((g) => `${DAY_SHORT[g.from]}${g.from !== g.to ? `–${DAY_SHORT[g.to]}` : ""} ${g.label}`)
    .join(" · ");
}
