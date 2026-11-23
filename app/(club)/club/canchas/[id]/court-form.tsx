"use client";

import { useActionState } from "react";

import { updateCourt } from "@/lib/courts/actions";
import type { FormState } from "@/lib/forms";
import type { CourtRow } from "@/lib/supabase/database.types";
import { SPORT_LABEL } from "@/lib/format/dates";
import { FormErrorBanner, TextField, useSuccessToast } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function CourtForm({ court, sports }: { court: CourtRow; sports: ("tennis" | "padel")[] }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateCourt, {});
  useSuccessToast(state);
  const e = state.fieldErrors ?? {};

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={court.id} />
      <Card>
        <CardHeader>
          <CardTitle>Datos</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <FormErrorBanner error={state.error} />
          </div>
          <TextField id="name" name="name" label="Nombre" defaultValue={court.name} required maxLength={40} errors={e.name} />
          <div className="grid gap-2">
            <Label htmlFor="sport">Deporte</Label>
            <select id="sport" name="sport" defaultValue={court.sport} className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm">
              {sports.map((s) => (
                <option key={s} value={s}>
                  {SPORT_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <TextField id="surface" name="surface" label="Superficie" defaultValue={court.surface ?? ""} maxLength={40} errors={e.surface} />
          <label className="flex items-center gap-2 text-sm sm:col-span-3">
            <input type="checkbox" name="active" defaultChecked={court.active} className="size-4 accent-primary" />
            Activa: los jugadores pueden apartarla
          </label>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
