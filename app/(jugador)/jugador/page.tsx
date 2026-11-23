import Link from "next/link";

import { getProfile } from "@/lib/auth/dal";
import { getMyClub } from "@/lib/clubs/queries";
import { listMyActiveMatches } from "@/lib/matches/queries";
import { MATCH_STATUS_LABEL } from "@/lib/tournaments/labels";
import { formatDateTime } from "@/lib/format/dates";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function JugadorHomePage() {
  const profile = await getProfile();
  const club = await getMyClub();

  if (!club) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Tu cuenta no está ligada a un club</CardTitle>
          <CardDescription>
            Regístrate desde el enlace que te compartió tu club, o pide al administrador que te dé de alta.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const matches = profile ? await listMyActiveMatches(profile.id) : [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Hola, {profile?.first_name ?? "jugador"}</h1>
      {matches.length ? (
        <section className="space-y-2">
          <h2 className="font-medium">Tus partidos</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {matches.map((m) => (
              <li key={m.id}>
                <Link href={`/p/${m.token}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">vs {m.rivalName}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.tournamentName} · {m.roundName}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {m.scheduled_at ? formatDateTime(m.scheduled_at, club.timezone) : MATCH_STATUS_LABEL[m.status]}
                  </span>
                  {m.awaitingMe ? (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">Te propusieron horario</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
      <Card>
        <CardHeader>
          <CardTitle>Tus partidos</CardTitle>
          <CardDescription>
            Cuando {club.name} publique los grupos de un torneo en el que estés inscrito, aquí verás tus
            rivales, podrás agendar la cancha y subir los resultados.{" "}
            <Link href="/jugador/torneos" className="font-medium text-foreground underline underline-offset-4">
              Ver torneos
            </Link>
          </CardDescription>
        </CardHeader>
      </Card>
      )}
    </div>
  );
}
