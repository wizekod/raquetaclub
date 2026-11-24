"use client";

import { useActionState } from "react";

import { updateClubPlan } from "@/lib/superadmin/actions";
import type { FormState } from "@/lib/forms";
import { FieldError, FormErrorBanner, TextField, useSuccessToast } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  club: { id: string; status: "active" | "trial" | "suspended"; planId: string; trialEndsOn: string };
  plans: { id: string; label: string }[];
};

export function ClubPlanForm({ club, plans }: Props) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateClubPlan, {});
  useSuccessToast(state);
  const e = state.fieldErrors ?? {};

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={club.id} />
      <Card>
        <CardHeader>
          <CardTitle>Plan y estado</CardTitle>
          <CardDescription>
            Mientras Stripe está en pausa, el plan se asigna aquí. Bajar de plan no da de baja a nadie: sólo impide
            sumar jugadores o torneos por encima del límite. Suspender bloquea el panel y los partidos del club.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <FormErrorBanner error={state.error} />
            {state.message ? <p className="text-sm text-muted-foreground">{state.message}</p> : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="plan_id">Plan</Label>
            <NativeSelect id="plan_id" name="plan_id" defaultValue={club.planId}>
              <option value="">Sin plan (sin límites)</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
            <FieldError messages={e.plan_id} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="status">Estado</Label>
            <NativeSelect id="status" name="status" defaultValue={club.status}>
              <option value="trial">Prueba</option>
              <option value="active">Activo</option>
              <option value="suspended">Suspendido</option>
            </NativeSelect>
            <FieldError messages={e.status} />
          </div>
          <TextField
            id="trial_ends_on"
            name="trial_ends_on"
            type="date"
            label="Fin de la prueba"
            defaultValue={club.trialEndsOn}
            hint="Informativo por ahora"
            errors={e.trial_ends_on}
          />
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
