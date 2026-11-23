import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { requireMyClub } from "@/lib/clubs/queries";
import { listClubMembers } from "@/lib/players/queries";
import { getTournament, listEntries, listRounds, suggestedRound } from "@/lib/tournaments/queries";
import { deleteTournament, setEntryStatus } from "@/lib/tournaments/actions";
import { parseConfig } from "@/lib/tournaments/config";
import { ENTRY_STATUS_LABEL, ROUND_STATUS_LABEL, STATUS_LABEL, TYPE_LABEL } from "@/lib/tournaments/labels";
import { SPORT_LABEL, formatLongDate } from "@/lib/format/dates";
import { fullName } from "@/lib/utils";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { AddEntryForm } from "./add-entry-form";
import { ConfigForm } from "./config-form";
import { NewRoundForm } from "./new-round-form";
import { SeedsForm } from "./seeds-form";
import { TournamentForm } from "./tournament-form";

export const metadata: Metadata = { title: "Torneo · RaquetaClub" };

export default async function TorneoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const club = await requireMyClub();
  const tournament = await getTournament(club.id, id);
  if (!tournament) notFound();

  const [entries, rounds, members] = await Promise.all([listEntries(id), listRounds(id), listClubMembers(club.id)]);
  const openRound = rounds.find((r) => r.status !== "closed");
  const suggestion = openRound ? null : await suggestedRound(tournament, club.timezone);
  const pending = entries.filter((e) => e.status === "pending");
  const accepted = entries.filter((e) => e.status === "accepted");
  const others = entries.filter((e) => e.status !== "pending" && e.status !== "accepted");
  const enrolled = new Set(entries.map((e) => e.player_id));
  const candidates = members
    .filter((m) => m.status === "active" && !enrolled.has(m.id))
    .map((m) => ({ id: m.id, name: fullName({ first_name: m.firstName, last_name: m.lastName }) }));
  const canDelete = !rounds.some((r) => r.status !== "draft");

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/club/torneos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Torneos
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{tournament.name}</h1>
        <p className="text-sm text-muted-foreground">
          {TYPE_LABEL[tournament.type]} · {SPORT_LABEL[tournament.sport]} · {STATUS_LABEL[tournament.status]}
        </p>
      </div>

      {/* ───────────── inscripciones ───────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Inscripciones</CardTitle>
          <CardDescription>
            {accepted.length} aceptados{pending.length ? ` · ${pending.length} por aceptar` : ""}. Los jugadores se inscriben desde su panel
            mientras la inscripción esté abierta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {pending.length ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Por aceptar</p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {pending.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="flex-1 text-sm">{e.name}</span>
                    <form action={setEntryStatus}>
                      <input type="hidden" name="entryId" value={e.id} />
                      <input type="hidden" name="status" value="accepted" />
                      <Button type="submit" size="sm">Aceptar</Button>
                    </form>
                    <form action={setEntryStatus}>
                      <input type="hidden" name="entryId" value={e.id} />
                      <input type="hidden" name="status" value="rejected" />
                      <Button type="submit" size="sm" variant="ghost">Rechazar</Button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {accepted.length ? <SeedsForm tournamentId={id} entries={accepted} /> : null}

          {others.length ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Fuera del torneo</p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {others.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="flex-1 text-sm">
                      {e.name} <span className="text-xs text-muted-foreground">· {ENTRY_STATUS_LABEL[e.status]}</span>
                    </span>
                    <form action={setEntryStatus}>
                      <input type="hidden" name="entryId" value={e.id} />
                      <input type="hidden" name="status" value="accepted" />
                      <Button type="submit" size="sm" variant="outline">Reincorporar</Button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <AddEntryForm tournamentId={id} candidates={candidates} />
        </CardContent>
      </Card>

      {/* ───────────── rondas ───────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Rondas</CardTitle>
          <CardDescription>
            {tournament.type === "ladder"
              ? "Una ronda por mes. En cada ronda armas los grupos y la publicas: ahí se generan los partidos."
              : "Arma los grupos y publica la ronda: ahí se generan los partidos de todos contra todos."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rounds.length ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {rounds.map((r) => (
                <li key={r.id}>
                  <Link href={`/club/torneos/${id}/rondas/${r.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50">
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {r.number}. {r.name}
                        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal">{ROUND_STATUS_LABEL[r.status]}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatLongDate(r.starts_on)} al {formatLongDate(r.ends_on)}
                      </p>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {suggestion ? (
            <NewRoundForm tournamentId={id} suggestion={suggestion} />
          ) : (
            <p className="text-xs text-muted-foreground">
              La siguiente ronda se crea cuando se cierre la actual (en su fecha límite de resultados).
            </p>
          )}
        </CardContent>
      </Card>

      <TournamentForm tournament={tournament} clubId={club.id} sports={club.sports} />
      <ConfigForm tournamentId={id} type={tournament.type} config={parseConfig(tournament.config)} />

      {canDelete ? (
        <form action={deleteTournament} className="flex items-center justify-between rounded-xl border border-destructive/30 p-4">
          <input type="hidden" name="id" value={id} />
          <div>
            <p className="text-sm font-medium">Borrar torneo</p>
            <p className="text-xs text-muted-foreground">Sólo mientras no haya rondas publicadas. Borra también las inscripciones.</p>
          </div>
          <ConfirmSubmit message="¿Borrar el torneo y sus inscripciones? No se puede deshacer." variant="destructive" size="sm">
            Borrar
          </ConfirmSubmit>
        </form>
      ) : null}
    </div>
  );
}
