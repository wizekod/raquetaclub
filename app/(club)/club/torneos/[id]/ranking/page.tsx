import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { requireMyClub } from "@/lib/clubs/queries";

async function viewer(id: string) {
  void id;
  return { club: await requireMyClub(), highlight: null };
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
        <Link href={`/club/torneos/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> {tournament.name}
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{tournament.type === "ladder" ? "Escalera" : "Clasificación"}</h1>
      </div>
      {ranking ? (
        <RankingView ranking={ranking} linkBase={`/club/torneos/${id}/ranking`} highlight={highlight} />
      ) : (
        <p className="text-sm text-muted-foreground">Aún no hay rondas publicadas.</p>
      )}
    </div>
  );
}
