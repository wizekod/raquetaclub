import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { MatchRow, RoundRow, Tables } from "@/lib/supabase/database.types";
import type { SessionProfile } from "@/lib/auth/dal";
import { parseConfig, type TournamentConfig } from "@/lib/tournaments/config";
import { fullName } from "@/lib/utils";

export type MatchSide = { entryId: string; playerId: string; name: string };

export type MatchView = {
  match: MatchRow;
  round: RoundRow;
  tournament: { id: string; name: string; sport: "tennis" | "padel"; config: TournamentConfig };
  groupName: string | null;
  timeZone: string;
  a: MatchSide;
  b: MatchSide;
  /** Lado del usuario en sesión, si juega el partido. */
  me: "a" | "b" | null;
  isAdmin: boolean;
  rival: (MatchSide & { phoneKey: string | null }) | null;
  proposals: (Tables<"match_slot_proposals"> & { courtName: string; mine: boolean })[];
  /** `upcoming`: aún no empieza (un jugador sólo puede cancelar antes). */
  booking: { id: string; courtName: string; start_at: string; end_at: string; upcoming: boolean } | null;
  /** Ya pasó la fecha límite de resultados de la ronda. */
  deadlinePassed: boolean;
};

/**
 * Partido por su token de link (`/p/{token}`). La RLS deja leerlo a cualquier
 * miembro del club; quién puede ACTUAR lo deciden `me`/`isAdmin` en la página
 * y, sobre todo, las RPCs.
 */
export async function getMatchByToken(token: string, profile: SessionProfile): Promise<MatchView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const supabase = await createClient();
  const { data: match } = await supabase.from("matches").select("*").eq("booking_token", token).maybeSingle();
  if (!match) return null;

  const [{ data: round }, { data: tournament }, { data: club }, { data: entries }, { data: group }, { data: proposals }, { data: booking }, { data: courts }] =
    await Promise.all([
      supabase.from("rounds").select("*").eq("id", match.round_id).single(),
      supabase.from("tournaments").select("id, name, sport, config").eq("id", match.tournament_id).single(),
      supabase.from("clubs").select("timezone").eq("id", match.club_id).single(),
      supabase.from("tournament_entries").select("id, player_id").in("id", [match.entry_a, match.entry_b]),
      match.group_id ? supabase.from("groups").select("name").eq("id", match.group_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase
        .from("match_slot_proposals")
        .select("*")
        .eq("match_id", match.id)
        .eq("status", "proposed")
        .gt("start_at", new Date().toISOString())
        .order("start_at"),
      supabase
        .from("court_bookings")
        .select("id, court_id, start_at, end_at")
        .eq("match_id", match.id)
        .eq("status", "confirmed")
        .maybeSingle(),
      supabase.from("courts").select("id, name").eq("club_id", match.club_id),
    ]);
  if (!round || !tournament || !club) return null;

  const playerOf = new Map((entries ?? []).map((e) => [e.id, e.player_id]));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", [...playerOf.values()]);
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, fullName(p)]));
  const side = (entryId: string): MatchSide => {
    const playerId = playerOf.get(entryId) ?? "";
    return { entryId, playerId, name: nameOf.get(playerId) ?? "Jugador" };
  };
  const a = side(match.entry_a);
  const b = side(match.entry_b);
  const me = a.playerId === profile.id ? "a" : b.playerId === profile.id ? "b" : null;
  const isAdmin =
    profile.role === "superadmin" || (profile.role === "club_admin" && profile.club_id === match.club_id && profile.status === "active");

  let rival: MatchView["rival"] = null;
  if (me) {
    const other = me === "a" ? b : a;
    const { data: contact } = await supabase.from("profile_contacts").select("phone_key").eq("id", other.playerId).maybeSingle();
    rival = { ...other, phoneKey: contact?.phone_key ?? null };
  }

  const courtName = new Map((courts ?? []).map((c) => [c.id, c.name]));
  return {
    match,
    round,
    tournament: { ...tournament, config: parseConfig(tournament.config) },
    groupName: group?.name ?? null,
    timeZone: club.timezone,
    a,
    b,
    me,
    isAdmin,
    rival,
    proposals: (proposals ?? []).map((p) => ({ ...p, courtName: courtName.get(p.court_id) ?? "Cancha", mine: p.proposed_by === profile.id })),
    deadlinePassed: Date.parse(round.results_deadline) < Date.now(),
    booking: booking
      ? { ...booking, courtName: courtName.get(booking.court_id) ?? "Cancha", upcoming: Date.parse(booking.start_at) > Date.now() }
      : null,
  };
}

export type MyMatch = {
  id: string;
  token: string;
  status: MatchRow["status"];
  scheduled_at: string | null;
  rivalName: string;
  tournamentName: string;
  roundName: string;
  /** Hay propuestas del rival esperando mi respuesta. */
  awaitingMe: number;
};

/** Partidos del jugador en rondas activas, para su inicio. */
export async function listMyActiveMatches(playerId: string): Promise<MyMatch[]> {
  const supabase = await createClient();
  const { data: entries } = await supabase.from("tournament_entries").select("id").eq("player_id", playerId);
  const mine = (entries ?? []).map((e) => e.id);
  if (!mine.length) return [];

  const list = `(${mine.join(",")})`;
  const { data: matches } = await supabase
    .from("matches")
    .select("id, booking_token, status, scheduled_at, entry_a, entry_b, round_id, tournament_id")
    .or(`entry_a.in.${list},entry_b.in.${list}`);
  if (!matches?.length) return [];

  const roundIds = [...new Set(matches.map((m) => m.round_id))];
  const [{ data: rounds }, { data: tournaments }, { data: rivals }, { data: pending }] = await Promise.all([
    supabase.from("rounds").select("id, name, status").in("id", roundIds),
    supabase.from("tournaments").select("id, name").in("id", [...new Set(matches.map((m) => m.tournament_id))]),
    supabase.from("tournament_entries").select("id, player_id").in("id", matches.flatMap((m) => [m.entry_a, m.entry_b])),
    // Propuestas vigentes del rival: esperan mi respuesta.
    supabase
      .from("match_slot_proposals")
      .select("match_id")
      .in("match_id", matches.map((m) => m.id))
      .eq("status", "proposed")
      .gt("start_at", new Date().toISOString())
      .neq("proposed_by", playerId),
  ]);

  const active = new Map((rounds ?? []).filter((r) => r.status === "active").map((r) => [r.id, r.name]));
  const tName = new Map((tournaments ?? []).map((t) => [t.id, t.name]));
  const playerOf = new Map((rivals ?? []).map((e) => [e.id, e.player_id]));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", [...new Set(playerOf.values())]);
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, fullName(p)]));
  const mineSet = new Set(mine);

  return matches
    .filter((m) => active.has(m.round_id))
    .map((m) => {
      const rivalEntry = mineSet.has(m.entry_a) ? m.entry_b : m.entry_a;
      return {
        id: m.id,
        token: m.booking_token,
        status: m.status,
        scheduled_at: m.scheduled_at,
        rivalName: nameOf.get(playerOf.get(rivalEntry) ?? "") ?? "Rival",
        tournamentName: tName.get(m.tournament_id) ?? "",
        roundName: active.get(m.round_id) ?? "",
        awaitingMe: (pending ?? []).filter((p) => p.match_id === m.id).length,
      };
    })
    .sort((x, y) => (x.scheduled_at ?? "9999").localeCompare(y.scheduled_at ?? "9999"));
}
