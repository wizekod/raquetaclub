import Link from "next/link";

import { getMyClub } from "@/lib/clubs/queries";
import { clientEnv } from "@/lib/env";
import { listClubMembers } from "@/lib/players/queries";
import { CopyButton } from "@/components/copy-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ClubHomePage() {
  const club = (await getMyClub())!;
  const members = await listClubMembers(club.id);
  const players = members.filter((m) => m.role === "player");
  const active = players.filter((p) => p.status === "active" && !p.pending).length;
  const pending = players.filter((p) => p.pending).length;
  const signupUrl = `${clientEnv.NEXT_PUBLIC_APP_URL}/${club.slug}/registro`;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Inicio</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Jugadores activos</CardDescription>
            <CardTitle className="text-3xl">{active}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {pending ? `${pending} con invitación pendiente. ` : null}
            <Link href="/club/jugadores" className="font-medium text-foreground underline underline-offset-4">
              Ver jugadores
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Enlace de registro para jugadores</CardDescription>
            <CardTitle className="break-all text-sm font-medium">{signupUrl}</CardTitle>
          </CardHeader>
          <CardContent>
            <CopyButton value={signupUrl} label="Copiar enlace" />
            <p className="mt-2 text-xs text-muted-foreground">
              Compártelo por WhatsApp: cada jugador se registra con nombre, apellidos, correo, teléfono y contraseña.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
