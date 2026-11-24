import { requireRole } from "@/lib/auth/dal";
import { listClubs, listPlans } from "@/lib/superadmin/queries";

import { PlanForm } from "./plan-form";

export default async function SuperadminPlansPage() {
  await requireRole("superadmin");
  const [plans, clubs] = await Promise.all([listPlans(), listClubs()]);
  const clubsOn = (id: string) => clubs.filter((c) => c.plan?.id === id).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Planes</h1>
        <p className="text-sm text-muted-foreground">
          Límites por club: jugadores activos y torneos sin finalizar (vacío = ilimitado). El precio es de referencia
          mientras Stripe está en pausa.
        </p>
      </div>
      {plans.map((p) => (
        <PlanForm
          key={p.id}
          plan={{
            id: p.id,
            name: p.name,
            price: String(p.price),
            max_players: p.max_players?.toString() ?? "",
            max_active_tournaments: p.max_active_tournaments?.toString() ?? "",
            whatsapp: p.features.whatsapp === true,
          }}
          clubs={clubsOn(p.id)}
        />
      ))}
      <PlanForm plan={null} clubs={0} />
    </div>
  );
}
