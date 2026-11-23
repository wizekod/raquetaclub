import Link from "next/link";
import { Award as AwardIcon, TrendingUp, Trophy } from "lucide-react";

import type { Ranking } from "@/lib/tournaments/ranking";
import { ROUND_STATUS_LABEL } from "@/lib/tournaments/labels";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { MoveIcon, StandingsTable } from "./standings-table";

/**
 * Ranking de un torneo: premios de la temporada, grupos de la ronda vigente
 * (la escalera) e historial de grupos por ronda. Lo usan el panel del club y
 * el del jugador; `linkBase` apunta a sus perfiles.
 */
export function RankingView({ ranking: r, linkBase, highlight }: { ranking: Ranking; linkBase: string; highlight?: string | null }) {
  const ladder = r.tournament.type === "ladder";
  const awards = r.awards
    ? [
        { icon: Trophy, title: "Más consistente", hint: "veces 1.º del grupo 1", award: r.awards.most_consistent },
        { icon: TrendingUp, title: "Mejor ascenso", hint: "veces que subió de grupo", award: r.awards.best_ascent },
        { icon: AwardIcon, title: "Más competitivo", hint: "partidos jugados", award: r.awards.most_competitive },
      ]
    : [];

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Ronda {r.current.number}: {r.current.name} · {ROUND_STATUS_LABEL[r.current.status]}
        {r.current.status === "active" ? " · tablas en vivo con los resultados confirmados" : ""}
      </p>

      {ladder && awards.length ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {awards.map(({ icon: Icon, title, hint, award }) => (
            <div key={title} className="rounded-xl border border-border bg-card p-4">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="size-4" /> {title}
              </p>
              <p className="mt-1 font-medium">{award.entry_ids.length ? award.entry_ids.map((id) => r.names.get(id)).join(", ") : "—"}</p>
              {award.value ? (
                <p className="text-xs text-muted-foreground">
                  {award.value} {hint}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-4">
        {r.groups.map((g) => (
          <Card key={g.id}>
            <CardHeader>
              <CardTitle>{g.name}</CardTitle>
              {ladder ? (
                <CardDescription>
                  Posiciones {r.ladder.find((x) => x.level === g.level)?.rank}–{r.ladder.filter((x) => x.level <= g.level).length} de la escalera
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent>
              <StandingsTable rows={g.rows} highlight={highlight} linkBase={linkBase} />
            </CardContent>
          </Card>
        ))}
      </div>

      {ladder && r.rounds.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Historial</CardTitle>
            <CardDescription>Grupo de cada jugador por ronda y su movimiento.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-1.5 pr-2 text-left font-normal">Jugador</th>
                  {r.rounds.map((round) => (
                    <th key={round.id} className="px-1 py-1.5 text-center font-normal" title={round.name}>
                      {round.name.slice(0, 3)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.ladder.map((row) => (
                  <tr key={row.entry_id} className={cn("border-b border-border last:border-0", row.entry_id === highlight && "bg-primary/5 font-medium")}>
                    <td className="py-1.5 pr-2">
                      <Link href={`${linkBase}/${row.entry_id}`} className="hover:underline">
                        {row.name}
                      </Link>
                    </td>
                    {(r.history.get(row.entry_id) ?? []).map((cell, i) => (
                      <td key={r.rounds[i]?.id ?? i} className="px-1 py-1.5 text-center tabular-nums">
                        {cell ? (
                          <span className="inline-flex items-center gap-0.5">
                            G{cell.level}
                            <MoveIcon movement={cell.movement} className="size-3.5" />
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
