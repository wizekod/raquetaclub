import "server-only";

import { createClient } from "@/lib/supabase/server";
import { addDays, wallTimeToInstant } from "@/lib/availability/tz";
import type { Tables } from "@/lib/supabase/database.types";
import { fullName } from "@/lib/utils";

export type CourtWithHours = Tables<"courts"> & { hours: Tables<"court_hours">[] };

/** Canchas del club con su horario semanal (RLS: miembros del club). */
export async function listCourts(clubId: string, { onlyActive = false } = {}): Promise<CourtWithHours[]> {
  const supabase = await createClient();
  let q = supabase.from("courts").select("*").eq("club_id", clubId).order("sort_order").order("name");
  if (onlyActive) q = q.eq("active", true);
  const { data: courts } = await q;
  if (!courts?.length) return [];

  const { data: hours } = await supabase
    .from("court_hours")
    .select("*")
    .in("court_id", courts.map((c) => c.id))
    .order("day_of_week")
    .order("open_time");
  return courts.map((c) => ({ ...c, hours: (hours ?? []).filter((h) => h.court_id === c.id) }));
}

export async function getCourt(clubId: string, courtId: string): Promise<CourtWithHours | null> {
  return (await listCourts(clubId)).find((c) => c.id === courtId) ?? null;
}

export type BlockRow = Tables<"court_blocks"> & { courtName: string | null };

/** Bloqueos que aún no terminan, del más próximo al más lejano. */
export async function listUpcomingBlocks(clubId: string): Promise<BlockRow[]> {
  const supabase = await createClient();
  const [{ data: blocks }, { data: courts }] = await Promise.all([
    supabase
      .from("court_blocks")
      .select("*")
      .eq("club_id", clubId)
      .gte("end_at", new Date().toISOString())
      .order("start_at"),
    supabase.from("courts").select("id, name").eq("club_id", clubId),
  ]);
  const names = new Map((courts ?? []).map((c) => [c.id, c.name]));
  return (blocks ?? []).map((b) => ({ ...b, courtName: b.court_id ? (names.get(b.court_id) ?? "—") : null }));
}

/** Límites [inicio, fin) de una fecha local del club, en ISO. */
export function dayBounds(date: string, timeZone: string) {
  return {
    start: wallTimeToInstant(date, "00:00", timeZone).toISOString(),
    end: wallTimeToInstant(addDays(date, 1), "00:00", timeZone).toISOString(),
  };
}

export type DayBooking = {
  id: string;
  courtId: string;
  start: string;
  end: string;
  matchId: string;
  players: string[];
};

/**
 * Ocupación de un día: canchas activas con horario, bloqueos y reservas (con
 * los nombres de los jugadores del partido). Consultas separadas en vez de un
 * embed de PostgREST: las FK hacia entries son compuestas y hay dos (A y B).
 */
export async function getDayOccupancy(clubId: string, date: string, timeZone: string) {
  const supabase = await createClient();
  const { start, end } = dayBounds(date, timeZone);

  const [courts, { data: blocks }, { data: bookings }] = await Promise.all([
    listCourts(clubId, { onlyActive: true }),
    supabase
      .from("court_blocks")
      .select("*")
      .eq("club_id", clubId)
      .lt("start_at", end)
      .gt("end_at", start),
    supabase
      .from("court_bookings")
      .select("id, court_id, match_id, start_at, end_at")
      .eq("club_id", clubId)
      .eq("status", "confirmed")
      .lt("start_at", end)
      .gt("end_at", start),
  ]);

  const matchIds = [...new Set((bookings ?? []).map((b) => b.match_id))];
  const playersByMatch = new Map<string, string[]>();
  if (matchIds.length) {
    const { data: matches } = await supabase.from("matches").select("id, entry_a, entry_b").in("id", matchIds);
    const entryIds = (matches ?? []).flatMap((m) => [m.entry_a, m.entry_b]);
    const { data: entries } = await supabase.from("tournament_entries").select("id, player_id").in("id", entryIds);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", (entries ?? []).map((e) => e.player_id));
    const nameOf = new Map((profiles ?? []).map((p) => [p.id, fullName(p)]));
    const playerOf = new Map((entries ?? []).map((e) => [e.id, nameOf.get(e.player_id) ?? "—"]));
    for (const m of matches ?? []) {
      playersByMatch.set(m.id, [playerOf.get(m.entry_a) ?? "—", playerOf.get(m.entry_b) ?? "—"]);
    }
  }

  const dayBookings: DayBooking[] = (bookings ?? []).map((b) => ({
    id: b.id,
    courtId: b.court_id,
    start: b.start_at,
    end: b.end_at,
    matchId: b.match_id,
    players: playersByMatch.get(b.match_id) ?? [],
  }));

  return { courts, blocks: blocks ?? [], bookings: dayBookings, bounds: { start, end } };
}
