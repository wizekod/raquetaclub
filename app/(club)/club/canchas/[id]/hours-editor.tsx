"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { applyHoursToAllCourts, saveCourtHours } from "@/lib/courts/actions";
import { DAY_NAMES, WEEK_ORDER } from "@/lib/format/dates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

type Slot = { day_of_week: number; open_time: string; close_time: string };

const timeInput = "h-9 rounded-lg border border-input bg-transparent px-2 text-sm";

/**
 * Horario semanal de la cancha: varias franjas por día (ej. 7–14 y 16–22).
 * Un día sin franjas = cerrada. Se guarda todo junto (`set_court_hours`).
 */
export function HoursEditor({ courtId, initial }: { courtId: string; initial: Slot[] }) {
  const [slots, setSlots] = useState<Slot[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, start] = useTransition();

  const update = (next: Slot[]) => {
    setSlots(next);
    setDirty(true);
  };
  const ofDay = (d: number) => slots.map((s, i) => ({ s, i })).filter(({ s }) => s.day_of_week === d);

  const copyToAllDays = (d: number) => {
    const source = slots.filter((s) => s.day_of_week === d);
    update(WEEK_ORDER.flatMap((day) => source.map((s) => ({ ...s, day_of_week: day }))));
  };

  const save = () =>
    start(async () => {
      const r = await saveCourtHours(courtId, slots);
      if (r.ok) {
        setDirty(false);
        toast.success("Horario guardado.");
      } else toast.error(r.error);
    });

  const applyAll = () =>
    start(async () => {
      if (dirty) {
        const r = await saveCourtHours(courtId, slots);
        if (!r.ok) return void toast.error(r.error);
        setDirty(false);
      }
      const r = await applyHoursToAllCourts(courtId);
      if (r.ok) toast.success("Horario aplicado a todas las canchas.");
      else toast.error(r.error);
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Horario semanal</CardTitle>
        <CardDescription>Horas en que la cancha se puede apartar. Un día sin franjas queda cerrado.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {WEEK_ORDER.map((d) => (
          <div key={d} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
            <div className="w-28 shrink-0 pt-1.5 text-sm font-medium">{DAY_NAMES[d]}</div>
            <div className="flex flex-1 flex-col gap-2">
              {ofDay(d).length === 0 ? <p className="pt-1.5 text-sm text-muted-foreground">Cerrada</p> : null}
              {ofDay(d).map(({ s, i }) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="time"
                    aria-label={`${DAY_NAMES[d]} apertura`}
                    value={s.open_time}
                    step={1800}
                    onChange={(e) => update(slots.map((x, j) => (j === i ? { ...x, open_time: e.target.value } : x)))}
                    className={timeInput}
                  />
                  <span className="text-muted-foreground">a</span>
                  <input
                    type="time"
                    aria-label={`${DAY_NAMES[d]} cierre`}
                    value={s.close_time}
                    step={1800}
                    onChange={(e) => update(slots.map((x, j) => (j === i ? { ...x, close_time: e.target.value } : x)))}
                    className={timeInput}
                  />
                  <button
                    type="button"
                    aria-label="Quitar franja"
                    onClick={() => update(slots.filter((_, j) => j !== i))}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const last = ofDay(d).at(-1)?.s;
                  update([
                    ...slots,
                    last
                      ? { day_of_week: d, open_time: last.close_time, close_time: "22:00" }
                      : { day_of_week: d, open_time: "07:00", close_time: "22:00" },
                  ]);
                }}
              >
                <Plus className="size-4" />
                Franja
              </Button>
              {ofDay(d).length ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => copyToAllDays(d)}>
                  Copiar a todos
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button type="button" onClick={save} disabled={busy || !dirty}>
          {busy ? "Guardando…" : "Guardar horario"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            if (confirm("¿Aplicar este horario a todas las canchas del club? Reemplaza su horario actual.")) applyAll();
          }}
        >
          Aplicar a todas las canchas
        </Button>
      </CardFooter>
    </Card>
  );
}
