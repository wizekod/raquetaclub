import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { requireMyClub } from "@/lib/clubs/queries";
import { getDayOccupancy } from "@/lib/courts/queries";
import { openIntervals, subtract, type Interval } from "@/lib/courts/availability";
import { addDays, todayInTz } from "@/lib/availability/tz";
import { formatLongDate, formatTime } from "@/lib/format/dates";
import { buttonVariants } from "@/components/ui/button";
import { cn, capitalizeFirst } from "@/lib/utils";

export const metadata: Metadata = { title: "Calendario · RaquetaClub" };

const PX_PER_MIN = 1; // 60 px por hora
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function CalendarioPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const club = await requireMyClub();
  const tz = club.timezone;
  const today = todayInTz(tz);
  const raw = (await searchParams).fecha;
  const date = raw && DATE.test(raw) ? raw : today;

  const { courts, blocks, bookings, bounds } = await getDayOccupancy(club.id, date, tz);
  const dayStart = new Date(bounds.start).getTime();
  const dayEnd = new Date(bounds.end).getTime();
  const toMin = (ms: number) => Math.round((Math.min(Math.max(ms, dayStart), dayEnd) - dayStart) / 60_000);

  // Rango visible: de la primera apertura al último cierre del día (7–22 si nada abre).
  const opens = courts.map((c) => ({ id: c.id, open: openIntervals(c.hours, date, tz) }));
  const allOpen = opens.flatMap((o) => o.open);
  const from = allOpen.length ? Math.floor(Math.min(...allOpen.map((i) => toMin(i.start))) / 60) * 60 : 7 * 60;
  const to = allOpen.length ? Math.ceil(Math.max(...allOpen.map((i) => toMin(i.end))) / 60) * 60 : 22 * 60;
  const height = (to - from) * PX_PER_MIN;
  const hours = Array.from({ length: (to - from) / 60 + 1 }, (_, i) => from + i * 60);
  const pos = (startMs: number, endMs: number) => {
    const top = Math.max(toMin(startMs), from) - from;
    const bottom = Math.min(toMin(endMs), to) - from;
    return { top: top * PX_PER_MIN, height: Math.max(bottom - top, 0) * PX_PER_MIN };
  };

  const nav = (d: string) => `/club/calendario?fecha=${d}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Calendario de canchas</h1>
          <p className="text-sm text-muted-foreground">{capitalizeFirst(formatLongDate(date))}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={nav(addDays(date, -1))} aria-label="Día anterior" className={buttonVariants({ variant: "outline", size: "icon" })}>
            <ChevronLeft className="size-4" />
          </Link>
          {date !== today ? (
            <Link href={nav(today)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Hoy
            </Link>
          ) : null}
          <form action="/club/calendario" className="flex">
            <input type="date" name="fecha" defaultValue={date} aria-label="Ir a fecha" className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm" />
            <button type="submit" className="sr-only">Ir</button>
          </form>
          <Link href={nav(addDays(date, 1))} aria-label="Día siguiente" className={buttonVariants({ variant: "outline", size: "icon" })}>
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>

      {courts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No hay canchas activas. <Link href="/club/canchas" className="underline">Da de alta una cancha</Link>.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <div className="flex min-w-max">
            {/* Eje de horas */}
            <div className="sticky left-0 z-10 w-14 shrink-0 border-r border-border bg-card">
              <div className="h-10 border-b border-border" />
              <div className="relative" style={{ height }}>
                {hours.map((h) => (
                  <span key={h} className="absolute right-2 -translate-y-1/2 text-xs text-muted-foreground" style={{ top: (h - from) * PX_PER_MIN }}>
                    {String(Math.floor(h / 60) % 24).padStart(2, "0")}:00
                  </span>
                ))}
              </div>
            </div>

            {courts.map((c) => {
              const open = opens.find((o) => o.id === c.id)!.open;
              const visible: Interval = { start: dayStart + from * 60_000, end: dayStart + to * 60_000 };
              const closed = subtract([visible], open);
              const courtBlocks = blocks.filter((b) => b.court_id === null || b.court_id === c.id);
              const courtBookings = bookings.filter((b) => b.courtId === c.id);
              return (
                <div key={c.id} className="w-40 shrink-0 border-r border-border last:border-r-0">
                  <div className="flex h-10 items-center justify-center border-b border-border px-2 text-sm font-medium">
                    <span className="truncate">{c.name}</span>
                  </div>
                  <div className="relative" style={{ height }}>
                    {hours.map((h) => (
                      <div key={h} className="absolute inset-x-0 border-t border-border/60" style={{ top: (h - from) * PX_PER_MIN }} />
                    ))}
                    {closed.map((i, k) => (
                      <div
                        key={`closed-${k}`}
                        className="absolute inset-x-0 bg-muted/70 bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgb(0_0_0/0.04)_6px,rgb(0_0_0/0.04)_12px)]"
                        style={pos(i.start, i.end)}
                        title="Cerrada"
                      />
                    ))}
                    {courtBlocks.map((b) => (
                      <div
                        key={b.id}
                        className="absolute inset-x-1 overflow-hidden rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive"
                        style={pos(new Date(b.start_at).getTime(), new Date(b.end_at).getTime())}
                      >
                        <p className="font-medium">Bloqueada</p>
                        {b.reason ? <p className="truncate">{b.reason}</p> : null}
                      </div>
                    ))}
                    {courtBookings.map((b) => (
                      <div
                        key={b.id}
                        className={cn("absolute inset-x-1 overflow-hidden rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs")}
                        style={pos(new Date(b.start).getTime(), new Date(b.end).getTime())}
                      >
                        <p className="font-medium text-primary">
                          {formatTime(b.start, tz)}–{formatTime(b.end, tz)}
                        </p>
                        {b.players.map((p) => (
                          <p key={p} className="truncate">
                            {p}
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm border border-primary/40 bg-primary/10" /> Partido agendado</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm border border-destructive/40 bg-destructive/10" /> Bloqueada</span>
        <span className="flex items-center gap-1.5"><span className="size-3 rounded-sm bg-muted" /> Cerrada</span>
      </div>
    </div>
  );
}
