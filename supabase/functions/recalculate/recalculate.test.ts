import { describe, expect, it } from "vitest";
import {
  computeUserState,
  recalculateUser,
  type Db,
  type HabitInput,
  type LoadedInputs,
  type LogInput,
  type UserState,
} from "./recalculate.ts";

const USER = "user-1";

type FakeData = {
  timezone: string;
  habits: HabitInput[];
  logs: LogInput[];
  achievements: { code: string; rule: unknown }[];
  stats: UserState["stats"] | null;
  mascot: UserState["mascot"] | null;
  pillarScores: Map<string, number>;
  userAchievements: Map<string, string>; // code -> unlockedAt
};

/**
 * In-memory Db with the same semantics as the Supabase adapter in index.ts:
 * stats/mascot upsert by user, pillar_scores replace set keyed by pillar,
 * user_achievements insert-only (on conflict do nothing).
 * `failAfterSteps` makes saveState apply that many steps, then throw once.
 */
class FakeDb implements Db {
  data: FakeData;
  failAfterSteps: number | null = null;
  saves = 0;

  constructor(init: Partial<FakeData> = {}) {
    this.data = {
      timezone: "UTC",
      habits: [],
      logs: [],
      achievements: [],
      stats: null,
      mascot: null,
      pillarScores: new Map(),
      userAchievements: new Map(),
      ...init,
    };
  }

  async loadInputs(userId: string): Promise<LoadedInputs> {
    expect(userId).toBe(USER);
    return structuredClone({
      timezone: this.data.timezone,
      habits: this.data.habits,
      logs: this.data.logs,
      achievements: this.data.achievements,
      unlockedCodes: [...this.data.userAchievements.keys()],
    });
  }

  async saveState(userId: string, state: UserState): Promise<void> {
    expect(userId).toBe(USER);
    this.saves += 1;
    const steps: (() => void)[] = [
      () => {
        this.data.stats = { ...state.stats };
      },
      () => {
        for (const [pillar, score] of Object.entries(state.pillarScores)) {
          this.data.pillarScores.set(pillar, score);
        }
      },
      () => {
        for (const pillar of [...this.data.pillarScores.keys()]) {
          if (!(pillar in state.pillarScores)) this.data.pillarScores.delete(pillar);
        }
      },
      () => {
        for (const a of state.newAchievements) {
          if (!this.data.userAchievements.has(a.code)) this.data.userAchievements.set(a.code, a.unlockedAt);
        }
      },
      () => {
        this.data.mascot = { ...state.mascot };
      },
    ];
    for (let i = 0; i < steps.length; i++) {
      if (this.failAfterSteps !== null && i >= this.failAfterSteps) {
        this.failAfterSteps = null;
        throw new Error("simulated saveState failure");
      }
      steps[i]();
    }
  }

  snapshot() {
    return {
      stats: this.data.stats,
      mascot: this.data.mascot,
      pillarScores: Object.fromEntries([...this.data.pillarScores].sort()),
      userAchievements: Object.fromEntries([...this.data.userAchievements].sort()),
    };
  }
}

function habit(id: string, pillar: string, extra: Partial<HabitInput> = {}): HabitInput {
  return {
    id,
    pillar,
    kind: "check",
    target: null,
    active: true,
    createdAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
    ...extra,
  };
}

function log(habitId: string, date: string, value = 1): LogInput {
  return { habitId, date, value };
}

const NOW = "2026-03-05T12:00:00Z"; // Thursday

