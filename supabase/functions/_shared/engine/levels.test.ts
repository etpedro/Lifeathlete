import { describe, expect, it } from "vitest";
import { levelFromXp, xpForLevel } from "./levels.ts";

describe("xpForLevel", () => {
  it("matches round(100 * n^1.5)", () => {
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(2)).toBe(283);
    expect(xpForLevel(4)).toBe(800);
  });
});

describe("levelFromXp", () => {
  it("0 XP is level 1 tier 1", () => {
    expect(levelFromXp(0)).toEqual({ level: 1, tier: 1, xpIntoLevel: 0, xpForNext: 100 });
  });
  it("99 XP is still level 1", () => {
    expect(levelFromXp(99).level).toBe(1);
    expect(levelFromXp(99).xpIntoLevel).toBe(99);
  });
  it("100 XP is level 2", () => {
    expect(levelFromXp(100)).toEqual({ level: 2, tier: 1, xpIntoLevel: 0, xpForNext: 283 });
  });
  it("level 3 starts at 383", () => {
    expect(levelFromXp(382).level).toBe(2);
    expect(levelFromXp(383).level).toBe(3);
  });
  it("tiers change in blocks of 5 levels", () => {
    const start = (n: number) => {
      let t = 0;
      for (let i = 1; i < n; i++) t += xpForLevel(i);
      return t;
    };
    expect(levelFromXp(start(5)).tier).toBe(1);
    expect(levelFromXp(start(6)).tier).toBe(2);
    expect(levelFromXp(start(11)).tier).toBe(3);
    expect(levelFromXp(start(16)).tier).toBe(4);
    expect(levelFromXp(start(21))).toMatchObject({ level: 21, tier: 5 });
    expect(levelFromXp(start(40)).tier).toBe(5);
  });
  it("treats negative/NaN XP as 0", () => {
    expect(levelFromXp(-5).level).toBe(1);
    expect(levelFromXp(Number.NaN).level).toBe(1);
  });
});
