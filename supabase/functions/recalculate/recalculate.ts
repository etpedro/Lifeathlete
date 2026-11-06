// Rebuilds a user's derived gamification state (user_stats, pillar_scores,
// user_achievements, mascot_state) from habit_logs. Runtime-agnostic: no Deno/Node
// globals, relative imports with explicit .ts extensions, so it runs under Vitest
// and in the Deno Edge Function (index.ts) alike.
import { evaluateAchievements, type AchievementRule } from "../_shared/engine/achievements.ts";
import { localDate } from "../_shared/engine/dates.ts";
import { levelFromXp } from "../_shared/engine/levels.ts";
import { mascotState } from "../_shared/engine/mascot.ts";
import { computeStreak, dayNumber, isoWeekStart } from "../_shared/engine/streaks.ts";
import type { Completion } from "../_shared/engine/types.ts";
import { balanceIndex, pillarScores } from "../_shared/engine/wheel.ts";
import { dayXp, weeklyBalanceBonus } from "../_shared/engine/xp.ts";

/**
 * A user habit as loaded by the Db adapter.
 * Ruling L: `pillar` is the pillar SLUG (e.g. "meditation"); the adapter maps
 * pillar uuid <-> slug, so the engine only ever sees slugs.
 */
export type HabitInput = {
  id: string;
  pillar: string;
  kind: "check" | "value";
  target: number | null;
  active: boolean;
  /** ISO instant (timestamptz). */
  createdAt: string;
  /** ISO instant (timestamptz) of the soft delete, or null. */
  deletedAt: string | null;
};

export type LogInput = {
  habitId: string;
  /** Local calendar date (YYYY-MM-DD) in the user's timezone. */
  date: string;
  value: number;
};

/** Everything the Db loads for one user. */
export type LoadedInputs = {
  /** profiles.timezone (IANA), "UTC" when the profile is missing. */
  timezone: string;
  habits: HabitInput[];
  logs: LogInput[];
  /** Achievement catalog; `rule` is raw JSON (pillar given as slug, ruling L). */
  achievements: { code: string; rule: unknown }[];
  /** Codes already present in user_achievements. */
  unlockedCodes: string[];
};

export type RecalcInput = LoadedInputs & {
  /** ISO instant of "now"; the pure core never reads the clock. */
  now: string;
};

export type UserState = {
  stats: {
    xpTotal: number;
    level: number;
    currentStreak: number;
    bestStreak: number;
    lastActiveDate: string | null;
  };
  /** Pillar slug -> score (0..100) for pillars with current habits; the full set (replace). */
  pillarScores: Record<string, number>;
  /** Achievements to INSERT (never update/delete existing rows). */
  newAchievements: { code: string; unlockedAt: string }[];
  mascot: { stage: number; variant: string };
};

/**
 * Narrow persistence interface implemented by the Supabase adapter (index.ts)
 * and by the in-memory fake in the tests. saveState MUST be idempotent:
 * - user_stats and mascot_state: upsert by user;
 * - pillar_scores: upsert by (user, pillar) for every key, then delete the
 *   user's rows for pillars not in the set;
 * - user_achievements: insert on conflict (user, achievement) do nothing.
 */
export interface Db {
  loadInputs(userId: string): Promise<LoadedInputs>;
  saveState(userId: string, state: UserState): Promise<void>;
}

/**
 * Progress ruling: check habit -> 1 when value > 0, else 0. Value habit ->
 * value / target; a target of 0, negative or missing counts as 1 when value > 0
 * (never divide by zero).
 */
function progressOf(habit: HabitInput, value: number): number {
  if (!(value > 0)) return 0;
  if (habit.kind === "check") return 1;
  const target = habit.target;
  if (target === null || !Number.isFinite(target) || target <= 0) return 1;
  return value / target;
}

function safeLocalDate(instant: string, timezone: string): string {
  try {
    return localDate(instant, timezone);
  } catch {
    // An invalid profile timezone must not block stats forever: fall back to UTC.
    return localDate(instant, "UTC");
  }
}

function isRuleObject(rule: unknown): rule is AchievementRule {
  return typeof rule === "object" && rule !== null && !Array.isArray(rule);
}

