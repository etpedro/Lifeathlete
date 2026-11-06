import { describe, expect, it } from "vitest";
import { getAchievements, getProfileStats, getWheel } from "./stats";
import { createFakeDb, type Row } from "./testing/fake-db";

const PILLARS: Row[] = [
  { id: "p-ex", slug: "exercise", sort: 1 },
  { id: "p-nu", slug: "nutrition", sort: 2 },
  { id: "p-na", slug: "nature", sort: 3 },
];

function dbWith(tables: Record<string, Row[]>) {
  return createFakeDb({ userId: "u1", tables }).db;
}

describe("getWheel", () => {
  it("returns only empty scores without pillars", async () => {
    expect(await getWheel(dbWith({}))).toEqual({ scores: {} });
  });

  it("returns empty scores when the user has no pillar_scores rows", async () => {
    expect(await getWheel(dbWith({ pillars: PILLARS }))).toEqual({ scores: {} });
  });

  it("highlights nothing with a single pillar", async () => {
    const w = await getWheel(dbWith({ pillars: PILLARS, pillar_scores: [{ pillar_id: "p-ex", score: 50 }] }));
    expect(w).toEqual({ scores: { exercise: 50 } });
    expect("weakest" in w).toBe(false);
  });

  it("maps pillar ids to slugs and picks weakest and strongest of two", async () => {
    const w = await getWheel(
      dbWith({
        pillars: PILLARS,
        pillar_scores: [
          { pillar_id: "p-nu", score: "80" },
          { pillar_id: "p-na", score: 20 },
        ],
      }),
    );
    expect(w).toEqual({ scores: { nutrition: 80, nature: 20 }, weakest: "nature", strongest: "nutrition" });
  });

  it("highlights nothing when all scores are equal", async () => {
    const w = await getWheel(
      dbWith({
        pillars: PILLARS,
        pillar_scores: [
          { pillar_id: "p-ex", score: 40 },
          { pillar_id: "p-nu", score: 40 },
        ],
      }),
    );
    expect(w.weakest).toBeUndefined();
    expect(w.strongest).toBeUndefined();
  });

  it("breaks ties by pillars.sort", async () => {
    const w = await getWheel(
      dbWith({
        // rows deliberately out of sort order
        pillars: [PILLARS[2], PILLARS[1], PILLARS[0]],
        pillar_scores: [
          { pillar_id: "p-na", score: 10 },
          { pillar_id: "p-nu", score: 10 },
          { pillar_id: "p-ex", score: 90 },
          { pillar_id: "p-nu2", score: 5 }, // unknown pillar is ignored
        ],
      }),
    );
    expect(w.weakest).toBe("nutrition");
    expect(w.strongest).toBe("exercise");
  });

  it("breaks a tie for strongest by sort too", async () => {
    const w = await getWheel(
      dbWith({
        pillars: PILLARS,
        pillar_scores: [
          { pillar_id: "p-na", score: 90 },
          { pillar_id: "p-nu", score: 90 },
          { pillar_id: "p-ex", score: 10 },
        ],
      }),
    );
    expect(w.strongest).toBe("nutrition");
  });
});

describe("getProfileStats", () => {
  it("defaults for a brand-new user", async () => {
    expect(await getProfileStats(dbWith({}))).toEqual({
      level: 1,
      tier: 1,
      xpIntoLevel: 0,
      xpForNext: 100,
      currentStreak: 0,
      bestStreak: 0,
      lastActiveDate: null,
      mascot: { stage: 1, variant: "dim" },
    });
  });

  it("computes level at the boundaries with the engine", async () => {
    const at = async (xp: number) => getProfileStats(dbWith({ user_stats: [{ xp_total: xp }] }));
    expect(await at(99)).toMatchObject({ level: 1, xpIntoLevel: 99, xpForNext: 100 });
    expect(await at(100)).toMatchObject({ level: 2, xpIntoLevel: 0, xpForNext: 283 });
  });

  it("reads streaks, last active date and the mascot row", async () => {
    const s = await getProfileStats(
      dbWith({
        user_stats: [{ xp_total: 5000, current_streak: 4, best_streak: 9, last_active_date: "2026-11-01" }],
        mascot_state: [{ stage: 3, variant: "bright" }],
      }),
    );
    expect(s).toMatchObject({ currentStreak: 4, bestStreak: 9, lastActiveDate: "2026-11-01" });
    expect(s.mascot).toEqual({ stage: 3, variant: "bright" });
  });

  it("normalizes an unknown stored mascot variant to normal", async () => {
    const s = await getProfileStats(dbWith({ mascot_state: [{ stage: 2, variant: "default" }] }));
    expect(s.mascot).toEqual({ stage: 2, variant: "normal" });
  });
});

