import { describe, expect, it } from "vitest";

import { defaultConfig, parseConfig } from "./config";
import { matchPoints, validateScore, weekOfRound, type ScoredMatch } from "./scoring";

const cfg = defaultConfig("ladder");
const fmt = cfg.match_format;

describe("config", () => {
  it("defaults de la escalera", () => {
    expect(cfg.group_size).toBe(5);
    expect(cfg.points).toEqual({ win: 3, win_default: 2, loss_played: 1, loss_default: 0, not_played: 0 });
    expect(cfg.bonus).toEqual([{ week: 1, value: 0.25 }, { week: 2, value: 0.1 }]);
  });
  it("rellena lo que falte y tolera basura", () => {
    expect(parseConfig({ promote: 1 }).relegate).toBe(2);
    expect(parseConfig({ points: { win: 4 } }).points.loss_played).toBe(1);
    expect(parseConfig("basura").group_size).toBe(5);
  });
  it("round robin sin ascensos", () => {
    const rr = defaultConfig("round_robin");
    expect([rr.promote, rr.relegate]).toEqual([0, 0]);
  });
});

describe("validateScore", () => {
  const v = (sets: number[][]) => validateScore({ sets }, fmt);
  it("acepta 2-0 y 2-1 con match tie-break", () => {
    expect(v([[6, 4], [7, 5]])).toMatchObject({ ok: true, summary: { winner: "a", sets: { a: 2, b: 0 }, games: { a: 13, b: 9 } } });
    const r = v([[6, 4], [3, 6], [8, 10]]);
    expect(r).toMatchObject({ ok: true, summary: { winner: "b", sets: { a: 1, b: 2 }, games: { a: 9, b: 11 } } });
    expect(v([[7, 6], [6, 7], [12, 10]]).ok).toBe(true);
  });
  it("rechaza sets imposibles", () => {
    expect(v([[6, 5], [6, 0]]).ok).toBe(false);
    expect(v([[8, 6], [6, 0]]).ok).toBe(false);
    expect(v([[6, 4], [6, 4], [6, 4]]).ok).toBe(false); // 3.er set sobra
    expect(v([[6, 4], [4, 6]]).ok).toBe(false); // falta el 3.º
    expect(v([[6, 4], [4, 6], [10, 9]]).ok).toBe(false); // TB por 2
    expect(v([[6, 4], [4, 6], [13, 10]]).ok).toBe(false);
    expect(v([[6, 4]]).ok).toBe(false);
    expect(validateScore(null, fmt).ok).toBe(false);
  });
  it("3.er set completo si la config lo pide", () => {
    expect(validateScore({ sets: [[6, 4], [4, 6], [7, 5]] }, { ...fmt, third_set: "full_set" }).ok).toBe(true);
    expect(validateScore({ sets: [[6, 4], [4, 6], [10, 8]] }, { ...fmt, third_set: "full_set" }).ok).toBe(false);
  });
});

describe("puntos y bonus (bases)", () => {
  const base: ScoredMatch = {
    entry_a: "A", entry_b: "B", status: "confirmed", result_type: "played", winner_entry_id: "A",
    score: { sets: [[6, 4], [6, 4]] }, played_on: "2027-02-20",
  };
  const pts = (m: Partial<ScoredMatch>) => matchPoints({ ...base, ...m }, "2027-02-01", cfg);

  it("semana de la ronda", () => {
    expect(weekOfRound("2027-02-01", "2027-02-01")).toBe(1);
    expect(weekOfRound("2027-02-07", "2027-02-01")).toBe(1);
    expect(weekOfRound("2027-02-08", "2027-02-01")).toBe(2);
    expect(weekOfRound("2027-01-31", "2027-02-01")).toBeNull();
  });
  it("ganado 3, perdido jugado 1", () => {
    expect(pts({})).toEqual({ a: { points: 3, bonus: 0 }, b: { points: 1, bonus: 0 } });
  });
  it("bonus .25 en la 1.ª semana y .10 en la 2.ª, para los dos", () => {
    expect(pts({ played_on: "2027-02-03" })).toEqual({ a: { points: 3, bonus: 0.25 }, b: { points: 1, bonus: 0.25 } });
    expect(pts({ played_on: "2027-02-10" })).toEqual({ a: { points: 3, bonus: 0.1 }, b: { points: 1, bonus: 0.1 } });
  });
  it("default: 2 al ganador, 0 al perdedor y sin bonus", () => {
    expect(pts({ result_type: "default", score: null, played_on: "2027-02-02", winner_entry_id: "B" })).toEqual({
      a: { points: 0, bonus: 0 }, b: { points: 2, bonus: 0 },
    });
  });
  it("no jugado: 0 y 0", () => {
    expect(pts({ status: "not_played", result_type: null, winner_entry_id: null })).toEqual({
      a: { points: 0, bonus: 0 }, b: { points: 0, bonus: 0 },
    });
  });
  it("sin resultado confirmado no suma", () => {
    expect(pts({ status: "reported" })).toBeNull();
    expect(pts({ status: "pending", winner_entry_id: null })).toBeNull();
  });
});
