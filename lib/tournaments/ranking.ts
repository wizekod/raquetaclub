import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { MatchRow, RoundRow, TournamentRow } from "@/lib/supabase/database.types";
import { fullName } from "@/lib/utils";

import { computeAwards, type Awards } from "./awards";
import { parseConfig } from "./config";
import { buildHistory, entryRecord, ladderOrder, type EntryRecord, type HistoryCell } from "./history";
import { getRoundDetail, getRoundTables, type TableRow } from "./queries";

/**
 * Rankings de un torneo con el cliente del usuario: el jugador no ve rondas
 * en borrador (RLS), y aquí tampoco se muestran al admin: el ranking es lo
 * publicado.
 */

async function namesByEntry(tournamentId: string): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data: entries } = await supabase.from("tournament_entries").select("id, player_id").eq("tournament_id", tournamentId);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", (entries ?? []).map((e) => e.player_id));
  const byPlayer = new Map((profiles ?? []).map((p) => [p.id, fullName(p)]));
  return new Map((entries ?? []).map((e) => [e.id, byPlayer.get(e.player_id) ?? "Jugador"]));
}

type Snap = { round_id: string; entry_id: string; level: number; position: number; points: number; movement: "up" | "down" | "stay" | "out" | null; played: number; won_default: number };

async function snapshotsWithLevel(roundIds: string[]): Promise<Snap[]> {
  if (!roundIds.length) return [];
  const supabase = await createClient();
  const [{ data: snaps }, { data: groups }] = await Promise.all([
    supabase.from("standings_snapshots").select("round_id, group_id, entry_id, position, points, movement, played, won_default").in("round_id", roundIds),
    supabase.from("groups").select("id, level").in("round_id", roundIds),
  ]);
  const levelOf = new Map((groups ?? []).map((g) => [g.id, g.level]));
  return (snaps ?? []).map((s) => ({ ...s, points: Number(s.points), level: levelOf.get(s.group_id) ?? 0 }));
}

export type Ranking = {
  tournament: TournamentRow;
  rounds: RoundRow[];
  current: RoundRow;
  ladder: (TableRow & { rank: number; level: number })[];
  groups: { id: string; level: number; name: string; rows: TableRow[] }[];
  history: Map<string, HistoryCell[]>;
  names: Map<string, string>;
  awards: Awards | null;
};

export async function getRanking(tournament: TournamentRow, timeZone: string): Promise<Ranking | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("rounds").select("*").eq("tournament_id", tournament.id).neq("status", "draft").order("number");
  const rounds = data ?? [];
  const current = rounds.at(-1);
  if (!current) return null;

  const detail = await getRoundDetail(current.id);
  if (!detail) return null;
  const config = parseConfig(tournament.config);
  const [tables, names, snaps] = await Promise.all([
    getRoundTables(detail, config, timeZone),
    namesByEntry(tournament.id),
    snapshotsWithLevel(rounds.filter((r) => r.status === "closed").map((r) => r.id)),
  ]);

  const groups = detail.groups.map((g) => ({ id: g.id, level: g.level, name: g.name, rows: tables.get(g.id) ?? [] }));
  const levelOf = new Map(detail.groups.flatMap((g) => g.members.map((m) => [m.entry_id, g.level] as const)));
  return {
    tournament,
    rounds,
    current,
    ladder: ladderOrder(groups),
    groups,
    history: buildHistory(rounds, snaps, { roundId: current.id, levelOf }),
    names,
    awards: snaps.length ? computeAwards(snaps) : null,
  };
}

export type EntryProfile = {
  entryId: string;
  name: string;
  status: string;
  record: EntryRecord;
  rounds: RoundRow[];
  history: HistoryCell[];
  matches: (MatchRow & { roundName: string; rivalName: string; rivalEntry: string })[];
  names: Map<string, string>;
};

export async function getEntryProfile(tournament: TournamentRow, entryId: string): Promise<EntryProfile | null> {
  const supabase = await createClient();
  const { data: entry } = await supabase
    .from("tournament_entries")
    .select("id, status")
    .eq("id", entryId)
    .eq("tournament_id", tournament.id)
    .maybeSingle();
  if (!entry) return null;

  const [{ data: rounds }, { data: matches }, names] = await Promise.all([
    supabase.from("rounds").select("*").eq("tournament_id", tournament.id).neq("status", "draft").order("number"),
    supabase.from("matches").select("*").eq("tournament_id", tournament.id).or(`entry_a.eq.${entryId},entry_b.eq.${entryId}`),
    namesByEntry(tournament.id),
  ]);
  const visible = rounds ?? [];
  const roundName = new Map(visible.map((r) => [r.id, `${r.number}. ${r.name}`]));
  const roundNumber = new Map(visible.map((r) => [r.id, r.number]));
  const mine = (matches ?? []).filter((m) => roundName.has(m.round_id));

  const snaps = await snapshotsWithLevel(visible.filter((r) => r.status === "closed").map((r) => r.id));
  const current = visible.at(-1);
  let levelOf = new Map<string, number>();
  if (current && current.status !== "closed") {
    const { data: gm } = await supabase.from("group_members").select("entry_id, group_id").eq("round_id", current.id).eq("entry_id", entryId);
    const { data: groups } = await supabase.from("groups").select("id, level").eq("round_id", current.id);
    const lv = new Map((groups ?? []).map((g) => [g.id, g.level]));
    levelOf = new Map((gm ?? []).map((m) => [m.entry_id, lv.get(m.group_id) ?? 0]));
  }
  const history = buildHistory(visible, snaps, current ? { roundId: current.id, levelOf } : null).get(entryId) ?? visible.map(() => null);

  return {
    entryId,
    name: names.get(entryId) ?? "Jugador",
    status: entry.status,
    record: entryRecord(mine, entryId),
    rounds: visible,
    history,
    matches: mine
      .map((m) => {
        const rivalEntry = m.entry_a === entryId ? m.entry_b : m.entry_a;
        return { ...m, roundName: roundName.get(m.round_id) ?? "", rivalEntry, rivalName: names.get(rivalEntry) ?? "Jugador" };
      })
      .sort((a, b) => (roundNumber.get(b.round_id) ?? 0) - (roundNumber.get(a.round_id) ?? 0)),
    names,
  };
}
