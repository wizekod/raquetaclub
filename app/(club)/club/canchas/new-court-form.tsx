"use client";

import { useActionState } from "react";

import { createCourt } from "@/lib/courts/actions";
import type { FormState } from "@/lib/forms";
import { SPORT_LABEL } from "@/lib/format/dates";
import { FieldError, FormErrorBanner, TextField } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function NewCourtForm({ sports }: { sports: ("tennis" | "padel")[] }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createCourt, {});
  const e = state.fieldErrors ?? {};

  return (
    <form action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle>Nueva cancha</CardTitle>
          <CardDescription>Nace con el horario de tus otras canchas; lo ajustas en el siguiente paso.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <FormErrorBanner error={state.error} />
          </div>
          <TextField id="court-name" name="name" label="Nombre" placeholder="Cancha 1" required maxLength={40} errors={e.name} />
          {sports.length > 1 ? (
            <div className="grid gap-2">
              <Label htmlFor="court-sport">Deporte</Label>
              <select id="court-sport" name="sport" className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm">
                {sports.map((s) => (
                  <option key={s} value={s}>
                    {SPORT_LABEL[s]}
                  </option>
                ))}
              </select>
              <FieldError messages={e.sport} />
            </div>
          ) : (
            <input type="hidden" name="sport" value={sports[0]} />
          )}
          <TextField id="court-surface" name="surface" label="Superficie (opcional)" placeholder="Arcilla, dura…" maxLength={40} errors={e.surface} />
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Creando…" : "Agregar cancha"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
