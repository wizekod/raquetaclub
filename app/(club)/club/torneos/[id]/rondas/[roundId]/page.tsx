import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { requireMyClub } from "@/lib/clubs/queries";
import { getRoundDetail, getTournament, listEntries } from "@/lib/tournaments/queries";
import { deleteRound } from "@/lib/tournaments/actions";
import { parseConfig } from "@/lib/tournaments/config";
import { groupSizes } from "@/lib/tournaments/ladder";
import { MATCH_STATUS_LABEL, ROUND_STATUS_LABEL } from "@/lib/tournaments/labels";
import { formatDateTime, formatLongDate } from "@/lib/format/dates";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { GroupsForm, PublishRoundForm, RoundForm, SuggestGroupsForm } from "./round-editor";

export const metadata: Metadata = { title: "Ronda · RaquetaClub" };

export default async function RondaPage({ params }: { params: Promise<{ id: string; roundId: string }> }) {
  const { id, roundId } = await params;
  const club = await requireMyClub();
  const [tournament, detail] = await Promise.all([getTournament(club.id, id), getRoundDetail(roundId)]);
  if (!tournament || !detail || detail.round.tournament_id !== id) notFound();

  const { round, groups, matches } = detail;
  const config = parseConfig(tournament.config);
  const isDraft = round.status === "draft";
  const accepted = isDraft ? (await listEntries(id)).filter((e) => e.status === "accepted") : [];
  const levelOf = new Map(groups.flatMap((g) => g.members.map((m) => [m.entry_id, g.level] as const)));
  const maxLevel = Math.max(groups.length, groupSizes(accepted.length, config.group_size).length) + 1;
  const unassigned = accepted.filter((e) => !levelOf.has(e.id));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href={`/club/torneos/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> {tournament.name}
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          Ronda {round.number}: {round.name}
          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 align-middle text-xs font-normal">{ROUND_STATUS_LABEL[round.status]}</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatLongDate(round.starts_on)} al {formatLongDate(round.ends_on)} · resultados a más tardar el{" "}
          {formatDateTime(round.results_deadline, club.timezone)}
        </p>
      </div>

      {isDraft ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Grupos</CardTitle>
              <CardDescription>
                Elige el grupo de cada jugador (1 = el más alto) o usa la sugerencia por siembra: grupos de {config.group_size}, con los
                sobrantes repartidos en los de abajo. Nadie ve la ronda hasta que la publiques.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SuggestGroupsForm roundId={round.id} />
              {groups.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {groups.map((g) => (
                    <div key={g.id} className="rounded-lg border border-border p-3">
                      <p className="text-sm font-medium">
                        {g.name} <span className="text-xs font-normal text-muted-foreground">· {g.members.length} jugadores</span>
                      </p>
                      <ol className="mt-1 list-decimal pl-5 text-sm">
                        {g.members.map((m) => (
                          <li key={m.entry_id}>{m.name}</li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              ) : null}
              {unassigned.length && groups.length ? (
                <p className="text-sm text-muted-foreground">
                  Sin grupo: {unassigned.map((e) => e.name).join(", ")}.
                </p>
              ) : null}
              <GroupsForm
                roundId={round.id}
                maxLevel={maxLevel}
                entries={accepted.map((e) => ({ id: e.id, name: e.name, seed: e.seed, level: levelOf.get(e.id) ?? null }))}
              />
            </CardContent>
          </Card>

          <PublishRoundForm roundId={round.id} ready={groups.length > 0} matchCount={groups.reduce((n, g) => n + (g.members.length * (g.members.length - 1)) / 2, 0)} />
          <RoundForm round={round} />

          <form action={deleteRound} className="flex items-center justify-between rounded-xl border border-destructive/30 p-4">
            <input type="hidden" name="roundId" value={round.id} />
            <div>
              <p className="text-sm font-medium">Borrar ronda</p>
              <p className="text-xs text-muted-foreground">Sólo en borrador.</p>
            </div>
            <ConfirmSubmit message="¿Borrar la ronda y sus grupos?" variant="destructive" size="sm">
              Borrar
            </ConfirmSubmit>
          </form>
        </>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const gm = matches.filter((m) => m.group_id === g.id);
            return (
              <Card key={g.id}>
                <CardHeader>
                  <CardTitle>{g.name}</CardTitle>
                  <CardDescription>{g.members.map((m) => m.name).join(" · ")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {gm.map((m) => (
                      <li key={m.id}>
                        <Link href={`/p/${m.booking_token}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm hover:bg-muted/50">
                          <span className="flex-1">
                            {m.name_a} <span className="text-muted-foreground">vs</span> {m.name_b}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {m.scheduled_at ? `${formatDateTime(m.scheduled_at, club.timezone)} · ` : ""}
                            {MATCH_STATUS_LABEL[m.status]}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
          {round.status === "active" ? <RoundForm round={round} /> : null}
        </div>
      )}
    </div>
  );
}
