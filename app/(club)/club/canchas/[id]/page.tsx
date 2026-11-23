import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireMyClub } from "@/lib/clubs/queries";
import { getCourt } from "@/lib/courts/queries";
import { hhmm } from "@/lib/format/dates";

import { CourtForm } from "./court-form";
import { HoursEditor } from "./hours-editor";
import { DeleteCourt } from "./delete-court";

export const metadata: Metadata = { title: "Cancha · RaquetaClub" };

export default async function CanchaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const club = await requireMyClub();
  const court = await getCourt(club.id, id);
  if (!court) notFound();

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/club/canchas" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← Canchas
      </Link>
      <h1 className="text-xl font-semibold tracking-tight">{court.name}</h1>
      <CourtForm court={court} sports={club.sports} />
      <HoursEditor
        courtId={court.id}
        initial={court.hours.map((h) => ({ day_of_week: h.day_of_week, open_time: hhmm(h.open_time), close_time: hhmm(h.close_time) }))}
      />
      <DeleteCourt courtId={court.id} />
    </div>
  );
}
