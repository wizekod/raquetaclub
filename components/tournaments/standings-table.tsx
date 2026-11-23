import { ArrowDown, ArrowUp, Minus, X } from "lucide-react";

import type { TableRow } from "@/lib/tournaments/queries";
import { cn } from "@/lib/utils";

const MOVE = {
  up: { icon: ArrowUp, label: "Sube", className: "text-emerald-600" },
  down: { icon: ArrowDown, label: "Baja", className: "text-destructive" },
  stay: { icon: Minus, label: "Se queda", className: "text-muted-foreground" },
  out: { icon: X, label: "Baja del torneo", className: "text-muted-foreground" },
} as const;

/** Tabla de un grupo. `highlight` = entry a resaltar (el jugador en sesión). */
export function StandingsTable({ rows, highlight }: { rows: TableRow[]; highlight?: string | null }) {
  const showMoves = rows.some((r) => r.movement);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-1.5 pr-2 text-left font-normal">#</th>
            <th className="py-1.5 pr-2 text-left font-normal">Jugador</th>
            <th className="px-1 py-1.5 text-right font-normal" title="Partidos jugados">PJ</th>
            <th className="px-1 py-1.5 text-right font-normal" title="Ganados (por default)">G</th>
            <th className="px-1 py-1.5 text-right font-normal" title="Perdidos (por default)">P</th>
            <th className="px-1 py-1.5 text-right font-normal">Sets</th>
            <th className="px-1 py-1.5 text-right font-normal">Bonus</th>
            <th className="py-1.5 pl-1 text-right font-medium text-foreground">Pts</th>
            {showMoves ? <th className="w-6" /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const mv = r.movement ? MOVE[r.movement] : null;
            return (
              <tr key={r.entry_id} className={cn("border-b border-border last:border-0", r.entry_id === highlight && "bg-primary/5 font-medium")}>
                <td className="py-1.5 pr-2 tabular-nums">{r.position}</td>
                <td className="py-1.5 pr-2">{r.name}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">{r.played + r.won_default}</td>
                <td className="px-1 py-1.5 text-right tabular-nums">
                  {r.won + r.won_default}
                  {r.won_default ? <span className="text-xs text-muted-foreground"> ({r.won_default})</span> : null}
                </td>
                <td className="px-1 py-1.5 text-right tabular-nums">
                  {r.lost + r.lost_default}
                  {r.lost_default ? <span className="text-xs text-muted-foreground"> ({r.lost_default})</span> : null}
                </td>
                <td className="px-1 py-1.5 text-right tabular-nums">
                  {r.sets_won}-{r.sets_lost}
                </td>
                <td className="px-1 py-1.5 text-right tabular-nums">{r.bonus ? r.bonus.toFixed(2) : "—"}</td>
                <td className="py-1.5 pl-1 text-right font-semibold tabular-nums">{Number.isInteger(r.points) ? r.points : r.points.toFixed(2)}</td>
                {showMoves ? (
                  <td className="pl-2">
                    {mv ? <mv.icon aria-label={mv.label} className={cn("size-4", mv.className)} /> : null}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
