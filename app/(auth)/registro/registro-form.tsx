"use client";

import { useActionState } from "react";
import Link from "next/link";

import { signUpOwner, type AuthFormState } from "@/app/(auth)/actions";
import { FormErrorBanner } from "@/components/forms";
import { SignupFields } from "@/components/auth/signup-fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function RegistroForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signUpOwner, {});

  if (state.message) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Revisa tu correo</CardTitle>
          <CardDescription>{state.message}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Link href="/login" className="text-sm font-medium underline underline-offset-4">
            Volver a iniciar sesión
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <form action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle>Registra tu club</CardTitle>
          <CardDescription>
            Crea tu cuenta de administrador. En el siguiente paso das de alta tu club.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FormErrorBanner error={state.error} />
          <SignupFields state={state} />
        </CardContent>
        <CardFooter className="flex-col gap-3">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Creando cuenta…" : "Crear cuenta"}
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
