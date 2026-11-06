import { describe, expect, it } from "vitest";
import { evaluateAchievements, type AchievementRule } from "./achievements.ts";
import type { Completion } from "./types.ts";

const TODAY = "2026-03-30";
const dayN = (k: number): string => `2026-03-${String(30 - k).padStart(2, "0")}`;
const c = (habitId: string, pillarId: string, date: string, progress = 1): Completion => ({
  habitId,
  pillarId,
  date,
  progress,
});
const rules = (...r: { code: string; rule: AchievementRule }[]) => r;

describe("streak rules", () => {
  const meditation = Array.from({ length: 30 }, (_, i) => c("m", "meditation", dayN(i)));
  const state = { completions: meditation, today: TODAY, activePillars: ["meditation"] };

  it("30-day pillar streak unlocks pillar rule but not a global 100-day rule", () => {
    const out = evaluateAchievements(
      rules(
        { code: "streak/30/meditation", rule: { type: "streak", days: 30, pillar: "meditation" } },
        { code: "streak/100", rule: { type: "streak", days: 100 } },
      ),
      state,
    );
    expect(out).toEqual(["streak/30/meditation"]);
  });

  it("global 30-day streak is unlocked by mixed pillars", () => {
    const mixed = Array.from({ length: 30 }, (_, i) =>
      c(`h${i % 3}`, `p${i % 3}`, dayN(i)),
    );
    const out = evaluateAchievements(
      rules({ code: "streak/30", rule: { type: "streak", days: 30 } }),
      { completions: mixed, today: TODAY, activePillars: ["p0", "p1", "p2"] },
    );
    expect(out).toEqual(["streak/30"]);
  });

  it("progress 0.5 days do not count", () => {
    const half = Array.from({ length: 30 }, (_, i) => c("m", "meditation", dayN(i), 0.5));
    const out = evaluateAchievements(
      rules({ code: "s", rule: { type: "streak", days: 3 } }),
      { completions: half, today: TODAY, activePillars: ["meditation"] },
    );
    expect(out).toEqual([]);
  });
});

describe("total rules", () => {
  it("100 done completions with pillar filter", () => {
    const many: Completion[] = [];
    for (let h = 0; h < 10; h++) {
      for (let d = 1; d <= 10; d++) many.push(c(`x${h}`, "x", `2026-02-${String(d).padStart(2, "0")}`));
    }
    many.push(c("y", "y", "2026-02-01"));
    const st = { completions: many, today: TODAY, activePillars: ["x", "y"] };
    const out = evaluateAchievements(
      rules(
        { code: "t100x", rule: { type: "total", count: 100, pillar: "x" } },
        { code: "t100y", rule: { type: "total", count: 100, pillar: "y" } },
        { code: "t101", rule: { type: "total", count: 101 } },
        { code: "t102", rule: { type: "total", count: 102 } },
      ),
      st,
    );
    expect(out).toEqual(["t100x", "t101"]);
  });

  it("counts a duplicate (habit, date) once", () => {
    const comps = [c("a", "x", "2026-02-01"), c("a", "x", "2026-02-01")];
    const out = evaluateAchievements(
      rules({ code: "t2", rule: { type: "total", count: 2 } }),
      { completions: comps, today: TODAY, activePillars: ["x"] },
    );
    expect(out).toEqual([]);
  });
});

describe("balance rules", () => {
  const pillars = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
  // 2026-03-23 (Mon) .. 2026-03-29 (Sun) is one ISO week.
  const sameWeek = (n: number) =>
    pillars(n).map((p, i) => c(`h${i}`, p, `2026-03-${String(23 + (i % 7))}`));

  it("10 pillars in the same ISO week unlocks", () => {
    const out = evaluateAchievements(
      rules({ code: "bal10", rule: { type: "balance", pillars: 10 } }),
      { completions: sameWeek(10), today: TODAY, activePillars: pillars(10) },
    );
    expect(out).toEqual(["bal10"]);
  });

  it("9 pillars does not unlock a 10-pillar rule", () => {
    const out = evaluateAchievements(
      rules({ code: "bal10", rule: { type: "balance", pillars: 10 } }),
      { completions: sameWeek(9), today: TODAY, activePillars: pillars(10) },
    );
    expect(out).toEqual([]);
  });

  it("pillars spread across different weeks do not unlock", () => {
    const spread = pillars(10).map((p, i) => c(`h${i}`, p, `2026-0${1 + Math.floor(i / 4)}-${String(5 + (i % 4) * 7).padStart(2, "0")}`));
    const out = evaluateAchievements(
      rules({ code: "bal10", rule: { type: "balance", pillars: 10 } }),
      { completions: spread, today: TODAY, activePillars: pillars(10) },
    );
    expect(out).toEqual([]);
  });

  it("requires enough active pillars and ignores inactive ones", () => {
    const out = evaluateAchievements(
      rules({ code: "bal10", rule: { type: "balance", pillars: 10 } }),
      { completions: sameWeek(10), today: TODAY, activePillars: pillars(9) },
    );
    expect(out).toEqual([]);
  });
});

describe("robustness", () => {
  const st = {
    completions: [c("a", "x", TODAY)],
    today: TODAY,
    activePillars: ["x"],
  };
  it("zero/negative thresholds never unlock", () => {
    const out = evaluateAchievements(
      rules(
        { code: "a", rule: { type: "streak", days: 0 } },
        { code: "b", rule: { type: "total", count: -1 } },
        { code: "c", rule: { type: "balance", pillars: 0 } },
      ),
      { ...st, completions: [] },
    );
    expect(out).toEqual([]);
  });

  it("unknown rule type is ignored", () => {
    const out = evaluateAchievements(
      [
        { code: "weird", rule: { type: "teleport" } as unknown as AchievementRule },
        { code: "ok", rule: { type: "total", count: 1 } },
      ],
      st,
    );
    expect(out).toEqual(["ok"]);
  });

  it("no duplicate codes, input order kept", () => {
    const out = evaluateAchievements(
      rules(
        { code: "b", rule: { type: "total", count: 1 } },
        { code: "a", rule: { type: "total", count: 1 } },
        { code: "b", rule: { type: "total", count: 1 } },
      ),
      st,
    );
    expect(out).toEqual(["b", "a"]);
  });
});
