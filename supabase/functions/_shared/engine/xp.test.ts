import { describe, expect, it } from "vitest";
import { dayXp, weeklyBalanceBonus } from "./xp.ts";
import type { Completion } from "./types.ts";

const c = (habitId: string, progress: number, pillarId = "p1", date = "2026-01-05"): Completion => ({
  habitId,
  pillarId,
  date,
  progress,
});

describe("dayXp", () => {
  it("3 of 3 complete gives 30 + 20 bonus", () => {
    expect(dayXp([c("a", 1), c("b", 1), c("c", 1)], 3)).toBe(50);
  });
  it("1 of 3 gives 10", () => {
    expect(dayXp([c("a", 1)], 3)).toBe(10);
  });
  it("is proportional to progress", () => {
    expect(dayXp([c("a", 0.5)], 3)).toBe(5);
  });
  it("clamps progress above 1 to 10 XP", () => {
    expect(dayXp([c("a", 2)], 3)).toBe(10);
  });
  it("returns 0 with no active habits", () => {
    expect(dayXp([c("a", 1)], 0)).toBe(0);
    expect(dayXp([], 0)).toBe(0);
  });
  it("keeps the highest progress for duplicate habitId", () => {
    expect(dayXp([c("a", 0.2), c("a", 1)], 1)).toBe(30);
    expect(dayXp([c("a", 1), c("a", 1)], 1)).toBe(30);
  });
  it("treats negative and NaN progress as 0", () => {
    expect(dayXp([c("a", -1), c("b", Number.NaN)], 2)).toBe(0);
  });
  it("gives no bonus when a habit is partial", () => {
    expect(dayXp([c("a", 1), c("b", 0.5)], 2)).toBe(15);
  });
});

describe("weeklyBalanceBonus", () => {
  const days = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"];
  const forPillar = (p: string, n: number) =>
    days.slice(0, n).map((d) => c(`h-${p}`, 1, p, d));

  it("gives 30 when every active pillar has >= 4 days", () => {
    expect(weeklyBalanceBonus([...forPillar("a", 4), ...forPillar("b", 4)], ["a", "b"])).toBe(30);
  });
  it("gives 0 when one pillar has only 3 days", () => {
    expect(weeklyBalanceBonus([...forPillar("a", 4), ...forPillar("b", 3)], ["a", "b"])).toBe(0);
  });
  it("gives 0 for an empty pillar list", () => {
    expect(weeklyBalanceBonus(forPillar("a", 4), [])).toBe(0);
  });
  it("counts distinct dates, not completions", () => {
    const many = [c("x", 1, "a", days[0]), c("y", 1, "a", days[0]), c("z", 1, "a", days[0]), c("w", 1, "a", days[0])];
    expect(weeklyBalanceBonus(many, ["a"])).toBe(0);
  });
  it("ignores zero-progress completions and inactive pillars", () => {
    const zero = days.map((d) => c("h", 0, "a", d));
    expect(weeklyBalanceBonus(zero, ["a"])).toBe(0);
    expect(weeklyBalanceBonus([...forPillar("a", 4), ...forPillar("z", 1)], ["a"])).toBe(30);
  });
});
