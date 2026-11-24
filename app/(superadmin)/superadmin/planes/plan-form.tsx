"use client";

import { useActionState } from "react";

import { savePlan } from "@/lib/superadmin/actions";
import type { FormState } from "@/lib/forms";
import { FormErrorBanner, TextField, useSuccessToast } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

type Plan = {
  id: string;
  name: string;
  price: string;
  max_players: string;
  max_active_tournaments: string;
  whatsapp: boolean;
};

export function PlanForm({ plan, clubs }: { plan: Plan | null; clubs: number }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(savePlan, {});
  useSuccessToast(state);
  const e = state.fieldErrors ?? {};
  const key = plan?.id ?? "new";

  return (
    <form action={formAction}>
      {plan ? <input type="hidden" name="id" value={plan.id} /> : null}
      <Card>
        <CardHeader>
          <CardTitle>{plan ? plan.name : "Nuevo plan"}</CardTitle>
          {plan ? <CardDescription>{clubs === 1 ? "1 club" : `${clubs} clubes`} con este plan</CardDescription> : null}
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <div className="sm:col-span-4">
            <FormErrorBanner error={state.error} />
            {state.message ? <p className="text-sm text-muted-foreground">{state.message}</p> : null}
          </div>
          <TextField id={`name-${key}`} name="name" label="Nombre" defaultValue={plan?.name} required maxLength={40} errors={e.name} />
          <TextField id={`price-${key}`} name="price" type="number" min={0} step="0.01" label="Precio mensual (MXN)" defaultValue={plan?.price ?? "0"} errors={e.price} />
          <TextField id={`players-${key}`} name="max_players" type="number" min={0} label="Jugadores activos" placeholder="Ilimitado" defaultValue={plan?.max_players} errors={e.max_players} />
          <TextField id={`tournaments-${key}`} name="max_active_tournaments" type="number" min={0} label="Torneos sin finalizar" placeholder="Ilimitado" defaultValue={plan?.max_active_tournaments} errors={e.max_active_tournaments} />
          <label className="flex items-center gap-2 text-sm sm:col-span-4">
            <input type="checkbox" name="whatsapp" defaultChecked={plan?.whatsapp ?? false} className="size-4" />
            Incluye avisos por WhatsApp (pospuesto: sin credenciales de Meta no se envían)
          </label>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : plan ? "Guardar" : "Crear plan"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
