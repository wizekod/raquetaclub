"use client";

import { useActionState } from "react";

import { deleteClub } from "@/lib/superadmin/actions";
import type { FormState } from "@/lib/forms";
import { FormErrorBanner, TextField } from "@/components/forms";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function DeleteClubForm({ id, slug, suspended }: { id: string; slug: string; suspended: boolean }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(deleteClub, {});

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>Borrar club</CardTitle>
          <CardDescription>
            Borra el club con sus canchas, torneos, partidos, archivos y las cuentas de todos sus miembros. No se puede
            deshacer.{suspended ? null : " Primero suspéndelo."}
          </CardDescription>
        </CardHeader>
        {suspended ? (
          <>
            <CardContent className="grid gap-4 sm:max-w-sm">
              <FormErrorBanner error={state.error} />
              <TextField
                id="confirmSlug"
                name="confirmSlug"
                label={`Escribe "${slug}" para confirmar`}
                autoComplete="off"
                required
                errors={state.fieldErrors?.confirmSlug}
              />
            </CardContent>
            <CardFooter>
              <ConfirmSubmit variant="destructive" disabled={pending} message="¿Borrar el club y todo lo suyo? No se puede deshacer.">
                {pending ? "Borrando…" : "Borrar club"}
              </ConfirmSubmit>
            </CardFooter>
          </>
        ) : null}
      </Card>
    </form>
  );
}
