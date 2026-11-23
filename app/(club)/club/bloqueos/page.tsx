import type { Metadata } from "next";

import { requireMyClub } from "@/lib/clubs/queries";
import { listCourts, listUpcomingBlocks } from "@/lib/courts/queries";
import { todayInTz } from "@/lib/availability/tz";
import { formatDateTime } from "@/lib/format/dates";

import { BlockForm } from "./block-form";
import { DeleteBlockButton } from "./delete-block-button";

export const metadata: Metadata = { title: "Bloqueos · RaquetaClub" };

export default async function BloqueosPage() {
  const club = await requireMyClub();
  const [courts, blocks] = await Promise.all([listCourts(club.id), listUpcomingBlocks(club.id)]);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Bloquear horarios</h1>
        <p className="text-sm text-muted-foreground">
          Eventos privados, mantenimiento o clases: en esos horarios nadie puede apartar la cancha.
        </p>
      </div>

      <BlockForm courts={courts.map((c) => ({ id: c.id, name: c.name }))} today={todayInTz(club.timezone)} />

      <section className="space-y-3">
        <h2 className="font-semibold">Próximos bloqueos</h2>
        {blocks.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {blocks.map((b) => (
              <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {b.courtName ?? "Todas las canchas"}
                    {b.reason ? <span className="font-normal text-muted-foreground"> · {b.reason}</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(b.start_at, club.timezone)} → {formatDateTime(b.end_at, club.timezone)}
                  </p>
                </div>
                <DeleteBlockButton id={b.id} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No hay bloqueos próximos.</p>
        )}
      </section>
    </div>
  );
}
