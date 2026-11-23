import Link from "next/link";

import type { EntryProfile } from "@/lib/tournaments/ranking";
import { ENTRY_STATUS_LABEL, MATCH_STATUS_LABEL } from "@/lib/tournaments/labels";
import { formatScore } from "@/lib/tournaments/format";
import { formatDateTime } from "@/lib/format/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { MoveIcon } from "./standings-table";

/** Perfil de un jugador dentro de un torneo: récord, historial, partidos y H2H. */
export function EntryProfileView({ profile: p, timeZone, linkBase }: { profile: EntryProfile; timeZone: string; linkBase: string }) {
  const r = p.record;
  const stats = [
    { label: "Ganados", value: r.won + r.wonDefault, hint: r.wonDefault ? `${r.wonDefault} por default` : null },
    { label: "Perdidos", value: r.lost + r.lostDefault, hint: r.lostDefault ? `${r.lostDefault} por default` : null },
    { label: "No jugados", value: r.notPlayed, hint: null },
  ];
  const h2h = [...r.h2h].sort((a, b) => b[1].won + b[1].lost - (a[1].won + a[1].lost));

  return (
    <div className="space-y-6">
      {p.status !== "accepted" ? <p className="text-sm text-muted-foreground">Inscripción: {ENTRY_STATUS_LABEL[p.status as keyof typeof ENTRY_STATUS_LABEL]}</p> : null}

      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
            {s.hint ? <p className="text-xs text-muted-foreground">{s.hint}</p> : null}
          </div>
        ))}
      </div>

      {p.rounds.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Por ronda</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {p.rounds.map((round, i) => {
                const cell = p.history[i];
                return (
                  <li key={round.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="flex-1">
                      {round.number}. {round.name}
                    </span>
                    {cell ? (
                      <>
                        <span>Grupo {cell.level}</span>
                        <span className="w-16 text-right text-muted-foreground tabular-nums">
                          {cell.position ? `${cell.position}.º · ${cell.points} pts` : "en curso"}
                        </span>
                        <span className="w-4">
                          <MoveIcon movement={cell.movement} />
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">No jugó</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {p.matches.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Partidos</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {p.matches.map((m) => {
                const won = m.winner_entry_id === p.entryId;
                const closed = m.status === "confirmed";
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    <span className="flex-1">
                      vs{" "}
                      <Link href={`${linkBase}/${m.rivalEntry}`} className="hover:underline">
                        {m.rivalName}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{m.roundName}</span>
                    </span>
                    {closed ? (
                      <span className={won ? "font-medium text-emerald-600" : "font-medium text-destructive"}>
                        {won ? "G" : "P"} {m.result_type === "default" ? "DEF" : formatScore(m.score, m.entry_b === p.entryId)}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {m.scheduled_at && m.status === "scheduled" ? `${formatDateTime(m.scheduled_at, timeZone)} · ` : ""}
                        {MATCH_STATUS_LABEL[m.status]}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {h2h.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Cara a cara</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {h2h.map(([rival, rec]) => (
                <li key={rival} className="flex items-center gap-3 px-3 py-2">
                  <Link href={`${linkBase}/${rival}`} className="flex-1 hover:underline">
                    {p.names.get(rival) ?? "Jugador"}
                  </Link>
                  <span className="tabular-nums">
                    {rec.won}-{rec.lost}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