describe("recalculateUser", () => {
  it("user with no habits -> zeroed stats, level 1, no other rows, no errors", async () => {
    const db = new FakeDb({
      achievements: [{ code: "total_100", rule: { type: "total", count: 100 } }],
    });
    await recalculateUser(db, USER, NOW);
    expect(db.data.stats).toEqual({
      xpTotal: 0,
      level: 1,
      currentStreak: 0,
      bestStreak: 0,
      lastActiveDate: null,
    });
    expect(db.data.pillarScores.size).toBe(0);
    expect(db.data.userAchievements.size).toBe(0);
    // decision: the mascot row is still written (stage 1, dim: balance of an empty wheel is 0)
    expect(db.data.mascot).toEqual({ stage: 1, variant: "dim" });
  });

  it("is idempotent: two runs give identical state and no duplicate rows", async () => {
    const db = new FakeDb({
      habits: [habit("h1", "exercise"), habit("h2", "reading", { kind: "value", target: 10 })],
      logs: [log("h1", "2026-03-03"), log("h1", "2026-03-04"), log("h2", "2026-03-04", 5)],
      achievements: [{ code: "total_2", rule: { type: "total", count: 2 } }],
    });
    await recalculateUser(db, USER, NOW);
    const first = db.snapshot();
    await recalculateUser(db, USER, NOW);
    expect(db.snapshot()).toEqual(first);
    expect(db.data.userAchievements.size).toBe(1);
    // Mar 3: h1 done of 2 alive habits -> 10; Mar 4: h1 10 + h2 5/10 -> 15, no bonus
    expect(first.stats?.xpTotal).toBe(25);
  });

  it("a value log with target 0 counts as progress 1", async () => {
    const db = new FakeDb({
      habits: [habit("h1", "meditation", { kind: "value", target: 0 })],
      logs: [log("h1", "2026-03-05", 3)],
    });
    await recalculateUser(db, USER, NOW);
    expect(db.data.stats?.xpTotal).toBe(30); // 10 + 20 day-complete bonus
    expect(db.data.stats?.currentStreak).toBe(1);
  });

  it("a value log with missing target counts as progress 1 when value > 0", () => {
    const state = computeUserState({
      now: NOW,
      timezone: "UTC",
      habits: [habit("h1", "meditation", { kind: "value", target: null })],
      logs: [log("h1", "2026-03-05", 2), log("h1", "2026-03-04", 0)],
      achievements: [],
      unlockedCodes: [],
    });
    expect(state.stats.xpTotal).toBe(30);
    expect(state.stats.lastActiveDate).toBe("2026-03-05");
  });

  it("XP for a full day of 3 habits = 30 + 20 = 50", async () => {
    const db = new FakeDb({
      habits: [habit("h1", "exercise"), habit("h2", "reading"), habit("h3", "family")],
      logs: [log("h1", "2026-03-05"), log("h2", "2026-03-05"), log("h3", "2026-03-05")],
    });
    await recalculateUser(db, USER, NOW);
    expect(db.data.stats?.xpTotal).toBe(50);
    expect(db.data.stats?.level).toBe(1);
  });

  it("fractional progress is rounded per day before summing", () => {
    // value habit target 3, logged 1 -> 3.333 XP per day; 2 days -> 3 + 3 = 6 (not round(6.67) = 7)
    const state = computeUserState({
      now: NOW,
      timezone: "UTC",
      habits: [habit("h1", "reading", { kind: "value", target: 3 })],
      logs: [log("h1", "2026-03-04", 1), log("h1", "2026-03-05", 1)],
      achievements: [],
      unlockedCodes: [],
    });
    expect(state.stats.xpTotal).toBe(6);
    // partial progress is not "done": no streak
    expect(state.stats.currentStreak).toBe(0);
    expect(state.stats.lastActiveDate).toBeNull();
  });

  it("an archived habit keeps its history in streaks and XP", async () => {
    const db = new FakeDb({
      habits: [
        habit("h1", "exercise", {
          createdAt: "2026-03-01T08:00:00Z",
          active: false,
          deletedAt: "2026-03-05T10:00:00Z",
        }),
      ],
      logs: [log("h1", "2026-03-02"), log("h1", "2026-03-03"), log("h1", "2026-03-04")],
    });
    await recalculateUser(db, USER, NOW);
    expect(db.data.stats).toEqual({
      xpTotal: 3 * 30, // each day h1 was the only alive habit -> 10 + 20
      level: 1,
      currentStreak: 3, // today (Thu) not done yet -> run Mon..Wed
      bestStreak: 3,
      lastActiveDate: "2026-03-04",
    });
    // current views only use active, non-deleted habits
    expect(db.data.pillarScores.size).toBe(0);
  });

  it("deactivating a habit later does not remove the day-complete bonus of past days", () => {
    const base = {
      now: NOW,
      timezone: "UTC",
      logs: [log("h1", "2026-03-04"), log("h2", "2026-03-04")],
      achievements: [],
      unlockedCodes: [],
    };
    const before = computeUserState({ ...base, habits: [habit("h1", "exercise"), habit("h2", "reading")] });
    const after = computeUserState({
      ...base,
      habits: [habit("h1", "exercise"), habit("h2", "reading", { active: false })],
    });
    expect(before.stats.xpTotal).toBe(40);
    expect(after.stats.xpTotal).toBe(40);
  });

  it("a backfilled log on a habit outside its lifetime earns per-habit XP but no day bonus", () => {
    const state = computeUserState({
      now: NOW,
      timezone: "UTC",
      habits: [habit("h1", "exercise", { createdAt: "2026-03-05T09:00:00Z" })],
      logs: [log("h1", "2026-03-04")],
      achievements: [],
      unlockedCodes: [],
    });
    expect(state.stats.xpTotal).toBe(10);
    expect(state.stats.currentStreak).toBe(1);
  });

  it("ignores logs dated after today", async () => {
    const db = new FakeDb({
      habits: [habit("h1", "exercise")],
      logs: [log("h1", "2026-03-05"), log("h1", "2026-03-06")],
    });
    await recalculateUser(db, USER, NOW);
    expect(db.data.stats).toEqual({
      xpTotal: 30,
      level: 1,
      currentStreak: 1,
      bestStreak: 1,
      lastActiveDate: "2026-03-05",
    });
  });

  it("computes today in a UTC-negative timezone", () => {
    // 01:30 UTC on Mar 10 is still Mar 9 in Sao Paulo (UTC-3)
    const state = computeUserState({
      now: "2026-03-10T01:30:00Z",
      timezone: "America/Sao_Paulo",
      habits: [habit("h1", "exercise")],
      logs: [log("h1", "2026-03-09"), log("h1", "2026-03-10")],
      achievements: [],
      unlockedCodes: [],
    });
    expect(state.stats.xpTotal).toBe(30); // the Mar 10 log is "tomorrow" there
    expect(state.stats.currentStreak).toBe(1);
    expect(state.stats.lastActiveDate).toBe("2026-03-09");
  });

  it("computes today in a UTC-positive timezone", () => {
    // 12:00 UTC on Mar 9 is already Mar 10 in Auckland (UTC+13)
    const state = computeUserState({
      now: "2026-03-09T12:00:00Z",
      timezone: "Pacific/Auckland",
      habits: [habit("h1", "exercise")],
      logs: [log("h1", "2026-03-10"), log("h1", "2026-03-11")],
      achievements: [],
      unlockedCodes: [],
    });
    expect(state.stats.xpTotal).toBe(30);
    expect(state.stats.lastActiveDate).toBe("2026-03-10");
    expect(state.stats.currentStreak).toBe(1);
  });

  it("habit lifetime uses the local date of created_at", () => {
    // created 2026-03-04T23:30-03:00 (= 02:30Z on Mar 5): alive on local Mar 4, so the bonus applies
    const state = computeUserState({
      now: "2026-03-05T12:00:00Z",
      timezone: "America/Sao_Paulo",
      habits: [habit("h1", "exercise", { createdAt: "2026-03-05T02:30:00Z" })],
      logs: [log("h1", "2026-03-04")],
      achievements: [],
      unlockedCodes: [],
    });
    expect(state.stats.xpTotal).toBe(30);
  });

  it("keeps an already unlocked achievement and its unlocked_at", async () => {
    const db = new FakeDb({
      habits: [habit("h1", "exercise")],
      logs: [log("h1", "2026-03-05")],
      achievements: [
        { code: "streak_exercise_30", rule: { type: "streak", days: 30, pillar: "exercise" } },
        { code: "total_1", rule: { type: "total", count: 1 } },
      ],
      userAchievements: new Map([["streak_exercise_30", "2025-01-01T00:00:00Z"]]),
    });
    await recalculateUser(db, USER, NOW);
    expect(db.snapshot().userAchievements).toEqual({
      streak_exercise_30: "2025-01-01T00:00:00Z",
      total_1: NOW,
    });
    // a second run keeps the first unlock time of total_1
    await recalculateUser(db, USER, "2026-03-06T12:00:00Z");
    expect(db.data.userAchievements.get("total_1")).toBe(NOW);
  });

  it("evaluates pillar-specific rules by pillar slug", () => {
    const state = computeUserState({
      now: NOW,
      timezone: "UTC",
      habits: [habit("h1", "meditation"), habit("h2", "reading")],
      logs: [log("h1", "2026-03-04"), log("h1", "2026-03-05")],
      achievements: [
        { code: "med_total_2", rule: { type: "total", count: 2, pillar: "meditation" } },
        { code: "read_total_1", rule: { type: "total", count: 1, pillar: "reading" } },
      ],
      unlockedCodes: [],
    });
    expect(state.newAchievements).toEqual([{ code: "med_total_2", unlockedAt: NOW }]);
  });

  it("does not crash on unknown future rule types or malformed rules", async () => {
    const db = new FakeDb({
      habits: [habit("h1", "exercise")],
      logs: [log("h1", "2026-03-05")],
      achievements: [
        { code: "future", rule: { type: "moon_phase", phase: "full" } },
        { code: "null_rule", rule: null },
        { code: "string_rule", rule: "streak" },
        { code: "total_1", rule: { type: "total", count: 1 } },
      ],
    });
    await expect(recalculateUser(db, USER, NOW)).resolves.toBeUndefined();
    expect([...db.data.userAchievements.keys()]).toEqual(["total_1"]);
  });

  it("writes pillar scores for current habits and removes stale pillars", async () => {
    const db = new FakeDb({
      habits: [habit("h1", "exercise"), habit("h2", "reading", { deletedAt: "2026-03-01T00:00:00Z", active: false })],
      logs: [log("h1", "2026-03-05")],
      pillarScores: new Map([
        ["reading", 80],
        ["family", 10],
      ]),
    });
    await recalculateUser(db, USER, NOW);
    expect(db.snapshot().pillarScores).toEqual({ exercise: 100 / 30 });
    // a single pillar -> balance 1 -> bright
    expect(db.data.mascot).toEqual({ stage: 1, variant: "bright" });
  });

  it("adds the weekly balance bonus using pillars alive that week", () => {
    // Week Mon 2026-02-23..Sun 2026-03-01: exercise and reading active on 4 days each.
    const days = ["2026-02-23", "2026-02-24", "2026-02-25", "2026-02-26"];
    const state = computeUserState({
      now: NOW,
      timezone: "UTC",
      habits: [
        habit("h1", "exercise"),
        habit("h2", "reading"),
        // family habit only created the following week: not part of that week's active pillars
        habit("h3", "family", { createdAt: "2026-03-03T00:00:00Z" }),
      ],
      logs: [...days.map((d) => log("h1", d)), ...days.map((d) => log("h2", d))],
      achievements: [],
      unlockedCodes: [],
    });
    expect(state.stats.xpTotal).toBe(4 * 40 + 30);
  });

  it("a failing saveState lets a retry converge to the correct state", async () => {
    const init = () => ({
      habits: [habit("h1", "exercise"), habit("h2", "reading")],
      logs: [log("h1", "2026-03-04"), log("h2", "2026-03-05")],
      achievements: [{ code: "total_2", rule: { type: "total", count: 2 } }],
      pillarScores: new Map([["family", 50]]),
    });
    const reference = new FakeDb(init());
    await recalculateUser(reference, USER, NOW);

    for (let failAt = 0; failAt < 5; failAt++) {
      const db = new FakeDb(init());
      db.failAfterSteps = failAt;
      await expect(recalculateUser(db, USER, NOW)).rejects.toThrow("simulated saveState failure");
      await recalculateUser(db, USER, NOW);
      expect(db.snapshot()).toEqual(reference.snapshot());
    }
  });
});
