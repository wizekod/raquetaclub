import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Enums } from "@/lib/supabase/database.types";

/**
 * Lecturas del panel de plataforma. Todas con service_role: quien llama ya
 * pasó por `requireRole("superadmin")` (páginas) o `assertSuperadmin`
 * (acciones).
 */

export type PlanRow = {
  id: string;
  name: string;
  price: number;
  max_players: number | null;
  max_active_tournaments: number | null;
  features: Record<string, unknown>;
};

export async function listPlans(): Promise<PlanRow[]> {
  const { data } = await createAdminClient()
    .from("subscription_plans")
    .select("id, name, price, max_players, max_active_tournaments, features")
    .order("price")
    .order("name");
  return (data ?? []).map((p) => ({ ...p, features: (p.features ?? {}) as Record<string, unknown> }));
}

export type ClubSummary = {
  id: string;
  name: string;
  slug: string;
  status: Enums<"club_status">;
  created_at: string;
  trial_ends_at: string | null;
  plan: PlanRow | null;
  players: number;
  admins: number;
  tournaments: number;
};

/** Clubes con su plan y su uso (jugadores activos, torneos sin finalizar). */
export async function listClubs(): Promise<ClubSummary[]> {
  const admin = createAdminClient();
  const [{ data: clubs }, { data: profiles }, { data: tournaments }, plans] = await Promise.all([
    admin.from("clubs").select("id, name, slug, status, created_at, trial_ends_at, plan_id").order("created_at", { ascending: false }),
    admin.from("profiles").select("club_id, role").eq("status", "active").in("role", ["player", "club_admin"]),
    admin.from("tournaments").select("club_id").neq("status", "finished"),
    listPlans(),
  ]);
  const planOf = new Map(plans.map((p) => [p.id, p]));
  const players = new Map<string, number>();
  const admins = new Map<string, number>();
  const active = new Map<string, number>();
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const p of profiles ?? []) if (p.club_id) inc(p.role === "player" ? players : admins, p.club_id);
  for (const t of tournaments ?? []) inc(active, t.club_id);

  return (clubs ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    status: c.status,
    created_at: c.created_at,
    trial_ends_at: c.trial_ends_at,
    plan: c.plan_id ? (planOf.get(c.plan_id) ?? null) : null,
    players: players.get(c.id) ?? 0,
    admins: admins.get(c.id) ?? 0,
    tournaments: active.get(c.id) ?? 0,
  }));
}

export type PlatformMetrics = {
  clubs: Record<Enums<"club_status">, number>;
  players: number;
  tournaments: number;
  matches30d: number;
  /** Suma del precio de lista de los planes de los clubes activos (sin Stripe, es una estimación). */
  mrr: number;
};

export async function platformMetrics(clubs: ClubSummary[]): Promise<PlatformMetrics> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { count } = await createAdminClient()
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("status", "confirmed")
    .eq("result_type", "played")
    .gte("confirmed_at", since);
  const byStatus = { active: 0, trial: 0, suspended: 0 };
  for (const c of clubs) byStatus[c.status]++;
  const open = clubs.filter((c) => c.status !== "suspended");
  return {
    clubs: byStatus,
    players: open.reduce((n, c) => n + c.players, 0),
    tournaments: open.reduce((n, c) => n + c.tournaments, 0),
    matches30d: count ?? 0,
    mrr: clubs.filter((c) => c.status === "active").reduce((n, c) => n + Number(c.plan?.price ?? 0), 0),
  };
}

export type ClubDetail = ClubSummary & {
  timezone: string;
  phone: string | null;
  address: string | null;
  adminContacts: { id: string; name: string; email: string | null }[];
};

export async function getClubDetail(id: string): Promise<ClubDetail | null> {
  const summary = (await listClubs()).find((c) => c.id === id);
  if (!summary) return null;
  const admin = createAdminClient();
  const [{ data: club }, { data: admins }] = await Promise.all([
    admin.from("clubs").select("timezone, phone, address").eq("id", id).single(),
    admin.from("profiles").select("id, first_name, last_name, email").eq("club_id", id).eq("role", "club_admin").order("created_at"),
  ]);
  return {
    ...summary,
    timezone: club?.timezone ?? "",
    phone: club?.phone ?? null,
    address: club?.address ?? null,
    adminContacts: (admins ?? []).map((a) => ({
      id: a.id,
      name: [a.first_name, a.last_name].filter(Boolean).join(" ") || "—",
      email: a.email,
    })),
  };
}
