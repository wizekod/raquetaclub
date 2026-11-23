import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { requireRole } from "@/lib/auth/dal";
import { getMyClub } from "@/lib/clubs/queries";
import { createClient } from "@/lib/supabase/server";

/** Club del jugador y su inscripción en el torneo (para resaltar su fila). */
async function viewer(id: string) {
  const profile = await requireRole("player");
  const club = await getMyClub();
  if (!club) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("tournament_entries").select("id").eq("tournament_id", id).eq("player_id", profile.id).maybeSingle();
  return { club, highlight: data?.id ?? null };
}
import { getTournament } from "@/lib/tournaments/queries";
import { getRanking } from "@/lib/tournaments/ranking";
import { RankingView } from "@/components/tournaments/ranking-view";

export const metadata: Metadata = { title: "Ranking · RaquetaClub" };

export default async function RankingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { club, highlight } = await viewer(id);
  const tournament = await getTournament(club.id, id);
  if (!tournament || tournament.status === "draft") notFound();
  const ranking = await getRanking(tournament, club.timezone);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href={`/jugador/torneos/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> {tournament.name}
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{tournament.type === "ladder" ? "Escalera" : "Clasificación"}</h1>
      </div>
      {ranking ? (
        <RankingView ranking={ranking} linkBase={`/jugador/torneos/${id}/ranking`} highlight={highlight} />
      ) : (
        <p className="text-sm text-muted-foreground">Aún no hay rondas publicadas.</p>
      )}
    </div>
  );
}
