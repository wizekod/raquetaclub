import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/dal";
import { getClubDetail, listPlans } from "@/lib/superadmin/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { CLUB_STATUS_LABEL, shortDate, usage } from "../../labels";
import { ClubPlanForm } from "./club-plan-form";
import { DeleteClubForm } from "./delete-club-form";

type Props = { params: Promise<{ id: string }> };

export default async function SuperadminClubPage({ params }: Props) {
  await requireRole("superadmin");
  const { id } = await params;
  const [club, plans] = await Promise.all([getClubDetail(id), listPlans()]);
  if (!club) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/superadmin" className="text-sm text-muted-foreground hover:underline">
          ← Clubes
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">{club.name}</h1>
        <p className="text-sm text-muted-foreground">
          <Link href={`/${club.slug}`} target="_blank" className="hover:underline">
            /{club.slug}
          </Link>{" "}
          · {CLUB_STATUS_LABEL[club.status]} · alta {shortDate(club.created_at)}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Uso</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            <p>Plan: {club.plan?.name ?? "Sin plan (sin límites)"}</p>
            <p>Jugadores activos: {usage(club.players, club.plan?.max_players)}</p>
            <p>Torneos sin finalizar: {usage(club.tournaments, club.plan?.max_active_tournaments)}</p>
            <p>Administradores activos: {club.admins}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Contacto</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {club.adminContacts.map((a) => (
              <p key={a.id}>
                {a.name} {a.email ? <span className="text-muted-foreground">· {a.email}</span> : null}
              </p>
            ))}
            {club.phone ? <p>Tel. {club.phone}</p> : null}
            {club.address ? <p className="text-muted-foreground">{club.address}</p> : null}
            <p className="text-muted-foreground">Zona horaria: {club.timezone}</p>
          </CardContent>
        </Card>
      </div>

      <ClubPlanForm
        club={{ id: club.id, status: club.status, planId: club.plan?.id ?? "", trialEndsOn: club.trial_ends_at?.slice(0, 10) ?? "" }}
        plans={plans.map((p) => ({ id: p.id, label: `${p.name} · ${p.max_players ?? "∞"} jugadores · ${p.max_active_tournaments ?? "∞"} torneos` }))}
      />

      <DeleteClubForm id={club.id} slug={club.slug} suspended={club.status === "suspended"} />
    </div>
  );
}
