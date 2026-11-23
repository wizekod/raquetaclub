import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { requireMyClub } from "@/lib/clubs/queries";
import { listCourts } from "@/lib/courts/queries";
import { SPORT_LABEL, summarizeHours } from "@/lib/format/dates";

import { NewCourtForm } from "./new-court-form";

export const metadata: Metadata = { title: "Canchas · RaquetaClub" };

export default async function CanchasPage() {
  const club = await requireMyClub();
  const courts = await listCourts(club.id);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Canchas</h1>
        <p className="text-sm text-muted-foreground">
          Los jugadores sólo pueden apartar una cancha activa, dentro de su horario y fuera de los bloqueos.
        </p>
      </div>

      {courts.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {courts.map((c) => (
            <li key={c.id}>
              <Link href={`/club/canchas/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {c.name}
                    {!c.active ? <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal">Inactiva</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {SPORT_LABEL[c.sport]}
                    {c.surface ? ` · ${c.surface}` : ""} · {summarizeHours(c.hours)}
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Aún no has dado de alta canchas.
        </p>
      )}

      <NewCourtForm sports={club.sports} />
    </div>
  );
}
