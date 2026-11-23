import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { requireMyClub as viewerClub } from "@/lib/clubs/queries";
import { getTournament } from "@/lib/tournaments/queries";
import { getEntryProfile } from "@/lib/tournaments/ranking";
import { EntryProfileView } from "@/components/tournaments/entry-profile-view";

export const metadata: Metadata = { title: "Jugador · RaquetaClub" };

export default async function EntryProfilePage({ params }: { params: Promise<{ id: string; entryId: string }> }) {
  const { id, entryId } = await params;
  const club = await viewerClub();
  const tournament = await getTournament(club.id, id);
  if (!tournament || tournament.status === "draft") notFound();
  const profile = await getEntryProfile(tournament, entryId);
  if (!profile) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href={`/club/torneos/${id}/ranking`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> {tournament.type === "ladder" ? "Escalera" : "Clasificación"}
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{profile.name}</h1>
        <p className="text-sm text-muted-foreground">{tournament.name}</p>
      </div>
      <EntryProfileView profile={profile} timeZone={club.timezone} linkBase={`/club/torneos/${id}/ranking`} />
    </div>
  );
}
