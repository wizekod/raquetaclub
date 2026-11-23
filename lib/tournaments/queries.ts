import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { EntryStatus, RoundRow, Tables, TournamentRow } from "@/lib/supabase/database.types";
import { fullName } from "@/lib/utils";
import { todayInTz } from "@/lib/availability/tz";

import { parseConfig } from "./config";
import { nextRoundDraft } from "./rounds";

/**
 * Lecturas de torneos con el cliente del usuario: la RLS decide qué ve cada
 * quien (el jugador no ve torneos ni rondas en borrador).
 */

export type TournamentListItem = TournamentRow & { accepted: number; pending: number };

export async function listTournaments(clubId: string): Promise<TournamentListItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tournaments")
    .select("*, tournament_entries(status)")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });
  return (data ?? []).map(({ tournament_entries, ...t }) => ({
    ...t,
    accepted: tournament_entries.filter((e) => e.status === "accepted").length,
    pending: tournament_entries.filter((e) => e.status === "pending").length,
  }));
}

export async function getTournament(clubId: string, id: string): Promise<TournamentRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("tournaments").select("*").eq("club_id", clubId).eq("id", id).maybeSingle();
  return data;
}

/** Nombres de jugadores por id de perfil (sólo columnas con GRANT). */
export async function playerNames(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, first_name, last_name").in("id", [...new Set(ids)]);
  return new Map((data ?? []).map((p) => [p.id, fullName(p)]));
}

export type EntryWithName = {
  id: string;
  player_id: string;
  status: EntryStatus;
  seed: number | null;
  created_at: string;
  name: string;
};

/** Inscripciones de un torneo, por siembra y luego por nombre. */
export async function listEntries(tournamentId: string): Promise<EntryWithName[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tournament_entries")
    .select("id, player_id, status, seed, created_at")
    .eq("tournament_id", tournamentId);
  const names = await playerNames((data ?? []).map((e) => e.player_id));
  return (data ?? [])
    .map((e) => ({ ...e, name: names.get(e.player_id) ?? "Jugador" }))
    .sort((a, b) => (a.seed ?? Infinity) - (b.seed ?? Infinity) || a.name.localeCompare(b.name, "es"));
}

export async function listRounds(tournamentId: string): Promise<RoundRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("rounds").select("*").eq("tournament_id", tournamentId).order("number");
  return data ?? [];
}

export type GroupView = {
  id: string;
  level: number;
  name: string;
  members: { entry_id: string; position: number | null; name: string; player_id: string }[];
};

export type RoundDetail = {
  round: RoundRow;
  groups: GroupView[];
  matches: (Tables<"matches"> & { name_a: string; name_b: string })[];
};

/** Ronda con sus grupos, integrantes y partidos. */
export async function getRoundDetail(roundId: string): Promise<RoundDetail | null> {
  const supabase = await createClient();
  const { data: round } = await supabase.from("rounds").select("*").eq("id", roundId).maybeSingle();
  if (!round) return null;

  const [{ data: groups }, { data: members }, { data: matches }, { data: entries }] = await Promise.all([
    supabase.from("groups").select("id, level, name").eq("round_id", roundId).order("level"),
    supabase.from("group_members").select("group_id, entry_id, position").eq("round_id", roundId).order("position"),
    supabase.from("matches").select("*").eq("round_id", roundId).order("created_at"),
    supabase.from("tournament_entries").select("id, player_id").eq("tournament_id", round.tournament_id),
  ]);
  const playerOf = new Map((entries ?? []).map((e) => [e.id, e.player_id]));
  const names = await playerNames([...playerOf.values()]);
  const nameOf = (entryId: string) => names.get(playerOf.get(entryId) ?? "") ?? "Jugador";

  return {
    round,
    groups: (groups ?? []).map((g) => ({
      ...g,
      members: (members ?? [])
        .filter((m) => m.group_id === g.id)
        .map((m) => ({ entry_id: m.entry_id, position: m.position, name: nameOf(m.entry_id), player_id: playerOf.get(m.entry_id) ?? "" })),
    })),
    matches: (matches ?? []).map((m) => ({ ...m, name_a: nameOf(m.entry_a), name_b: nameOf(m.entry_b) })),
  };
}

/** Torneos visibles para un jugador (no borrador) con su inscripción, si tiene. */
export async function listTournamentsForPlayer(clubId: string, playerId: string) {
  const supabase = await createClient();
  const [{ data: tournaments }, { data: mine }] = await Promise.all([
    supabase
      .from("tournaments")
      .select("*")
      .eq("club_id", clubId)
      .neq("status", "draft")
      .order("created_at", { ascending: false }),
    supabase.from("tournament_entries").select("id, tournament_id, status").eq("player_id", playerId),
  ]);
  const byTournament = new Map((mine ?? []).map((e) => [e.tournament_id, e]));
  return (tournaments ?? []).map((t) => ({ ...t, entry: byTournament.get(t.id) ?? null }));
}

/** Ronda vigente (activa) de un torneo, si hay. */
export async function getActiveRound(tournamentId: string): Promise<RoundRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("rounds")
    .select("*")
    .eq("tournament_id", tournamentId)
    .eq("status", "active")
    .maybeSingle();
  return data;
}

/** Valores sugeridos para el formulario de "nueva ronda". */
export async function suggestedRound(tournament: { id: string; starts_on: string | null; ends_on: string | null; config: unknown }, timeZone: string) {
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("rounds")
    .select("number, ends_on")
    .eq("tournament_id", tournament.id)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return nextRoundDraft({
    previous: last ?? null,
    tournamentStartsOn: tournament.starts_on,
    tournamentEndsOn: tournament.ends_on,
    today: todayInTz(timeZone),
    config: parseConfig(tournament.config),
    timeZone,
  });
}
