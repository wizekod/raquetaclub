import Link from "next/link";

import { requireMyClub } from "@/lib/clubs/queries";
import { clientEnv } from "@/lib/env";
import { listClubMembers } from "@/lib/players/queries";
import { getPlanUsage, playersFull, tournamentsFull } from "@/lib/clubs/plan";
import { CopyButton } from "@/components/copy-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ClubHomePage() {
  const club = await requireMyClub();
  const [members, plan] = await Promise.all([listClubMembers(club.id), getPlanUsage(club.id)]);
  const limit = (n: number, max: number | null) => (max == null ? `${n}` : `${n} de ${max}`);
  const full = playersFull(plan) || tournamentsFull(plan);
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
            <CardDescription>Plan</CardDescription>
            <CardTitle className="text-xl">{plan.planName ?? "Sin límites"}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm text-muted-foreground">
            <p>Jugadores activos: {limit(plan.players, plan.maxPlayers)}</p>
            <p>Torneos sin finalizar: {limit(plan.tournaments, plan.maxTournaments)}</p>
            {full ? (
              <p className="text-foreground">Llegaste al límite de tu plan. Para crecer, pide un cambio de plan.</p>
            ) : null}
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
