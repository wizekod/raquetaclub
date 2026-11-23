"use client";

import { useActionState } from "react";

import { createRound } from "@/lib/tournaments/actions";
import type { FormState } from "@/lib/forms";
import type { RoundDraft } from "@/lib/tournaments/rounds";
import { FormErrorBanner, TextField } from "@/components/forms";
import { Button } from "@/components/ui/button";

export function NewRoundForm({ tournamentId, suggestion }: { tournamentId: string; suggestion: RoundDraft }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createRound, {});
  const e = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-dashed border-border p-3">
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <p className="text-sm font-medium">Ronda {suggestion.number}</p>
      <FormErrorBanner error={state.error} />
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField id="round-name" name="name" label="Nombre" defaultValue={suggestion.name} required maxLength={40} errors={e.name} />
        <TextField id="round-starts" name="starts_on" type="date" label="Inicio" defaultValue={suggestion.starts_on} required errors={e.starts_on} />
        <TextField id="round-ends" name="ends_on" type="date" label="Fin" defaultValue={suggestion.ends_on} required errors={e.ends_on} />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Creando…" : "Crear ronda"}
      </Button>
    </form>
  );
}
