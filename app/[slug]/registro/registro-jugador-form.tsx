"use client";

import { useActionState } from "react";
import Link from "next/link";

import { registerPlayer, type AuthFormState } from "@/app/(auth)/actions";
import { FormErrorBanner } from "@/components/forms";
import { SignupFields } from "@/components/auth/signup-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function RegistroJugadorForm({
  slug,
  clubName,
  phoneHint,
}: {
  slug: string;
  clubName: string;
  phoneHint?: string;
}) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(registerPlayer, {});

  if (state.message) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Revisa tu correo</CardTitle>
          <CardDescription>{state.message}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Link href="/login" className="text-sm font-medium underline underline-offset-4">
            Ir a iniciar sesión
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="slug" value={slug} />
      <Card>
        <CardHeader>
          <CardTitle>Regístrate en {clubName}</CardTitle>
          <CardDescription>
            Con tu cuenta te inscribes a los torneos, agendas tus partidos y ves los rankings.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FormErrorBanner error={state.error} />
          <SignupFields state={state} phoneHint={phoneHint} />
        </CardContent>
        <CardFooter className="flex-col gap-3">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creando cuenta…" : "Crear mi cuenta"}
          </Button>
          <p className="text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-medium underline underline-offset-4">
              Inicia sesión
            </Link>
          </p>
        </CardFooter>
      </Card>
    </form>
  );
}