/** Pure core: derive the whole user state from the loaded inputs and `now`. */
export function computeUserState(input: RecalcInput): UserState {
  const { timezone } = input;
  const today = safeLocalDate(input.now, timezone);
  const todayN = dayNumber(today);

  // Ruling J: habit lifetime = [local date of created_at, local date of deleted_at) as day numbers.
  const habits = new Map<string, { habit: HabitInput; from: number; until: number }>();
  for (const h of input.habits) {
    const from = dayNumber(safeLocalDate(h.createdAt, timezone));
    const until = h.deletedAt === null ? Infinity : dayNumber(safeLocalDate(h.deletedAt, timezone));
    habits.set(h.id, { habit: h, from, until });
  }
  const aliveOn = (day: number) =>
    [...habits.values()].filter((e) => e.from <= day && day < e.until);

  // Completions keyed by pillar SLUG (ruling L). Logs after today are ignored everywhere (ruling G).
  const completions: Completion[] = [];
  for (const l of input.logs) {
    const entry = habits.get(l.habitId);
    if (!entry) continue;
    if (dayNumber(l.date) > todayN) continue;
    completions.push({
      habitId: l.habitId,
      pillarId: entry.habit.pillar,
      date: l.date,
      progress: progressOf(entry.habit, l.value),
    });
  }

  const byDate = new Map<string, Completion[]>();
  for (const c of completions) {
    let list = byDate.get(c.date);
    if (!list) byDate.set(c.date, (list = []));
    list.push(c);
  }

  // XP per day (ruling G + J): habits alive that day define activeHabitCount and are the
  // only ones that can complete the day; logs on habits outside their lifetime (backfill)
  // still earn per-habit XP (dayXp with an unreachable count yields per-habit XP only).
  // The `active` flag has no history and is ignored for past days.
  let xpTotal = 0;
  for (const [date, dayCompletions] of byDate) {
    const day = dayNumber(date);
    const aliveIds = new Set(aliveOn(day).map((e) => e.habit.id));
    const alive = dayCompletions.filter((c) => aliveIds.has(c.habitId));
    const outside = dayCompletions.filter((c) => !aliveIds.has(c.habitId));
    xpTotal += Math.round(dayXp(alive, aliveIds.size) + dayXp(outside, Number.POSITIVE_INFINITY));
  }

  // Weekly balance bonus: per ISO week, the active pillars are those with at least
  // one habit alive on some day of that week.
  const byWeek = new Map<number, Completion[]>();
  for (const c of completions) {
    const week = isoWeekStart(dayNumber(c.date));
    let list = byWeek.get(week);
    if (!list) byWeek.set(week, (list = []));
    list.push(c);
  }
  for (const [weekStart, weekCompletions] of byWeek) {
    const weekEnd = weekStart + 6;
    const pillars = new Set<string>();
    for (const e of habits.values()) {
      if (e.from <= weekEnd && weekStart < e.until) pillars.add(e.habit.pillar);
    }
    xpTotal += weeklyBalanceBonus(weekCompletions, [...pillars]);
  }

  // Global streak: done (progress >= 1) dates across ALL habits, archived included.
  const doneDates = [...new Set(completions.filter((c) => c.progress >= 1).map((c) => c.date))];
  const streak = computeStreak(doneDates, today);
  const lastActiveDate = doneDates.length === 0 ? null : doneDates.reduce((a, b) => (a > b ? a : b));

  // Current views: only habits with active = true and deleted_at null.
  const habitsByPillar: Record<string, string[]> = {};
  for (const h of input.habits) {
    if (!h.active || h.deletedAt !== null) continue;
    (habitsByPillar[h.pillar] ??= []).push(h.id);
  }
  const scores = pillarScores(completions, habitsByPillar, today);
  const activePillars = Object.keys(habitsByPillar);

  // Achievements: insert-only for codes not yet unlocked; malformed rule JSON is skipped,
  // unknown rule types are ignored by the engine (forward compatible).
  const rules = input.achievements
    .filter((a) => isRuleObject(a.rule))
    .map((a) => ({ code: a.code, rule: a.rule as AchievementRule }));
  const unlocked = new Set(input.unlockedCodes);
  const newAchievements = evaluateAchievements(rules, { completions, today, activePillars })
    .filter((code) => !unlocked.has(code))
    .map((code) => ({ code, unlockedAt: input.now }));

  const level = levelFromXp(xpTotal).level;
  return {
    stats: {
      xpTotal,
      level,
      currentStreak: streak.current,
      bestStreak: streak.best,
      lastActiveDate,
    },
    pillarScores: scores,
    newAchievements,
    mascot: mascotState(level, balanceIndex(scores)),
  };
}

/**
 * Load, compute, persist. `now` (ISO instant) is injectable for tests; the Edge
 * Function passes the request time. Idempotent: a retry after a failed or
 * partially applied save converges to the same final state.
 */
export async function recalculateUser(db: Db, userId: string, now?: string): Promise<void> {
  const inputs = await db.loadInputs(userId);
  const state = computeUserState({ ...inputs, now: now ?? new Date().toISOString() });
  await db.saveState(userId, state);
}
