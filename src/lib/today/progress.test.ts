import { describe, expect, it } from "vitest";
import type { TodayData, TodayHabit } from "@/lib/data/today";
import {
  applyValue,
  blankDay,
  fallbackDay,
  habitProgress,
  isComplete,
  overlayQueued,
  progressPercent,
  rememberLoaded,
  remainingCount,
  valueStep,
} from "./progress";

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

describe("fallbackDay (a day that could not be loaded, e.g. offline the next morning)", () => {
  const habits = (a: number, b: number): TodayData => ({
    pillars: [
      {
        pillarId: "p1",
        slug: "exercise",
        habits: [
          { id: "a", title: "Treino", kind: "check", target: 1, value: a, source: "manual" },
          { id: "b", title: "Caminhar", kind: "value", target: 30, value: b, source: "strava" },
        ],
      },
    ],
  });
  const today = habits(1, 12);

  it("blankDay keeps the habit structure with values reset to 0 and no source", () => {
    const blank = blankDay(today);
    expect(blank.pillars[0].habits.map((h) => [h.id, h.title, h.kind, h.target, h.value, h.source])).toEqual([
      ["a", "Treino", "check", 1, 0, "none"],
      ["b", "Caminhar", "value", 30, 0, "none"],
    ]);
    expect(today.pillars[0].habits[0].value).toBe(1); // not mutated
  });

  it("keeps the REAL values of a day that loaded before, with its queued values on top (same-day offline reload)", () => {
    const out = fallbackDay({ "2026-11-07": today }, [{ userHabitId: "b", date: "2026-11-07", value: 20 }], "2026-11-07");
    expect(out?.valuesKnown).toBe(true);
    expect(out?.data.pillars[0].habits.map((h) => [h.value, h.source])).toEqual([
      [1, "manual"], // done habit stays done
      [20, "manual"], // the queued tap is a manual log (manual prevails over the sensor)
    ]);
    expect(out?.pendingIds).toEqual(new Set(["b"]));
  });

  it("does not let a stale queued value of another day leak into the shown day", () => {
    const out = fallbackDay({ "2026-11-07": today }, [{ userHabitId: "a", date: "2026-11-06", value: 0 }], "2026-11-07");
    expect(out?.data.pillars[0].habits.map((h) => h.value)).toEqual([1, 12]);
    expect(out?.pendingIds.size).toBe(0);
  });

  it("a day that never loaded shows the newest loaded day's habits blank, flagged as unknown values, with queued values on top", () => {
    const loaded = { "2026-11-05": habits(1, 5), "2026-11-07": today };
    const out = fallbackDay(loaded, [{ userHabitId: "b", date: "2026-11-08", value: 20 }], "2026-11-08");
    expect(out?.valuesKnown).toBe(false);
    expect(out?.data.pillars[0].habits.map((h) => h.value)).toEqual([0, 20]);
    expect(out?.pendingIds).toEqual(new Set(["b"]));
  });

  it("yesterday offline: yesterday's loaded values are kept when it loaded before, blank otherwise", () => {
    expect(fallbackDay({ "2026-11-06": habits(1, 7) }, [], "2026-11-06")?.data.pillars[0].habits.map((h) => h.value)).toEqual([1, 7]);
    expect(fallbackDay({ "2026-11-07": today }, [], "2026-11-06")?.data.pillars[0].habits.map((h) => h.value)).toEqual([0, 0]);
  });

  it("is null when no day was ever loaded (the load error is shown instead)", () => {
    expect(fallbackDay({}, [], "2026-11-07")).toBeNull();
  });
});

describe("rememberLoaded (small per-date memory of loaded days)", () => {
  const d = (id: string): TodayData => ({ pillars: [{ pillarId: "p", slug: "s", habits: [{ id, title: id, kind: "check", target: 1, value: 0, source: "none" }] }] });
  it("stores by date, replaces the same date, and keeps only the newest few", () => {
    let m: Record<string, TodayData> = {};
    for (const date of ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"]) {
      m = rememberLoaded(m, date, d(date));
    }
    expect(Object.keys(m)).toEqual(["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"]);
    const again = rememberLoaded(m, "2026-11-07", d("new"));
    expect(again["2026-11-07"].pillars[0].habits[0].id).toBe("new");
    expect(m["2026-11-07"].pillars[0].habits[0].id).toBe("2026-11-07"); // input not mutated
  });
});
