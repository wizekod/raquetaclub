import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { requireRole } from "@/lib/auth/dal";
import { getMyClub } from "@/lib/clubs/queries";
import { enrollInTournament } from "@/lib/tournaments/actions";
import { listTournamentsForPlayer } from "@/lib/tournaments/queries";
import { ENTRY_STATUS_LABEL, STATUS_LABEL, TYPE_LABEL } from "@/lib/tournaments/labels";
import { SPORT_LABEL, formatLongDate } from "@/lib/format/dates";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Torneos · RaquetaClub" };

export default async function JugadorTorneosPage() {
  const profile = await requireRole("player");
  const club = await getMyClub();
  if (!club) return null;
  const tournaments = await listTournamentsForPlayer(club.id, profile.id);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Torneos</h1>
      {tournaments.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {tournaments.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Link href={`/jugador/torneos/${t.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {t.name}
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal">{STATUS_LABEL[t.status]}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {TYPE_LABEL[t.type]} · {SPORT_LABEL[t.sport]}
                    {t.starts_on ? ` · desde el ${formatLongDate(t.starts_on)}` : ""}
                    {t.entry ? ` · Tu inscripción: ${ENTRY_STATUS_LABEL[t.entry.status]}` : ""}
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
              {!t.entry && t.registration_open ? (
                <form action={enrollInTournament}>
                  <input type="hidden" name="tournamentId" value={t.id} />
                  <Button type="submit" size="sm">Inscribirme</Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {club.name} aún no tiene torneos abiertos.
        </p>
      )}
    </div>
  );
}
