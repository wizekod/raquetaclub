import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { todayInTz } from "@/lib/availability/tz";
import type { Database, Json } from "@/lib/supabase/database.types";

import { planClose } from "./close";
import { parseConfig } from "./config";

export type CloseResult = { ok: true; nextId: string | null; finish: boolean } | { ok: false; error: string };

/**
 * Cierra una ronda: el motor calcula tablas, movimientos, bajas y la
 * siguiente ronda (`planClose`) y `close_round` lo guarda todo junto.
 * Recibe el cliente: el del admin (su RLS) desde el panel, o el de
 * service_role desde el cron de la fecha límite.
 */
export async function closeRoundWith(supabase: SupabaseClient<Database>, roundId: string, timeZone: string): Promise<CloseResult> {
  const { data: round } = await supabase.from("rounds").select("*").eq("id", roundId).maybeSingle();
  if (!round) return { ok: false, error: "Ronda no encontrada." };
  if (round.status !== "active") return { ok: false, error: "La ronda no está activa." };

  const [{ data: t }, { data: groups }, { data: members }, { data: matches }, { data: entries }, { data: prevRounds }] = await Promise.all([
    supabase.from("tournaments").select("type, config, ends_on").eq("id", round.tournament_id).single(),
    supabase.from("groups").select("id, level").eq("round_id", roundId),
    supabase.from("group_members").select("group_id, entry_id, position").eq("round_id", roundId).order("position"),
    supabase
      .from("matches")
      .select("id, group_id, entry_a, entry_b, status, result_type, winner_entry_id, score, scheduled_at, reported_at")
      .eq("round_id", roundId),
    supabase.from("tournament_entries").select("id, status").eq("tournament_id", round.tournament_id),
    supabase.from("rounds").select("id, number").eq("tournament_id", round.tournament_id).lt("number", round.number).order("number"),
  ]);
  if (!t) return { ok: false, error: "Torneo no encontrado." };

  const order = new Map((prevRounds ?? []).map((r) => [r.id, r.number]));
  const { data: prevSnaps } = order.size
    ? await supabase.from("standings_snapshots").select("round_id, entry_id, played, won_default").in("round_id", [...order.keys()])
    : { data: [] };
  const previousActivity = new Map<string, number[]>();
  for (const s of [...(prevSnaps ?? [])].sort((a, b) => order.get(a.round_id)! - order.get(b.round_id)!)) {
    previousActivity.set(s.entry_id, [...(previousActivity.get(s.entry_id) ?? []), s.played + s.won_default]);
  }

  const plan = planClose({
    type: t.type,
    config: parseConfig(t.config),
    timeZone,
    round,
    tournamentEndsOn: t.ends_on,
    today: todayInTz(timeZone),
    groups: (groups ?? []).map((g) => ({
      id: g.id,
      level: g.level,
      entries: (members ?? []).filter((m) => m.group_id === g.id).map((m) => m.entry_id),
    })),
    matches: matches ?? [],
    entryStatus: new Map((entries ?? []).map((e) => [e.id, e.status])),
    previousActivity,
  });
  if (!plan.ok) return plan;

  const { data: nextId, error } = await supabase.rpc("close_round", {
    p_round: roundId,
    p_snapshots: plan.snapshots as unknown as Json,
    p_expel: plan.expel,
    p_next: plan.next as unknown as Json,
    p_finish: plan.finish,
  });
  if (error) {
    if (["55000", "42501"].includes(error.code)) return { ok: false, error: error.message };
    console.error("[tournaments] close_round:", error.code, error.message);
    return { ok: false, error: "No se pudo cerrar la ronda." };
  }
  return { ok: true, nextId, finish: plan.finish };
}
