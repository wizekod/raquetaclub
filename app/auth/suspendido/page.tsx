import type { Metadata } from "next";

import { SignOutButton } from "@/components/auth/sign-out-button";

export const metadata: Metadata = { title: "Club suspendido · RaquetaClub" };

/** Destino de `requireRole` cuando el club del usuario está suspendido. */
export default function SuspendidoPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Tu club está suspendido</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Por ahora no se puede entrar al panel ni jugar los partidos del club. Si eres administrador, escríbenos para
        reactivarlo; si eres jugador, habla con tu club.
      </p>
      <SignOutButton />
    </div>
  );
}
