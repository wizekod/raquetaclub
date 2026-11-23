"use client";

import { useActionState } from "react";

import { publishRound, saveGroups, suggestRoundGroups, updateRound } from "@/lib/tournaments/actions";
import type { FormState } from "@/lib/forms";
import type { RoundRow } from "@/lib/supabase/database.types";
import { FormErrorBanner, TextField, useSuccessToast } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

function useForm(action: (s: FormState, f: FormData) => Promise<FormState>) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  useSuccessToast(state);
  return { state, formAction, pending };
}

export function SuggestGroupsForm({ roundId }: { roundId: string }) {
  const { state, formAction, pending } = useForm(suggestRoundGroups);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="roundId" value={roundId} />
      <FormErrorBanner error={state.error} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Armando…" : "Sugerir grupos por siembra"}
      </Button>
    </form>
  );
}

type EntryOption = { id: string; name: string; seed: number | null; level: number | null };

/** Un selector de grupo por jugador aceptado. Sin JS funciona igual. */
export function GroupsForm({ roundId, entries, maxLevel }: { roundId: string; entries: EntryOption[]; maxLevel: number }) {
  const { state, formAction, pending } = useForm(saveGroups);
  if (!entries.length) {
    return <p className="text-sm text-muted-foreground">Aún no hay jugadores aceptados en el torneo.</p>;
  }
  const sorted = [...entries].sort((a, b) => (a.level ?? Infinity) - (b.level ?? Infinity));
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="roundId" value={roundId} />
      <p className="text-sm font-medium">Asignar a mano</p>
      <FormErrorBanner error={state.error} />
      <ul className="divide-y divide-border rounded-lg border border-border">
        {sorted.map((e) => (
          <li key={e.id} className="flex items-center gap-2 px-3 py-1.5">
            <span className="w-8 text-center text-xs text-muted-foreground">{e.seed ?? "—"}</span>
            <span className="flex-1 text-sm">{e.name}</span>
            <NativeSelect name={`group:${e.id}`} defaultValue={e.level ?? ""} aria-label={`Grupo de ${e.name}`} className="h-8 w-32">
              <option value="">Sin grupo</option>
              {Array.from({ length: maxLevel }, (_, i) => i + 1).map((l) => (
                <option key={l} value={l}>
                  Grupo {l}
                </option>
              ))}
            </NativeSelect>
          </li>
        ))}
      </ul>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Guardando…" : "Guardar grupos"}
      </Button>
    </form>
  );
}

export function PublishRoundForm({ roundId, ready, matchCount }: { roundId: string; ready: boolean; matchCount: number }) {
  const { state, formAction, pending } = useForm(publishRound);
  return (
    <form action={formAction}>
      <input type="hidden" name="roundId" value={roundId} />
      <Card>
        <CardHeader>
          <CardTitle>Publicar ronda</CardTitle>
          <CardDescription>
            Se generan los partidos de todos contra todos en cada grupo ({matchCount} en total) y los jugadores ven su grupo. Después
            ya no se pueden rehacer los grupos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormErrorBanner error={state.error} />
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            disabled={pending || !ready}
            onClick={(e) => {
              if (!confirm(`¿Publicar la ronda con ${matchCount} partidos?`)) e.preventDefault();
            }}
          >
            {pending ? "Publicando…" : "Publicar"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

export function RoundForm({ round }: { round: RoundRow }) {
  const { state, formAction, pending } = useForm(updateRound);
  const e = state.fieldErrors ?? {};
  return (
    <form action={formAction}>
      <input type="hidden" name="roundId" value={round.id} />
      <Card>
        <CardHeader>
          <CardTitle>Datos de la ronda</CardTitle>
          <CardDescription>La fecha límite de resultados es el último día, a la hora que marcan las reglas del torneo.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <FormErrorBanner error={state.error} />
          </div>
          <TextField id="r-name" name="name" label="Nombre" defaultValue={round.name} required maxLength={40} errors={e.name} />
          <TextField id="r-starts" name="starts_on" type="date" label="Inicio" defaultValue={round.starts_on} required errors={e.starts_on} />
          <TextField id="r-ends" name="ends_on" type="date" label="Fin" defaultValue={round.ends_on} required errors={e.ends_on} />
        </CardContent>
        <CardFooter>
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
