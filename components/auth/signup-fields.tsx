"use client";

import { useState } from "react";

import type { FormState } from "@/lib/forms";
import { TextField } from "@/components/forms";
import { TurnstileWidget } from "@/components/security/turnstile-widget";

/**
 * Datos de alta comunes a dueño y jugador: nombre, apellidos, teléfono,
 * correo y contraseña (requisitos del producto), más el anti-spam.
 */
export function SignupFields({ state, phoneHint }: { state: FormState; phoneHint?: string }) {
  const [token, setToken] = useState("");
  const e = state.fieldErrors ?? {};

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="firstName" name="firstName" label="Nombre" autoComplete="given-name" required errors={e.firstName} />
        <TextField id="lastName" name="lastName" label="Apellidos" autoComplete="family-name" required errors={e.lastName} />
      </div>
      <TextField
        id="phone"
        name="phone"
        label="Teléfono"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required
        hint={phoneHint}
        errors={e.phone}
      />
      <TextField id="email" name="email" label="Correo" type="email" autoComplete="email" required errors={e.email} />
      <TextField
        id="password"
        name="password"
        label="Contraseña"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        hint="Mínimo 8 caracteres."
        errors={e.password}
      />
      <input type="hidden" name="cf-turnstile-response" value={token} />
      <TurnstileWidget onToken={setToken} />
    </>
  );
}
