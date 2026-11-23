"use client";

import { useActionState } from "react";

import { createTournament } from "@/lib/tournaments/actions";
import type { FormState } from "@/lib/forms";
import { SPORT_LABEL } from "@/lib/format/dates";
import { TYPE_LABEL } from "@/lib/tournaments/labels";
import { FieldError, FormErrorBanner, TextField } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function NewTournamentForm({ sports }: { sports: ("tennis" | "padel")[] }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createTournament, {});
  const e = state.fieldErrors ?? {};

  return (
    <form action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle>Nuevo torneo</CardTitle>
          <CardDescription>
            Nace en borrador con las reglas de la escalera (5 por grupo, suben 2 y bajan 2). Las ajustas en el siguiente paso.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormErrorBanner error={state.error} />
          </div>
          <div className="sm:col-span-2">
            <TextField id="t-name" name="name" label="Nombre" placeholder="Escalera 2027" required maxLength={80} errors={e.name} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="t-type">Tipo</Label>
            <NativeSelect id="t-type" name="type" defaultValue="ladder">
              {(Object.keys(TYPE_LABEL) as (keyof typeof TYPE_LABEL)[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </NativeSelect>
            <FieldError messages={e.type} />
          </div>
          {sports.length > 1 ? (
            <div className="grid gap-2">
              <Label htmlFor="t-sport">Deporte</Label>
              <NativeSelect id="t-sport" name="sport">
                {sports.map((s) => (
                  <option key={s} value={s}>
                    {SPORT_LABEL[s]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : (
            <input type="hidden" name="sport" value={sports[0]} />
          )}
          <TextField id="t-starts" name="starts_on" type="date" label="Inicio" errors={e.starts_on} />
          <TextField id="t-ends" name="ends_on" type="date" label="Fin" errors={e.ends_on} />
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Creando…" : "Crear torneo"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
