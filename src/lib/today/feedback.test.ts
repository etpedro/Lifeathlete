import { describe, expect, it, vi } from "vitest";
import type { AchievementItem } from "@/lib/data/stats";
import { createAchievementWatcher, hasFeedback, newlyUnlocked, statsFeedback, unlockedCodes, withAchievements } from "./feedback";

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

describe("achievement unlocks", () => {
  const item = (code: string, unlockedAt: string | null, title = code.toUpperCase()): AchievementItem => ({
    code,
    title,
    description: "",
    pillarSlug: null,
    xpReward: 0,
    unlockedAt,
    progress: null,
  });

  it("newlyUnlocked: codes unlocked now that were not unlocked before", () => {
    const after = [item("a", "2026-11-01"), item("b", "2026-11-06"), item("c", null)];
    expect(newlyUnlocked(new Set(["a"]), after).map((a) => a.code)).toEqual(["b"]);
    expect(newlyUnlocked(new Set(["a", "b"]), after)).toEqual([]);
    expect(unlockedCodes(after)).toEqual(new Set(["a", "b"]));
  });

  it("withAchievements adds the titles to the current feedback, or makes an achievement-only feedback", () => {
    const xp = statsFeedback(s(40, 1, 1), s(50, 1, 1));
    expect(withAchievements(xp, ["Leitor"])).toEqual({ ...xp, achievements: ["Leitor"] });
    expect(withAchievements(null, ["Leitor"])).toEqual({
      xpGained: null,
      levelUp: null,
      streak: null,
      achievements: ["Leitor"],
    });
    expect(withAchievements({ ...xp, achievements: ["A"] }, ["B"]).achievements).toEqual(["A", "B"]);
  });

  it("hasFeedback is true for an achievement alone", () => {
    expect(hasFeedback(withAchievements(null, ["X"]))).toBe(true);
    expect(hasFeedback({ xpGained: null, levelUp: null, streak: null, achievements: [] })).toBe(false);
  });
});

describe("createAchievementWatcher", () => {
  const item = (code: string, unlocked: boolean): AchievementItem => ({
    code,
    title: `T-${code}`,
    description: "",
    pillarSlug: null,
    xpReward: 0,
    unlockedAt: unlocked ? "2026-11-06T10:00:00Z" : null,
    progress: null,
  });

  it("reports only achievements unlocked since the baseline taken when Hoje opened", async () => {
    const load = vi.fn<() => Promise<AchievementItem[]>>().mockResolvedValueOnce([item("a", true), item("b", false)]);
    const w = createAchievementWatcher(load);
    w.prime();
    load.mockResolvedValueOnce([item("a", true), item("b", true)]);
    expect((await w.check()).map((a) => a.title)).toEqual(["T-b"]);
    load.mockResolvedValueOnce([item("a", true), item("b", true)]);
    expect(await w.check()).toEqual([]); // already announced
  });

  it("without a baseline (load failed), the first check only sets it (never announces old medals)", async () => {
    const load = vi.fn<() => Promise<AchievementItem[]>>().mockRejectedValueOnce(new Error("offline"));
    const w = createAchievementWatcher(load);
    w.prime();
    load.mockResolvedValueOnce([item("a", true)]);
    expect(await w.check()).toEqual([]);
    load.mockResolvedValueOnce([item("a", true), item("b", true)]);
    expect((await w.check()).map((a) => a.code)).toEqual(["b"]);
  });

  it("overlapping checks are serialized: an unlock is announced once", async () => {
    const load = vi.fn<() => Promise<AchievementItem[]>>().mockResolvedValue([item("a", false)]);
    const w = createAchievementWatcher(load);
    w.prime();
    await Promise.resolve();
    load.mockResolvedValue([item("a", true)]);
    const [x, y] = await Promise.all([w.check(), w.check()]);
    expect([...x, ...y].map((a) => a.code)).toEqual(["a"]);
  });

  it("a failed check rejects and keeps the previous baseline", async () => {
    const load = vi.fn<() => Promise<AchievementItem[]>>().mockResolvedValueOnce([item("a", false)]);
    const w = createAchievementWatcher(load);
    w.prime();
    load.mockRejectedValueOnce(new Error("x"));
    await expect(w.check()).rejects.toThrow("x");
    load.mockResolvedValueOnce([item("a", true)]);
    expect((await w.check()).map((a) => a.code)).toEqual(["a"]);
  });
});
