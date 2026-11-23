"use client";

import { useActionState } from "react";

import {
  changePassword,
  requestEmailChange,
  updateAccountProfile,
} from "@/lib/account/actions";
import type { FormState } from "@/lib/forms";
import { FieldError, FormErrorBanner, TextField, useSuccessToast } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function ProfileCard({
  firstName,
  lastName,
  phone,
  phoneRequired,
}: {
  firstName: string;
  lastName: string;
  phone: string;
  phoneRequired: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(updateAccountProfile, {});
  useSuccessToast(state);
  const e = state.fieldErrors ?? {};

  return (
    <form action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle>Tus datos</CardTitle>
          <CardDescription>
            {phoneRequired
              ? "Revisa que tu teléfono sea correcto: tus rivales lo usan para acordar los partidos."
              : "Tu nombre dentro de la plataforma."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FormErrorBanner error={state.error} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="account-firstName" name="firstName" label="Nombre" defaultValue={firstName} autoComplete="given-name" required errors={e.firstName} />
            <TextField id="account-lastName" name="lastName" label="Apellidos" defaultValue={lastName} autoComplete="family-name" required errors={e.lastName} />
          </div>
          <TextField
            id="account-phone"
            name="phone"
            label="Teléfono"
            type="tel"
            inputMode="tel"
            defaultValue={phone}
            autoComplete="tel"
            required={phoneRequired}
            errors={e.phone}
          />
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar datos"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

function EmailCard({
  email,
  pendingEmail,
}: {
  email: string;
  pendingEmail: string | null;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    requestEmailChange,
    {},
  );
  useSuccessToast(state);

  return (
    <form action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle>Correo electrónico</CardTitle>
          <CardDescription>
            Con él entras a RaquetaClub y te llegan los avisos. Ahora es{" "}
            <span className="font-medium text-foreground">{email}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FormErrorBanner error={state.error} />
          {pendingEmail ? (
            <p className="rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">
              Cambio pendiente a <span className="font-medium">{pendingEmail}</span>:
              abre el enlace que te enviamos para confirmarlo.
            </p>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="account-email">Correo nuevo</Label>
            <Input
              id="account-email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
            <FieldError messages={state.fieldErrors?.email} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="account-email-password">Contraseña actual</Label>
            <Input
              id="account-email-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
            <FieldError messages={state.fieldErrors?.currentPassword} />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Enviando…" : "Cambiar correo"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

function PasswordCard() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    changePassword,
    {},
  );
  useSuccessToast(state);

  return (
    <form action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle>Contraseña</CardTitle>
          <CardDescription>
            Al cambiarla se cierra la sesión en tus otros dispositivos.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FormErrorBanner error={state.error} />
          <div className="grid gap-2">
            <Label htmlFor="account-current-password">Contraseña actual</Label>
            <Input
              id="account-current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
            <FieldError messages={state.fieldErrors?.currentPassword} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="account-new-password">Contraseña nueva</Label>
            <Input
              id="account-new-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <FieldError messages={state.fieldErrors?.password} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="account-confirm-password">Repite la contraseña nueva</Label>
            <Input
              id="account-confirm-password"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <FieldError messages={state.fieldErrors?.confirm} />
          </div>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Cambiar contraseña"}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

/** Datos, correo y contraseña del usuario logueado (cualquier rol). */
export function AccountSettings({
  firstName,
  lastName,
  phone,
  phoneRequired,
  email,
  pendingEmail,
}: {
  firstName: string;
  lastName: string;
  phone: string;
  phoneRequired: boolean;
  email: string;
  pendingEmail: string | null;
}) {
  return (
    <div className="space-y-5">
      <ProfileCard firstName={firstName} lastName={lastName} phone={phone} phoneRequired={phoneRequired} />
      <EmailCard email={email} pendingEmail={pendingEmail} />
      <PasswordCard />
    </div>
  );
}
