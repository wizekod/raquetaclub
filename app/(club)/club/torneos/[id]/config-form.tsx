"use client";

import { useActionState } from "react";

import { updateTournamentConfig } from "@/lib/tournaments/actions";
import type { FormState } from "@/lib/forms";
import type { TournamentConfig } from "@/lib/tournaments/config";
import { FormErrorBanner, TextField, useSuccessToast } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function ConfigForm({
  tournamentId,
  type,
  config: c,
}: {
  tournamentId: string;
  type: "ladder" | "round_robin";
  config: TournamentConfig;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateTournamentConfig, {});
  useSuccessToast(state);
  const e = state.fieldErrors ?? {};
  const bonus = (week: number) => c.bonus.find((b) => b.week === week)?.value ?? 0;
  const n = (id: keyof typeof e | string, label: string, value: number, step = "1", hint?: string) => (
    <TextField id={`cfg-${id}`} name={id} label={label} type="number" step={step} min="0" defaultValue={value} errors={e[id]} hint={hint} />
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={tournamentId} />
      <Card>
        <CardHeader>
          <CardTitle>Reglas de puntuación</CardTitle>
          <CardDescription>Vienen con las de la Escalera 2027. Los cambios aplican al calcular las tablas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <FormErrorBanner error={state.error} />

          <fieldset className="grid gap-4 sm:grid-cols-3">
            <legend className="mb-2 text-sm font-medium">Grupos</legend>
            {n("group_size", "Jugadores por grupo", c.group_size)}
            {type === "ladder" ? (
              <>
                {n("promote", "Suben por grupo", c.promote)}
                {n("relegate", "Bajan por grupo", c.relegate)}
              </>
            ) : (
              <>
                <input type="hidden" name="promote" value={c.promote} />
                <input type="hidden" name="relegate" value={c.relegate} />
              </>
            )}
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-3">
            <legend className="mb-2 text-sm font-medium">Puntos por partido</legend>
            {n("win", "Ganado", c.points.win, "0.01")}
            {n("win_default", "Ganado por default", c.points.win_default, "0.01")}
            {n("loss_played", "Perdido jugado", c.points.loss_played, "0.01")}
            {n("loss_default", "Perdido por default", c.points.loss_default, "0.01")}
            {n("not_played", "No jugado", c.points.not_played, "0.01")}
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-3">
            <legend className="mb-2 text-sm font-medium">Bonus por jugar pronto</legend>
            {n("bonus_week1", "1.ª semana", bonus(1), "0.01")}
            {n("bonus_week2", "2.ª semana", bonus(2), "0.01")}
            <p className="text-xs text-muted-foreground sm:pt-7">Para los dos jugadores; no aplica a partidos ganados por default.</p>
          </fieldset>

          <fieldset className="grid gap-4 sm:grid-cols-3">
            <legend className="mb-2 text-sm font-medium">Partido y plazos</legend>
            <div className="grid gap-2">
              <Label htmlFor="cfg-third_set">3.er set</Label>
              <NativeSelect id="cfg-third_set" name="third_set" defaultValue={c.match_format.third_set}>
                <option value="match_tiebreak_10">Tie-break a 10</option>
                <option value="full_set">Set completo</option>
              </NativeSelect>
            </div>
            <TextField
              id="cfg-deadline_time"
              name="deadline_time"
              label="Hora límite de resultados"
              type="time"
              defaultValue={c.results_deadline.time}
              errors={e.deadline_time}
              hint="El último día de cada ronda"
            />
            {type === "ladder"
              ? n("auto_expel", "Baja tras rondas sin jugar", c.auto_expel_after_inactive_rounds, "1", "0 = nunca")
              : <input type="hidden" name="auto_expel" value={c.auto_expel_after_inactive_rounds} />}
          </fieldset>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar reglas"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
