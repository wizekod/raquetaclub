"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { createBlock, type BlockFormState } from "@/lib/courts/actions";
import { FormErrorBanner, TextField, useSuccessToast } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

const field = "h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm";

export function BlockForm({ courts, today }: { courts: { id: string; name: string }[]; today: string }) {
  const [state, formAction, pending] = useActionState<BlockFormState, FormData>(createBlock, {});
  const [startDate, setStartDate] = useState(today);
  const formRef = useRef<HTMLFormElement>(null);
  useSuccessToast(state);
  const e = state.fieldErrors ?? {};

  useEffect(() => {
    if (state.message) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle>Nuevo bloqueo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FormErrorBanner error={state.error} />

          <div className="grid gap-2">
            <Label htmlFor="court">Cancha</Label>
            <select id="court" name="court" className={field} defaultValue="all">
              <option value="all">Todas las canchas</option>
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="startDate">Desde</Label>
              <div className="flex gap-2">
                <input id="startDate" name="startDate" type="date" required value={startDate} onChange={(ev) => setStartDate(ev.target.value)} className={field} />
                <input name="startTime" type="time" required defaultValue="00:00" aria-label="Hora de inicio" className={`${field} w-32`} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="endDate">Hasta</Label>
              <div className="flex gap-2">
                <input id="endDate" name="endDate" type="date" required key={startDate} defaultValue={startDate} min={startDate} className={field} />
                <input name="endTime" type="time" required defaultValue="23:59" aria-label="Hora de fin" className={`${field} w-32`} />
              </div>
              {e.endTime?.length ? <p className="text-sm text-destructive">{e.endTime[0]}</p> : null}
            </div>
          </div>

          <TextField id="reason" name="reason" label="Motivo (opcional)" placeholder="Evento privado del hotel" maxLength={120} errors={e.reason} />

          {state.conflicts ? (
            <label className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <input type="checkbox" name="confirm" className="mt-0.5 size-4 accent-destructive" />
              Cancelar {state.conflicts === 1 ? "el partido agendado" : `los ${state.conflicts} partidos agendados`} y
              bloquear. Los partidos vuelven a quedar por agendar.
            </label>
          ) : null}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Bloquear"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
