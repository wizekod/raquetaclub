import Link from "next/link";

import { requireRole } from "@/lib/auth/dal";
import { listClubs, platformMetrics } from "@/lib/superadmin/queries";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { CLUB_STATUS_LABEL, money, shortDate, usage } from "./labels";

type Props = { searchParams: Promise<{ borrado?: string }> };

export default async function SuperadminHomePage({ searchParams }: Props) {
  await requireRole("superadmin");
  const { borrado } = await searchParams;
  const clubs = await listClubs();
  const m = await platformMetrics(clubs);

  const stats = [
    { label: "Clubes", value: `${clubs.length}`, hint: `${m.clubs.active} activos · ${m.clubs.trial} en prueba · ${m.clubs.suspended} suspendidos` },
    { label: "Jugadores activos", value: `${m.players}`, hint: "En clubes no suspendidos" },
    { label: "Torneos sin finalizar", value: `${m.tournaments}`, hint: "Incluye borradores e inscripciones" },
    { label: "Partidos jugados (30 días)", value: `${m.matches30d}`, hint: "Con resultado confirmado" },
    { label: "Ingreso mensual estimado", value: money(m.mrr), hint: "Precio de lista de los clubes activos; sin cobro (Stripe en pausa)" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Plataforma</h1>
      {borrado ? <p className="rounded-md bg-muted px-3 py-2 text-sm">Club borrado.</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{s.value}</CardTitle>
              <p className="text-xs text-muted-foreground">{s.hint}</p>
            </CardHeader>
          </Card>
        ))}
      </div>

      <h2 className="text-lg font-semibold">Clubes ({clubs.length})</h2>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Club</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Plan</th>
              <th className="px-4 py-2 text-right font-medium">Jugadores</th>
              <th className="px-4 py-2 text-right font-medium">Torneos</th>
              <th className="px-4 py-2 font-medium">Alta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {clubs.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3">
                  <Link href={`/superadmin/clubes/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">/{c.slug}</p>
                </td>
                <td className="px-4 py-3">
                  {CLUB_STATUS_LABEL[c.status]}
                  {c.status === "trial" && c.trial_ends_at ? (
                    <p className="text-xs text-muted-foreground">hasta {shortDate(c.trial_ends_at)}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3">{c.plan?.name ?? "Sin plan"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{usage(c.players, c.plan?.max_players)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{usage(c.tournaments, c.plan?.max_active_tournaments)}</td>
                <td className="px-4 py-3 text-muted-foreground">{shortDate(c.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
