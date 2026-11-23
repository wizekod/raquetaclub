import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { requireMyClub } from "@/lib/clubs/queries";
import { listTournaments } from "@/lib/tournaments/queries";
import { STATUS_LABEL, TYPE_LABEL } from "@/lib/tournaments/labels";
import { SPORT_LABEL, formatLongDate } from "@/lib/format/dates";

import { NewTournamentForm } from "./new-tournament-form";

export const metadata: Metadata = { title: "Torneos · RaquetaClub" };

export default async function TorneosPage() {
  const club = await requireMyClub();
  const tournaments = await listTournaments(club.id);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Torneos</h1>
        <p className="text-sm text-muted-foreground">
          Escalera (grupos que suben y bajan cada mes) o round robin (todos contra todos).
        </p>
      </div>

      {tournaments.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {tournaments.map((t) => (
            <li key={t.id}>
              <Link href={`/club/torneos/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {t.name}
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal">{STATUS_LABEL[t.status]}</span>
                    {t.registration_open ? (
                      <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-normal text-primary">Inscripción abierta</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {TYPE_LABEL[t.type]} · {SPORT_LABEL[t.sport]}
                    {t.starts_on ? ` · desde el ${formatLongDate(t.starts_on)}` : ""} · {t.accepted} inscritos
                    {t.pending ? ` · ${t.pending} por aceptar` : ""}
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Aún no has creado torneos.
        </p>
      )}

      <NewTournamentForm sports={club.sports} />
    </div>
  );
}
