import { describe, expect, it } from "vitest";

import { planClose, type CloseInput, type CloseMatch } from "./close";
import { defaultConfig } from "./config";

const cfg = defaultConfig("ladder");
const G = [
  { id: "g1", level: 1, entries: ["a1", "a2", "a3", "a4", "a5"] },
  { id: "g2", level: 2, entries: ["b1", "b2", "b3", "b4", "b5"] },
];

let n = 0;
const m = (group: string, a: string, b: string, extra: Partial<CloseMatch> = {}): CloseMatch => ({
  id: `m${n++}`, group_id: group, entry_a: a, entry_b: b, status: "confirmed", result_type: "played",
  winner_entry_id: a, score: { sets: [[6, 2], [6, 2]] }, scheduled_at: "2027-02-20T16:00:00Z", reported_at: null, ...extra,
});

/** Round robin completo de un grupo; gana siempre el de mejor siembra. */
function allPlayed(group: { id: string; entries: string[] }): CloseMatch[] {
  const out: CloseMatch[] = [];
  group.entries.forEach((a, i) => group.entries.slice(i + 1).forEach((b) => out.push(m(group.id, a, b))));
  return out;
}

function input(over: Partial<CloseInput> = {}): CloseInput {
  return {
    type: "ladder",
    config: cfg,
    timeZone: "America/Mexico_City",
    round: { number: 1, starts_on: "2027-02-01", ends_on: "2027-02-28" },
    tournamentEndsOn: "2027-10-30",
    today: "2027-02-28",
    groups: G,
    matches: [...allPlayed(G[0]!), ...allPlayed(G[1]!)],
    entryStatus: new Map(G.flatMap((g) => g.entries).map((e) => [e, "accepted"])),
    previousActivity: new Map(),
    ...over,
  };
}

describe("planClose", () => {
  it("escalera: tablas, 2 suben / 2 bajan y la siguiente ronda", () => {
    const p = planClose(input());
    if (!p.ok) throw new Error(p.error);
    expect(p.snapshots).toHaveLength(10);
    expect(p.snapshots.find((s) => s.entry_id === "a1")).toMatchObject({ position: 1, points: 12, movement: "stay" });
    expect(p.snapshots.find((s) => s.entry_id === "a5")).toMatchObject({ position: 5, movement: "down" });
    expect(p.snapshots.find((s) => s.entry_id === "b1")).toMatchObject({ movement: "up" });
    expect(p.next).toMatchObject({ number: 2, name: "Marzo", starts_on: "2027-03-01", ends_on: "2027-03-31" });
    expect(p.next!.groups).toEqual([
      { level: 1, entries: ["a1", "a2", "a3", "b1", "b2"] },
      { level: 2, entries: ["a4", "a5", "b3", "b4", "b5"] },
    ]);
    expect(p.finish).toBe(false);
  });

  it("con disputas no cierra", () => {
    const ms = input().matches;
    ms[0] = { ...ms[0]!, status: "disputed" };
    expect(planClose(input({ matches: ms }))).toEqual({ ok: false, error: expect.stringContaining("disputa") });
  });

  it("por confirmar cuenta; sin resultado es no jugado (0 puntos)", () => {
    const ms = input().matches.map((x) =>
      x.entry_a === "a1" && x.entry_b === "a2" ? { ...x, status: "reported" } : x.entry_a === "a4" && x.entry_b === "a5" ? { ...x, status: "scheduled", winner_entry_id: null, result_type: null } : x,
    );
    const p = planClose(input({ matches: ms }));
    if (!p.ok) throw new Error(p.error);
    const a1 = p.snapshots.find((s) => s.entry_id === "a1")!;
    const a4 = p.snapshots.find((s) => s.entry_id === "a4")!;
    expect(a1.won).toBe(4);
    expect(a4).toMatchObject({ not_played: 1, played: 3 });
  });

  it("baja por 2 rondas sin jugar: sale y el hueco lo llena el de abajo; los nuevos entran abajo", () => {
    const ms = input().matches.map((x) => (x.entry_a === "a3" || x.entry_b === "a3" ? { ...x, status: "pending", result_type: null, winner_entry_id: null } : x));
    const status = new Map(input().entryStatus);
    status.set("n1", "accepted");
    const p = planClose(input({ matches: ms, previousActivity: new Map([["a3", [0]]]), entryStatus: status }));
    if (!p.ok) throw new Error(p.error);
    expect(p.expel).toEqual(["a3"]);
    expect(p.snapshots.find((s) => s.entry_id === "a3")!.movement).toBe("out");
    const flat = p.next!.groups.flatMap((g) => g.entries);
    expect(flat).not.toContain("a3");
    expect(flat.at(-1)).toBe("n1");
    expect(p.next!.groups.map((g) => g.entries.length)).toEqual([5, 5]);
  });

  it("el último mes no crea ronda y finaliza", () => {
    const p = planClose(input({ round: { number: 9, starts_on: "2027-10-01", ends_on: "2027-10-30" } }));
    expect(p.ok && p.next === null && p.finish).toBe(true);
  });

  it("round robin: sin movimientos ni siguiente ronda", () => {
    const p = planClose(input({ type: "round_robin", config: defaultConfig("round_robin") }));
    if (!p.ok) throw new Error(p.error);
    expect(p.next).toBeNull();
    expect(p.finish).toBe(true);
    expect(p.snapshots.every((s) => s.movement === null)).toBe(true);
  });
});