describe("getAchievements", () => {
  const tables = (extra: Record<string, Row[]> = {}): Record<string, Row[]> => ({
    pillars: PILLARS,
    achievements: [
      { id: "a1", code: "streak_exercise_30", pillar_id: "p-ex", rule: { type: "streak", days: 30, pillar: "exercise" }, xp_reward: 0 },
      { id: "a2", code: "streak_global_100", pillar_id: null, rule: { type: "streak", days: 100 }, xp_reward: 5 },
      { id: "a3", code: "total_100", pillar_id: null, rule: { type: "total", count: 100 }, xp_reward: 0 },
    ],
    achievements_i18n: [
      { achievement_id: "a1", locale: "pt", name: "Corpo", description: "d-pt" },
      { achievement_id: "a1", locale: "en", name: "Body", description: "d-en" },
      { achievement_id: "a2", locale: "en", name: "Hundred", description: null },
      { achievement_id: "a3", locale: "pt", name: "Cem", description: "cem" },
    ],
    user_stats: [{ best_streak: 40 }],
    user_achievements: [],
    ...extra,
  });
  const byCode = (list: Awaited<ReturnType<typeof getAchievements>>) => Object.fromEntries(list.map((a) => [a.code, a]));

  it("localizes and falls back to the other locale, never an empty title", async () => {
    const pt = byCode(await getAchievements(dbWith(tables()), "pt"));
    expect(pt.streak_exercise_30).toMatchObject({ title: "Corpo", description: "d-pt", pillarSlug: "exercise" });
    expect(pt.streak_global_100).toMatchObject({ title: "Hundred", description: "", pillarSlug: null, xpReward: 5 });
    const en = byCode(await getAchievements(dbWith(tables()), "en"));
    expect(en.streak_exercise_30.title).toBe("Body");
    expect(en.total_100.title).toBe("Cem");
  });

  it("falls back to the code when no translation exists at all", async () => {
    const t = tables({ achievements_i18n: [] });
    const list = await getAchievements(dbWith(t), "pt");
    expect(list.every((a) => a.title === a.code)).toBe(true);
  });

  it("marks unlocked with date and no progress; locked have unlockedAt null", async () => {
    const list = byCode(
      await getAchievements(
        dbWith(tables({ user_achievements: [{ achievement_id: "a2", unlocked_at: "2026-11-02T10:00:00Z" }] })),
        "en",
      ),
    );
    expect(list.streak_global_100.unlockedAt).toBe("2026-11-02T10:00:00Z");
    expect(list.streak_global_100.progress).toBeNull();
    expect(list.total_100.unlockedAt).toBeNull();
  });

  it("derives progress only for global streak rules, from best_streak", async () => {
    const list = byCode(await getAchievements(dbWith(tables()), "en"));
    expect(list.streak_global_100.progress).toEqual({ current: 40, target: 100 });
    expect(list.streak_exercise_30.progress).toBeNull(); // pillar streak
    expect(list.total_100.progress).toBeNull();
  });

  it("clamps progress to the target and handles a missing stats row", async () => {
    const big = byCode(await getAchievements(dbWith(tables({ user_stats: [{ best_streak: 500 }] })), "en"));
    expect(big.streak_global_100.progress).toEqual({ current: 100, target: 100 });
    const none = byCode(await getAchievements(dbWith(tables({ user_stats: [] })), "en"));
    expect(none.streak_global_100.progress).toEqual({ current: 0, target: 100 });
  });
});
