"use client";

import { useActionState, useState } from "react";

import { updateTournament } from "@/lib/tournaments/actions";
import type { FormState } from "@/lib/forms";
import type { TournamentRow } from "@/lib/supabase/database.types";
import { SPORT_LABEL } from "@/lib/format/dates";
import { STATUS_LABEL } from "@/lib/tournaments/labels";
import { FieldError, FormErrorBanner, TextField, useSuccessToast } from "@/components/forms";
import { PdfField } from "@/components/media/pdf-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function TournamentForm({
  tournament: t,
  clubId,
  sports,
}: {
  tournament: TournamentRow;
  clubId: string;
  sports: ("tennis" | "padel")[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateTournament, {});
  const [uploading, setUploading] = useState(false);
  useSuccessToast(state);
  const e = state.fieldErrors ?? {};

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={t.id} />
      <Card>
        <CardHeader>
          <CardTitle>Datos y reglamento</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormErrorBanner error={state.error} />
          </div>
          <div className="sm:col-span-2">
            <TextField id="name" name="name" label="Nombre" defaultValue={t.name} required maxLength={80} errors={e.name} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="status">Estado</Label>
            <NativeSelect id="status" name="status" defaultValue={t.status}>
              {(Object.keys(STATUS_LABEL) as (keyof typeof STATUS_LABEL)[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">En borrador sólo lo ven los administradores.</p>
          </div>
          {sports.length > 1 ? (
            <div className="grid gap-2">
              <Label htmlFor="sport">Deporte</Label>
              <NativeSelect id="sport" name="sport" defaultValue={t.sport}>
                {sports.map((s) => (
                  <option key={s} value={s}>
                    {SPORT_LABEL[s]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : (
            <input type="hidden" name="sport" value={t.sport} />
          )}
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="registration_open" defaultChecked={t.registration_open} className="size-4 accent-primary" />
            Inscripción abierta: los jugadores del club pueden inscribirse
          </label>
          <div className="sm:col-span-2">
            <FieldError messages={e.registration_open} />
          </div>
          <TextField id="starts_on" name="starts_on" type="date" label="Inicio" defaultValue={t.starts_on ?? ""} errors={e.starts_on} />
          <TextField id="ends_on" name="ends_on" type="date" label="Fin" defaultValue={t.ends_on ?? ""} errors={e.ends_on} />
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="rules_text">Reglamento</Label>
            <Textarea id="rules_text" name="rules_text" defaultValue={t.rules_text ?? ""} rows={8} maxLength={20_000} placeholder="Bases del torneo: formato, puntos, horarios, sanciones…" />
            <FieldError messages={e.rules_text} />
          </div>
          <div className="sm:col-span-2">
            <PdfField name="rules_pdf_path" clubId={clubId} defaultPath={t.rules_pdf_path} label="Reglamento en PDF (opcional)" onBusyChange={setUploading} />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending || uploading}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
