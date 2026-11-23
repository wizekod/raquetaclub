import { describe, expect, it } from "vitest";

import { computeAwards } from "./awards";
import { defaultConfig } from "./config";
import { buildNextRound, groupSizes, ladderMovements, shouldExpel, suggestGroups } from "./ladder";
import { nextRoundDraft } from "./rounds";
import { computeStandings } from "./standings";
import type { ScoredMatch } from "./scoring";

const cfg = defaultConfig("ladder");

/** Partido confirmado: gana `w` contra `l` 6-x 6-y. */
const win = (w: string, l: string, extra: Partial<ScoredMatch> = {}): ScoredMatch => ({
  entry_a: w, entry_b: l, status: "confirmed", result_type: "played", winner_entry_id: w,
  score: { sets: [[6, 2], [6, 2]] }, played_on: "2027-02-20", ...extra,
});

describe("standings", () => {
  it("round robin de 5: 10 partidos, 4 por jugador", () => {
    const ids = ["A", "B", "C", "D", "E"];
    const ms: ScoredMatch[] = [];
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) ms.push(win(ids[i]!, ids[j]!));
    expect(ms).toHaveLength(10);
    const t = computeStandings(ids, ms, "2027-02-01", cfg);
    expect(t.map((r) => r.entry_id)).toEqual(ids);
    expect(t.every((r) => r.played === 4)).toBe(true);
    expect(t[0]).toMatchObject({ won: 4, points: 12, sets_won: 8, sets_lost: 0, games_won: 48, games_lost: 16 });
    expect(t[4]).toMatchObject({ lost: 4, points: 4 });
  });

  it("suma bonus, defaults y no jugados", () => {
    const t = computeStandings(["A", "B", "C"], [
      win("A", "B", { played_on: "2027-02-02" }), // A 3.25, B 1.25
      { ...win("C", "A"), result_type: "default", score: null }, // C 2, A 0
      { ...win("B", "C"), status: "not_played", result_type: null, winner_entry_id: null },
    ], "2027-02-01", cfg);
    const by = Object.fromEntries(t.map((r) => [r.entry_id, r]));
    expect(by.A).toMatchObject({ points: 3.25, bonus: 0.25, won: 1, lost_default: 1, played: 1 });
    expect(by.B).toMatchObject({ points: 1.25, not_played: 1 });
    expect(by.C).toMatchObject({ points: 2, won_default: 1, not_played: 1, played: 0 });
    expect(t.map((r) => r.entry_id)).toEqual(["A", "C", "B"]);
  });

  it("triple empate circular: cae hasta la siembra", () => {
    const t = computeStandings(["A", "B", "C"], [win("B", "A"), win("A", "C"), win("C", "B")], "2027-02-01", cfg);
    expect(t.map((r) => r.points)).toEqual([4, 4, 4]);
    expect(t.map((r) => r.entry_id)).toEqual(["A", "B", "C"]);
  });

  // A y B empatan a 7 con los mismos sets (4-2); A tiene mejor diferencia de
  // games (+22 vs +2), pero B le ganó el partido entre ellos.
  const tied: ScoredMatch[] = [
    win("B", "A", { score: { sets: [[7, 6], [7, 6]] } }),
    win("A", "C", { score: { sets: [[6, 0], [6, 0]] } }),
    win("A", "D", { score: { sets: [[6, 0], [6, 0]] } }),
    win("B", "C", { score: { sets: [[6, 4], [6, 4]] } }),
    win("D", "B", { score: { sets: [[6, 4], [6, 4]] } }),
    win("C", "D"),
    win("C", "A", { status: "reported" }), // sin confirmar: no cuenta
  ];

  it("dos empatados: manda el resultado entre ellos", () => {
    const t = computeStandings(["A", "B", "C", "D"], tied, "2027-02-01", cfg);
    expect(t.slice(0, 2).map((r) => [r.entry_id, r.points])).toEqual([["B", 7], ["A", 7]]);
    expect(t[1]).toMatchObject({ sets_won: 4, sets_lost: 2, games_won: 36, games_lost: 14 });
  });

  it("el orden de desempates es configurable", () => {
    const t = computeStandings(["A", "B", "C", "D"], tied, "2027-02-01", { ...cfg, tiebreakers: ["points", "games_diff", "head_to_head"] });
    expect(t.slice(0, 2).map((r) => r.entry_id)).toEqual(["A", "B"]);
  });
});

