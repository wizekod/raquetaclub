import type { Metadata } from "next";

import { SignOutButton } from "@/components/auth/sign-out-button";

export const metadata: Metadata = { title: "Cuenta dada de baja · RaquetaClub" };

/**
 * Destino de `requireRole` cuando el perfil está inactivo. No es /login: con
 * la sesión abierta, el proxy lo devolvería al panel y entraría en bucle.
 */
export default function InactivoPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Tu cuenta está dada de baja</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        El administrador de tu club desactivó tu cuenta. Si crees que es un error, habla con él.
      </p>
      <SignOutButton />
    </div>
  );
}
