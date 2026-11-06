import { describe, expect, it } from "vitest";
import type { Completion } from "./types.ts";
import { balanceIndex, pillarScores } from "./wheel.ts";

const TODAY = "2026-03-30";
// day(0) = today, day(k) = k days before today.
const day = (k: number): string =>
  new Date(Date.UTC(2026, 2, 30 - k)).toISOString().slice(0, 10);
const c = (habitId: string, date: string, progress = 1, pillarId = "p"): Completion => ({
  habitId,
  pillarId,
  date,
  progress,
});

describe("pillarScores", () => {
  it("15 of 30 days done on one habit -> 50", () => {
    const comps = Array.from({ length: 15 }, (_, i) => c("h1", day(i)));
    expect(pillarScores(comps, { p: ["h1"] }, TODAY)).toEqual({ p: 50 });
  });

  it("two habits, one fully done and one never -> 50", () => {
    const comps = Array.from({ length: 30 }, (_, i) => c("h1", day(i)));
    expect(pillarScores(comps, { p: ["h1", "h2"] }, TODAY)).toEqual({ p: 50 });
  });

  it("ignores completions older than the window and after today", () => {
    const comps = [c("h1", day(30)), c("h1", day(29)), c("h1", "2026-03-31"), c("h1", day(0))];
    const score = pillarScores(comps, { p: ["h1"] }, TODAY).p;
    expect(score).toBeCloseTo((100 * 2) / 30, 10);
  });

  it("counts a duplicate (habit, date) once, using the highest progress", () => {
    const comps = [c("h1", day(0), 0.5), c("h1", day(0), 1), c("h1", day(0), 1)];
    expect(pillarScores(comps, { p: ["h1"] }, TODAY).p).toBeCloseTo(100 / 30, 10);
  });

  it("clamps progress to [0,1] and treats negative/NaN as 0", () => {
    const comps = [c("h1", day(0), 5), c("h1", day(1), -2), c("h1", day(2), NaN)];
    expect(pillarScores(comps, { p: ["h1"] }, TODAY).p).toBeCloseTo(100 / 30, 10);
  });

  it("ignores completions of habits not listed", () => {
    expect(pillarScores([c("zzz", day(0))], { p: ["h1"] }, TODAY)).toEqual({ p: 0 });
  });

  it("omits pillars with an empty habit list", () => {
    expect(pillarScores([], { p: ["h1"], q: [] }, TODAY)).toEqual({ p: 0 });
  });

  it("returns {} when there are no habits", () => {
    expect(pillarScores([], {}, TODAY)).toEqual({});
  });
});

describe("balanceIndex", () => {
  it("equal scores -> 1", () => expect(balanceIndex({ a: 50, b: 50 })).toBe(1));
  it("empty -> 0", () => expect(balanceIndex({})).toBe(0));
  it("{0,100} -> 0 (sigma 50)", () => expect(balanceIndex({ a: 0, b: 100 })).toBe(0));
  it("single pillar -> 1", () => expect(balanceIndex({ a: 100 })).toBe(1));
});
