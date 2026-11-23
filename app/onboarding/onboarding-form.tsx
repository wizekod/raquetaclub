"use client";

import { useActionState } from "react";

import { createClub } from "@/lib/clubs/actions";
import type { FormState } from "@/lib/forms";
import { FieldError, FormErrorBanner, TextField } from "@/components/forms";
import { SlugField } from "@/components/clubs/slug-field";
import { TimezoneSelect } from "@/components/clubs/timezone-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function OnboardingForm({ hostBase }: { hostBase: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(createClub, {});

  return (
    <form action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle>Crea tu club</CardTitle>
          <CardDescription>
            El enlace es la página pública donde tus jugadores se registran. Podrás cambiar estos
            datos después en Configuración.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FormErrorBanner error={state.error} />
          <TextField id="name" name="name" label="Nombre del club" required minLength={2} maxLength={80} errors={state.fieldErrors?.name} />
          <SlugField hostBase={hostBase} serverError={state.fieldErrors?.slug} />
          <div className="grid gap-2">
            <Label htmlFor="timezone">Zona horaria</Label>
            <TimezoneSelect />
            <FieldError messages={state.fieldErrors?.timezone} />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creando…" : "Crear club"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
