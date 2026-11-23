import Link from "next/link";

import { requireRole } from "@/lib/auth/dal";
import { createAdminClient } from "@/lib/supabase/admin";

const STATUS_LABEL = { active: "Activo", trial: "Prueba", suspended: "Suspendido" } as const;

/** Listado de clubes. La gestión completa (planes, suspender, métricas) es el paso 9. */
export default async function SuperadminHomePage() {
  await requireRole("superadmin");
  const admin = createAdminClient();
  const [{ data: clubs }, { data: profiles }] = await Promise.all([
    admin.from("clubs").select("id, name, slug, status, created_at").order("created_at", { ascending: false }),
    admin.from("profiles").select("club_id, role").not("club_id", "is", null),
  ]);

  const players = new Map<string, number>();
  for (const p of profiles ?? []) {
    if (p.role === "player" && p.club_id) players.set(p.club_id, (players.get(p.club_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Clubes ({clubs?.length ?? 0})</h1>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Club</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 text-right font-medium">Jugadores</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(clubs ?? []).map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-3">
                  <p className="font-medium">{c.name}</p>
                  <Link href={`/${c.slug}`} target="_blank" className="text-xs text-muted-foreground hover:underline">
                    /{c.slug}
                  </Link>
                </td>
                <td className="px-4 py-3">{STATUS_LABEL[c.status]}</td>
                <td className="px-4 py-3 text-right tabular-nums">{players.get(c.id) ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
