import { describe, expect, it } from "vitest";
import type { TodayData, TodayHabit } from "@/lib/data/today";
import { applyValue, habitProgress, isComplete, overlayQueued, progressPercent, remainingCount, valueStep } from "./progress";

const check = (value: number): TodayHabit => ({ id: "c", title: "C", kind: "check", target: 1, value, source: "manual" });
const val = (value: number, target: number): TodayHabit => ({ id: "v", title: "V", kind: "value", target, value, source: "manual" });

describe("habitProgress (mirrors the engine progress ruling)", () => {
  it("check: 1 when value > 0, else 0", () => {
    expect(habitProgress(check(1))).toBe(1);
    expect(habitProgress(check(0))).toBe(0);
  });
  it("value: value / target", () => {
    expect(habitProgress(val(15, 30))).toBe(0.5);
  });
  it("value with target 0 counts as done when value > 0 (never divides by zero)", () => {
    expect(habitProgress(val(3, 0))).toBe(1);
    expect(habitProgress(val(0, 0))).toBe(0);
  });
  it("is 0 for a non-finite value", () => {
    expect(habitProgress(val(Number.NaN, 10))).toBe(0);
  });
});

describe("progressPercent", () => {
  it.each([
    [val(15, 30), 50],
    [val(45, 30), 100],
    [val(3, 0), 100],
    [val(0, 0), 0],
    [val(Number.NaN, 30), 0],
    [val(1, Number.NaN), 100],
    [val(1, 3), 33],
  ])("is a finite integer clamped to 0..100 (%#)", (h, pct) => {
    const p = progressPercent(h);
    expect(Number.isFinite(p)).toBe(true);
    expect(p).toBe(pct);
  });
});

describe("isComplete / remainingCount", () => {
  const data: TodayData = {
    pillars: [
      { pillarId: "a", slug: "exercise", habits: [check(1), val(10, 30)] },
      { pillarId: "b", slug: "reading", habits: [{ ...check(0), id: "c2" }, { ...val(40, 30), id: "v2" }] },
    ],
  };
  it("counts habits not yet complete", () => {
    expect(isComplete(val(30, 30))).toBe(true);
    expect(isComplete(val(29, 30))).toBe(false);
    expect(remainingCount(data)).toBe(2);
  });
  it("is 0 when there are no habits", () => {
    expect(remainingCount({ pillars: [] })).toBe(0);
  });
});

describe("applyValue", () => {
  it("returns new data with that habit's value set and source manual (optimistic update)", () => {
    const data: TodayData = {
      pillars: [{ pillarId: "a", slug: "exercise", habits: [{ ...val(10, 30), source: "strava" }, check(0)] }],
    };
    const next = applyValue(data, "v", 30);
    expect(next.pillars[0].habits[0]).toMatchObject({ value: 30, source: "manual" });
    expect(next.pillars[0].habits[1]).toBe(data.pillars[0].habits[1]);
    expect(data.pillars[0].habits[0].value).toBe(10); // not mutated
  });
});

describe("valueStep", () => {
  it.each([
    [0, 1],
    [2, 1],
    [10, 1],
    [30, 5],
    [100, 5],
    [8000, 500],
    [500, 50],
  ])("target %d -> step %d", (target, step) => {
    expect(valueStep(target)).toBe(step);
  });
});

describe("overlayQueued", () => {
  const data: TodayData = {
    pillars: [{ pillarId: "a", slug: "exercise", habits: [check(0), val(10, 30)] }],
  };
  const q = (userHabitId: string, date: string, value: number) => ({ userHabitId, userId: "u", date, value, seq: 1 });

  it("shows queued (not yet synced) values of the displayed day and returns their habit ids", () => {
    const { data: out, pendingIds } = overlayQueued(data, [q("c", "2026-11-06", 1), q("v", "2026-11-05", 30)], "2026-11-06");
    expect(out.pillars[0].habits[0]).toMatchObject({ id: "c", value: 1, source: "manual" });
    expect(out.pillars[0].habits[1].value).toBe(10);
    expect([...pendingIds]).toEqual(["c"]);
  });

  it("ignores queued items for habits that are not shown (e.g. archived)", () => {
    const { data: out, pendingIds } = overlayQueued(data, [q("gone", "2026-11-06", 1)], "2026-11-06");
    expect(out).toEqual(data);
    expect(pendingIds.size).toBe(0);
  });
});
