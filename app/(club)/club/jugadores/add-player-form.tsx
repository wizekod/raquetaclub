"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { addPlayer } from "@/lib/players/actions";
import type { FormState } from "@/lib/forms";
import { FormErrorBanner, TextField, useSuccessToast } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Mode = "invite" | "password";

/** Alta de jugador por el admin: invitación por correo o contraseña temporal. */
export function AddPlayerForm({ phoneHint }: { phoneHint?: string }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(addPlayer, {});
  const [mode, setMode] = useState<Mode>("invite");
  const formRef = useRef<HTMLFormElement>(null);
  useSuccessToast(state);
  const e = state.fieldErrors ?? {};

  // Tras un alta correcta, formulario limpio para el siguiente.
  useEffect(() => {
    if (state.message) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="mode" value={mode} />
      <Card>
        <CardHeader>
          <CardTitle>Dar de alta un jugador</CardTitle>
          <CardDescription>
            También pueden registrarse solos con el enlace de registro de tu club.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FormErrorBanner error={state.error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="p-firstName" name="firstName" label="Nombre" required errors={e.firstName} />
            <TextField id="p-lastName" name="lastName" label="Apellidos" required errors={e.lastName} />
            <TextField id="p-email" name="email" label="Correo" type="email" required errors={e.email} />
            <TextField id="p-phone" name="phone" label="Teléfono" type="tel" inputMode="tel" required hint={phoneHint} errors={e.phone} />
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Acceso</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["invite", "Enviar invitación por correo", "El jugador define su contraseña desde el enlace."],
                  ["password", "Contraseña temporal", "Sin correo: tú le compartes la contraseña."],
                ] as const
              ).map(([value, title, desc]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  aria-pressed={mode === value}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    mode === value ? "border-primary bg-primary/5" : "border-border hover:bg-muted",
                  )}
                >
                  <span className="font-medium">{title}</span>
                  <span className="block text-xs text-muted-foreground">{desc}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {mode === "password" ? (
            <TextField
              id="p-password"
              name="password"
              label="Contraseña temporal"
              type="text"
              autoComplete="off"
              minLength={8}
              required
              hint="Mínimo 8 caracteres. El jugador puede cambiarla en Mi cuenta."
              errors={e.password}
            />
          ) : null}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : mode === "invite" ? "Enviar invitación" : "Crear cuenta"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
