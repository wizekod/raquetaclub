"use client";

import { useActionState } from "react";

import { saveSeeds, setEntryStatus } from "@/lib/tournaments/actions";
import type { FormState } from "@/lib/forms";
import type { EntryWithName } from "@/lib/tournaments/queries";
import { FormErrorBanner, useSuccessToast } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Aceptados con su siembra (1 = el mejor). La siembra ordena la sugerencia
 * de grupos de la primera ronda. "Dar de baja" va en un formulario aparte
 * (atributo `form`): no se puede anidar dentro del de la siembra.
 */
export function SeedsForm({ tournamentId, entries }: { tournamentId: string; entries: EntryWithName[] }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveSeeds, {});
  useSuccessToast(state);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Aceptados</p>
      <form action={formAction} className="space-y-2">
        <input type="hidden" name="tournamentId" value={tournamentId} />
        <FormErrorBanner error={state.error} />
        <ul className="divide-y divide-border rounded-lg border border-border">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-2 px-3 py-2">
              <Input
                aria-label={`Siembra de ${e.name}`}
                name={`seed:${e.id}`}
                defaultValue={e.seed ?? ""}
                inputMode="numeric"
                placeholder="—"
                className="h-8 w-14 text-center"
              />
              <span className="flex-1 text-sm">{e.name}</span>
              <Button type="submit" form={`withdraw-${e.id}`} size="sm" variant="ghost">
                Dar de baja
              </Button>
            </li>
          ))}
        </ul>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Guardando…" : "Guardar siembra"}
        </Button>
      </form>
      {entries.map((e) => (
        <form key={e.id} id={`withdraw-${e.id}`} action={setEntryStatus} hidden>
          <input type="hidden" name="entryId" value={e.id} />
          <input type="hidden" name="status" value="withdrawn" />
        </form>
      ))}
    </div>
  );
}