describe("escalera", () => {
  it("tamaños de grupo", () => {
    expect(groupSizes(25, 5)).toEqual([5, 5, 5, 5, 5]);
    expect(groupSizes(23, 5)).toEqual([4, 4, 5, 5, 5]);
    expect(groupSizes(22, 5)).toEqual([5, 5, 6, 6]);
    expect(groupSizes(4, 5)).toEqual([4]);
    expect(groupSizes(0, 5)).toEqual([]);
  });

  it("sugerencia por siembra", () => {
    const es = [{ id: "x", seed: null }, { id: "b", seed: 2 }, { id: "a", seed: 1 }, { id: "c", seed: 3 }, { id: "y", seed: null }, { id: "d", seed: 4 }];
    expect(suggestGroups(es, 3).map((g) => g.map((e) => e.id))).toEqual([["a", "b", "c"], ["d", "x", "y"]]);
  });

  const G = [["a1", "a2", "a3", "a4", "a5"], ["b1", "b2", "b3", "b4", "b5"], ["c1", "c2", "c3", "c4", "c5"]];

  it("grupo 1 no asciende y el último no desciende", () => {
    const m = ladderMovements(G, cfg);
    expect(G[0]!.map((id) => m.get(id))).toEqual(["stay", "stay", "stay", "down", "down"]);
    expect(G[1]!.map((id) => m.get(id))).toEqual(["up", "up", "stay", "down", "down"]);
    expect(G[2]!.map((id) => m.get(id))).toEqual(["up", "up", "stay", "stay", "stay"]);
  });

  it("siguiente ronda: 2 suben, 2 bajan", () => {
    const { groups } = buildNextRound(G, cfg);
    expect(groups).toEqual([
      ["a1", "a2", "a3", "b1", "b2"],
      ["a4", "a5", "b3", "c1", "c2"],
      ["b4", "b5", "c3", "c4", "c5"],
    ]);
  });

  it("una baja: el hueco se rellena subiendo y los nuevos entran abajo", () => {
    const { groups, movements } = buildNextRound(G, cfg, new Set(["a2"]), ["n1"]);
    expect(movements.get("a2")).toBe("out");
    expect(groups.flat()).not.toContain("a2");
    expect(groups.map((g) => g.length)).toEqual([5, 5, 5]);
    expect(groups[0]).toEqual(["a1", "a3", "b1", "b2", "a4"]);
    expect(groups[2]!.at(-1)).toBe("n1");
  });

  it("baja tras 2 rondas sin jugar", () => {
    expect(shouldExpel([2, 0, 0], 2)).toBe(true);
    expect(shouldExpel([0, 1, 0], 2)).toBe(false);
    expect(shouldExpel([0], 2)).toBe(false);
    expect(shouldExpel([0, 0], 0)).toBe(false);
  });
});

describe("rondas", () => {
  it("1 ronda = 1 mes, límite el último día a las 14:00 hora del club", () => {
    const r1 = nextRoundDraft({ previous: null, tournamentStartsOn: "2027-02-01", tournamentEndsOn: "2027-10-30", today: "2026-12-01", config: cfg, timeZone: "America/Mexico_City" });
    expect(r1).toEqual({ number: 1, name: "Febrero", starts_on: "2027-02-01", ends_on: "2027-02-28", results_deadline: "2027-02-28T20:00:00.000Z" });
    const r9 = nextRoundDraft({ previous: { number: 8, ends_on: "2027-09-30" }, tournamentStartsOn: "2027-02-01", tournamentEndsOn: "2027-10-30", today: "2027-10-01", config: cfg, timeZone: "America/Mexico_City" });
    expect(r9).toMatchObject({ number: 9, name: "Octubre", starts_on: "2027-10-01", ends_on: "2027-10-30" });
  });
});

describe("premios", () => {
  it("consistente, ascenso y competitivo", () => {
    const a = computeAwards([
      { entry_id: "A", level: 1, position: 1, movement: "stay", played: 4, won_default: 0 },
      { entry_id: "B", level: 2, position: 1, movement: "up", played: 3, won_default: 1 },
      { entry_id: "A", level: 1, position: 1, movement: "stay", played: 2, won_default: 0 },
      { entry_id: "B", level: 1, position: 2, movement: "stay", played: 4, won_default: 0 },
      { entry_id: "C", level: 3, position: 1, movement: "up", played: 1, won_default: 0 },
    ]);
    expect(a.most_consistent).toEqual({ entry_ids: ["A"], value: 2 });
    expect(a.best_ascent).toEqual({ entry_ids: ["B", "C"], value: 1 });
    expect(a.most_competitive).toEqual({ entry_ids: ["B"], value: 8 });
  });
});
