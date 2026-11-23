import { describe, expect, it } from "vitest";

import { buildHistory, entryRecord, ladderOrder, type RecordMatch } from "./history";

describe("ladderOrder", () => {
  it("grupo 1 primero; posición global continua", () => {
    const out = ladderOrder([
      { level: 2, rows: [{ entry_id: "c" }, { entry_id: "d" }] },
      { level: 1, rows: [{ entry_id: "a" }, { entry_id: "b" }] },
    ]);
    expect(out.map((r) => [r.entry_id, r.level, r.rank])).toEqual([["a", 1, 1], ["b", 1, 2], ["c", 2, 3], ["d", 2, 4]]);
  });
});

describe("buildHistory", () => {
  it("rondas cerradas desde snapshots y la vigente desde su grupo", () => {
    const h = buildHistory(
      [{ id: "r1", status: "closed" }, { id: "r2", status: "active" }],
      [
        { round_id: "r1", entry_id: "a", level: 2, position: 1, points: 12, movement: "up" },
        { round_id: "r1", entry_id: "b", level: 1, position: 5, points: 4, movement: "down" },
      ],
      { roundId: "r2", levelOf: new Map([["a", 1], ["b", 2], ["n", 2]]) },
    );
    expect(h.get("a")).toEqual([{ level: 2, position: 1, points: 12, movement: "up" }, { level: 1, position: null, points: null, movement: null }]);
    expect(h.get("n")).toEqual([null, { level: 2, position: null, points: null, movement: null }]);
  });
});

describe("entryRecord", () => {
  const m = (a: string, b: string, w: string | null, extra: Partial<RecordMatch> = {}): RecordMatch => ({
    entry_a: a, entry_b: b, status: "confirmed", result_type: "played", winner_entry_id: w, ...extra,
  });
  it("cuenta ganados, defaults, no jugados y H2H; ignora lo no cerrado", () => {
    const r = entryRecord([
      m("a", "b", "a"),
      m("b", "a", "a", { result_type: "default" }),
      m("a", "c", "c"),
      m("a", "c", null, { status: "not_played", result_type: "not_played" }),
      m("a", "d", "a", { status: "reported" }),
      m("x", "y", "x"),
    ], "a");
    expect(r).toMatchObject({ won: 1, wonDefault: 1, lost: 1, lostDefault: 0, notPlayed: 1 });
    expect(Object.fromEntries(r.h2h)).toEqual({ b: { won: 2, lost: 0 }, c: { won: 0, lost: 1 } });
  });
});
