import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { requireRole } from "@/lib/auth/dal";
import { getMyClub } from "@/lib/clubs/queries";
import { listTournamentsForPlayer } from "@/lib/tournaments/queries";
import { STATUS_LABEL, TYPE_LABEL } from "@/lib/tournaments/labels";

export const metadata: Metadata = { title: "Rankings · RaquetaClub" };

/** Torneos del club con ranking: los que ya están en curso o terminaron. */
export default async function RankingsPage() {
  const profile = await requireRole("player");
  const club = await getMyClub();
  if (!club) return null;
  const tournaments = (await listTournamentsForPlayer(club.id, profile.id)).filter((t) => t.status === "active" || t.status === "finished");

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Rankings</h1>
      {tournaments.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {tournaments.map((t) => (
            <li key={t.id}>
              <Link href={`/jugador/torneos/${t.id}/ranking`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <div className="flex-1">
                  <p className="font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {TYPE_LABEL[t.type]} · {STATUS_LABEL[t.status]}
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Aún no hay torneos en curso.
        </p>
      )}
    </div>
  );
}
