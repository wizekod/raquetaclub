"use client";

import { useActionState, useState } from "react";

import { updateClubSettings } from "@/lib/clubs/actions";
import type { FormState } from "@/lib/forms";
import type { ClubRow } from "@/lib/supabase/database.types";
import { FieldError, FormErrorBanner, TextField, useSuccessToast } from "@/components/forms";
import { SlugField } from "@/components/clubs/slug-field";
import { TimezoneSelect } from "@/components/clubs/timezone-select";
import { ImageField } from "@/components/media/image-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

const SPORTS = [
  ["tennis", "Tenis"],
  ["padel", "Pádel"],
] as const;

export function ConfiguracionForm({ club, hostBase }: { club: ClubRow; hostBase: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateClubSettings, {});
  // El logo sube fuera del formulario; no se puede guardar a medias.
  const [uploading, setUploading] = useState(false);
  useSuccessToast(state);
  const e = state.fieldErrors ?? {};

  return (
    <form action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle>Datos del club</CardTitle>
          <CardDescription>
            Aparecen en tu página pública {hostBase}/{club.slug}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <FormErrorBanner error={state.error} />

          <ImageField
            name="logo_path"
            kind="logos"
            clubId={club.id}
            defaultPath={club.logo_path}
            label="Logo"
            fallbackName={club.name}
            color={club.brand_color}
            square
            onBusyChange={setUploading}
          />

          <TextField id="name" name="name" label="Nombre" defaultValue={club.name} required minLength={2} maxLength={80} errors={e.name} />

          <SlugField hostBase={hostBase} defaultValue={club.slug} exceptSelf serverError={e.slug} />

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">Deportes</legend>
            <div className="flex gap-4">
              {SPORTS.map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="sports"
                    value={value}
                    defaultChecked={club.sports.includes(value)}
                    className="size-4 accent-primary"
                  />
                  {label}
                </label>
              ))}
            </div>
            <FieldError messages={e.sports} />
          </fieldset>

          <div className="grid gap-2">
            <Label htmlFor="timezone">Zona horaria</Label>
            <TimezoneSelect defaultValue={club.timezone} />
            <FieldError messages={e.timezone} />
          </div>

          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <TextField
              id="phone_country_code"
              name="phone_country_code"
              label="Lada del país"
              inputMode="numeric"
              defaultValue={club.phone_country_code}
              required
              maxLength={4}
              hint="52 México, 34 España…"
              errors={e.phone_country_code}
            />
            <TextField id="phone" name="phone" label="Teléfono del club" type="tel" defaultValue={club.phone ?? ""} maxLength={30} errors={e.phone} />
          </div>

          <TextField id="address" name="address" label="Dirección" defaultValue={club.address ?? ""} maxLength={200} errors={e.address} />

          <div className="grid gap-2">
            <Label htmlFor="brand_color">Color del club</Label>
            <input
              id="brand_color"
              name="brand_color"
              type="color"
              defaultValue={club.brand_color ?? "#1f8a4c"}
              className="h-10 w-20 cursor-pointer rounded-lg border border-input bg-transparent p-1"
            />
            <FieldError messages={e.brand_color} />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending || uploading}>
            {pending ? "Guardando…" : uploading ? "Subiendo logo…" : "Guardar cambios"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
