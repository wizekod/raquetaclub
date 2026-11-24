import type { Enums } from "@/lib/supabase/database.types";

export const CLUB_STATUS_LABEL: Record<Enums<"club_status">, string> = {
  active: "Activo",
  trial: "Prueba",
  suspended: "Suspendido",
};

/** "12 / 20", o "12" si no hay límite. */
export const usage = (n: number, max: number | null | undefined) => (max == null ? `${n}` : `${n} / ${max}`);

export const money = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

export const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
