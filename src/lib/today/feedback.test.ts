import { describe, expect, it } from "vitest";
import { statsFeedback } from "./feedback";

const s = (xpTotal: number, level: number, currentStreak: number) => ({ xpTotal, level, currentStreak });

describe("statsFeedback", () => {
  it("derives +N XP from the xp_total delta", () => {
    expect(statsFeedback(s(40, 1, 1), s(50, 1, 1))).toEqual({ xpGained: 10, levelUp: null, streak: null });
    expect(statsFeedback(s(40, 1, 1), s(70, 1, 1)).xpGained).toBe(30);
  });

  it("reports nothing when the numbers did not change", () => {
    expect(statsFeedback(s(40, 1, 1), s(40, 1, 1))).toEqual({ xpGained: null, levelUp: null, streak: null });
  });

  it("shows no XP toast when XP went down (un-tick)", () => {
    expect(statsFeedback(s(50, 1, 1), s(40, 1, 1)).xpGained).toBeNull();
  });

  it("reports a level-up only when the level increased", () => {
    expect(statsFeedback(s(95, 1, 1), s(105, 2, 1)).levelUp).toBe(2);
    expect(statsFeedback(s(105, 2, 1), s(95, 1, 1)).levelUp).toBeNull();
  });

  it("reports a new streak only when the current streak grew", () => {
    expect(statsFeedback(s(0, 1, 0), s(10, 1, 1)).streak).toBe(1);
    expect(statsFeedback(s(10, 1, 3), s(20, 1, 3)).streak).toBeNull();
    expect(statsFeedback(s(10, 1, 3), s(0, 1, 0)).streak).toBeNull();
  });

  it("ignores non-finite numbers", () => {
    expect(statsFeedback(s(Number.NaN, 1, 0), s(10, 1, 0))).toEqual({ xpGained: null, levelUp: null, streak: null });
  });
});
