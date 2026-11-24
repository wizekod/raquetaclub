import "server-only";

import { cache } from "react";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Plan del club y su uso. Los límites los hace cumplir la base (triggers con
 * error RC402); esto sirve para avisar antes (registro, altas) y para
 * mostrar el uso en el panel. null = ilimitado; club sin plan = ilimitado.
 */

export const PLAN_LIMIT_CODE = "RC402";

export type PlanUsage = {
  planName: string | null;
  maxPlayers: number | null;
  maxTournaments: number | null;
  players: number;
  tournaments: number;
};

export const getPlanUsage = cache(async (clubId: string): Promise<PlanUsage> => {
  const admin = createAdminClient();
  const [{ data: club }, { count: players }, { count: tournaments }] = await Promise.all([
    admin.from("clubs").select("subscription_plans(name, max_players, max_active_tournaments)").eq("id", clubId).maybeSingle(),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("club_id", clubId).eq("role", "player").eq("status", "active"),
    admin.from("tournaments").select("id", { count: "exact", head: true }).eq("club_id", clubId).neq("status", "finished"),
  ]);
  const plan = club?.subscription_plans ?? null;
  return {
    planName: plan?.name ?? null,
    maxPlayers: plan?.max_players ?? null,
    maxTournaments: plan?.max_active_tournaments ?? null,
    players: players ?? 0,
    tournaments: tournaments ?? 0,
  };
});

export const playersFull = (u: PlanUsage) => u.maxPlayers != null && u.players >= u.maxPlayers;
export const tournamentsFull = (u: PlanUsage) => u.maxTournaments != null && u.tournaments >= u.maxTournaments;

/** Mensaje para el admin cuando la base rechaza algo por el plan. */
export function planLimitError(error: { code?: string; message: string } | null | undefined): string | null {
  if (error?.code !== PLAN_LIMIT_CODE) return null;
  return `${error.message} Para crecer, pide un cambio de plan.`;
}

/** ¿El club está suspendido? (service_role: la RLS ya no deja verlo a sus miembros). */
export const isClubSuspended = cache(async (clubId: string): Promise<boolean> => {
  const { data } = await createAdminClient().from("clubs").select("status").eq("id", clubId).maybeSingle();
  return data?.status === "suspended";
});
