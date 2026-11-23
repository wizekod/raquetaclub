import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileText } from "lucide-react";

import { requireRole } from "@/lib/auth/dal";
import { getMyClub } from "@/lib/clubs/queries";
import { enrollInTournament } from "@/lib/tournaments/actions";
import { getActiveRound, getRoundDetail, getRoundTables, listTournamentsForPlayer } from "@/lib/tournaments/queries";
import { parseConfig } from "@/lib/tournaments/config";
import { formatScore } from "@/lib/tournaments/format";
import { StandingsTable } from "@/components/tournaments/standings-table";
import { ENTRY_STATUS_LABEL, MATCH_STATUS_LABEL, STATUS_LABEL, TYPE_LABEL } from "@/lib/tournaments/labels";
import { formatDateTime, formatLongDate } from "@/lib/format/dates";
import { mediaUrl } from "@/lib/storage/media";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Torneo · RaquetaClub" };

export default async function JugadorTorneoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireRole("player");
  const club = await getMyClub();
  if (!club) notFound();
  const t = (await listTournamentsForPlayer(club.id, profile.id)).find((x) => x.id === id);
  if (!t) notFound();

  const round = await getActiveRound(id);
  const detail = round ? await getRoundDetail(round.id) : null;
  const myGroup = t.entry ? detail?.groups.find((g) => g.members.some((m) => m.entry_id === t.entry!.id)) : undefined;
  const myMatches = myGroup ? detail!.matches.filter((m) => m.entry_a === t.entry!.id || m.entry_b === t.entry!.id) : [];
  const pdf = mediaUrl(t.rules_pdf_path);
  const tables = detail && myGroup ? await getRoundTables(detail, parseConfig(t.config), club.timezone) : null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/jugador/torneos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Torneos
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{t.name}</h1>
        <p className="text-sm text-muted-foreground">
          {TYPE_LABEL[t.type]} · {STATUS_LABEL[t.status]}
          {t.entry ? ` · Tu inscripción: ${ENTRY_STATUS_LABEL[t.entry.status]}` : ""}
        </p>
      </div>

      {!t.entry && t.registration_open ? (
        <form action={enrollInTournament}>
          <input type="hidden" name="tournamentId" value={t.id} />
          <Button type="submit">Inscribirme</Button>
        </form>
      ) : null}

      {round && detail ? (
        <Card>
          <CardHeader>
            <CardTitle>
              Ronda {round.number}: {round.name}
            </CardTitle>
            <CardDescription>
              {formatLongDate(round.starts_on)} al {formatLongDate(round.ends_on)} · resultados a más tardar el{" "}
              {formatDateTime(round.results_deadline, club.timezone)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {myGroup ? (
              <>
                <div>
                  <p className="text-sm font-medium">Tu grupo: {myGroup.name}</p>
                </div>
                <StandingsTable rows={tables?.get(myGroup.id) ?? []} highlight={t.entry!.id} />
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {myMatches.map((m) => (
                    <li key={m.id}>
                      <Link href={`/p/${m.booking_token}`} className="flex flex-wrap items-center gap-x-3 px-3 py-2 text-sm hover:bg-muted/50">
                        <span className="flex-1">
                          vs {m.entry_a === t.entry!.id ? m.name_b : m.name_a}
                        </span>
                        {m.score ? <span className="font-medium tabular-nums">{formatScore(m.score, m.entry_b === t.entry!.id)}</span> : null}
                        <span className="text-xs text-muted-foreground">
                          {m.scheduled_at && !m.score ? `${formatDateTime(m.scheduled_at, club.timezone)} · ` : ""}
                          {MATCH_STATUS_LABEL[m.status]}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">Abre un partido para proponer horario, apartar la cancha y subir el resultado.</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No juegas en esta ronda.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {t.rules_text || pdf ? (
        <Card>
          <CardHeader>
            <CardTitle>Reglamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pdf ? (
              <a href={pdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4">
                <FileText className="size-4" /> Descargar PDF
              </a>
            ) : null}
            {t.rules_text ? <p className="whitespace-pre-line text-sm">{t.rules_text}</p> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
