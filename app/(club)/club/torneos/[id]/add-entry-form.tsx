"use client";

import { useActionState } from "react";

import { addEntry } from "@/lib/tournaments/actions";
import type { FormState } from "@/lib/forms";
import { FieldError, FormErrorBanner, useSuccessToast } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";

export function AddEntryForm({ tournamentId, candidates }: { tournamentId: string; candidates: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(addEntry, {});
  useSuccessToast(state);

  if (!candidates.length) return null;
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <p className="text-sm font-medium">Inscribir a un jugador del club</p>
      <FormErrorBanner error={state.error} />
      <div className="flex flex-wrap gap-2">
        <NativeSelect name="playerId" aria-label="Jugador" defaultValue="" className="min-w-0 flex-1">
          <option value="" disabled>
            Elige un jugador…
          </option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Inscribiendo…" : "Inscribir"}
        </Button>
      </div>
      <FieldError messages={state.fieldErrors?.playerId} />
    </form>
  );
}
