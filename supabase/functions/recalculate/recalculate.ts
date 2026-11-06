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
  /**
   * Pause intervals (user_habits.pauses, migration 0008): local dates, `from` inclusive,
   * `to` = the resume day (exclusive) or null while still paused. Absent = none.
   */
  pauses?: PauseInterval[];
};

export type PauseInterval = { from: string; to: string | null };

export type LogInput = {
  habitId: string;
  /** Local calendar date (YYYY-MM-DD) in the user's timezone. */
  date: string;
  value: number;
  /**
   * The habit's target when the log was written (habit_logs.target, migration 0007).
   * Null/absent for provider and legacy rows: the habit's current target is used then.
   */
  target?: number | null;
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
  /** The user's local day this state was computed for (user_stats.computed_for, 0010). */
  computedFor: string;
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

const validTarget = (t: number | null | undefined): t is number =>
  typeof t === "number" && Number.isFinite(t) && t > 0;

/**
 * Progress ruling: check habit -> 1 when value > 0, else 0. Value habit ->
 * value / target, where target is the log's own snapshot (the target when it was
 * logged, so changing a habit's target never rewrites past days) and falls back to
 * the habit's current target when the log has none; a target of 0, negative or
 * missing counts as 1 when value > 0 (never divide by zero).
 */
function progressOf(habit: HabitInput, log: LogInput): number {
  if (!(log.value > 0)) return 0;
  if (habit.kind === "check") return 1;
  const target = validTarget(log.target) ? log.target : habit.target;
  if (!validTarget(target)) return 1;
  return log.value / target;
}

function dayOrNull(date: unknown): number | null {
  if (typeof date !== "string") return null;
  try {
    return dayNumber(date);
  } catch {
    return null;
  }
}

/**
 * A habit's paused days as day-number ranges [from, to). Malformed entries are ignored.
 * A habit that is paused (active false, not deleted) without an open interval was paused
 * before intervals existed: it counts as paused from today on (past days unchanged).
 */
function pausedRanges(h: HabitInput, todayN: number): [number, number][] {
  const ranges: [number, number][] = [];
  let open = false;
  for (const p of Array.isArray(h.pauses) ? h.pauses : []) {
    if (typeof p !== "object" || p === null) continue;
    const from = dayOrNull(p.from);
    if (from === null) continue;
    const to = p.to === null ? Infinity : dayOrNull(p.to);
    if (to === null) continue;
    if (to === Infinity) open = true;
    ranges.push([from, to]);
  }
  if (!h.active && h.deletedAt === null && !open) ranges.push([todayN, Infinity]);
  return ranges;
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
  // F2: a habit is not alive on its paused days (pause intervals [from, to)), so a paused
  // habit neither blocks the day-complete bonus nor makes its pillar required that week.
  type Entry = { habit: HabitInput; from: number; until: number; paused: [number, number][] };
  const habits = new Map<string, Entry>();
  for (const h of input.habits) {
    const from = dayNumber(safeLocalDate(h.createdAt, timezone));
    const until = h.deletedAt === null ? Infinity : dayNumber(safeLocalDate(h.deletedAt, timezone));
    habits.set(h.id, { habit: h, from, until, paused: pausedRanges(h, todayN) });
  }
  const isAlive = (e: Entry, day: number) =>
    e.from <= day && day < e.until && !e.paused.some(([a, b]) => a <= day && day < b);
  const aliveOn = (day: number) => [...habits.values()].filter((e) => isAlive(e, day));

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
      progress: progressOf(entry.habit, l),
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
  // Pauses come from the habit's pause intervals (the `active` flag alone has no history).
  let xpTotal = 0;
  for (const [date, dayCompletions] of byDate) {
    const day = dayNumber(date);
    const aliveIds = new Set(aliveOn(day).map((e) => e.habit.id));
    const alive = dayCompletions.filter((c) => aliveIds.has(c.habitId));
    const outside = dayCompletions.filter((c) => !aliveIds.has(c.habitId));
    xpTotal += Math.round(dayXp(alive, aliveIds.size) + dayXp(outside, Number.POSITIVE_INFINITY));
  }

  // Weekly balance bonus: per ISO week, the active pillars are those with at least
  // one habit alive (in its lifetime and not paused) on some day of that week.
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
      for (let day = weekStart; day <= weekEnd; day++) {
        if (isAlive(e, day)) {
          pillars.add(e.habit.pillar);
          break;
        }
      }
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
    computedFor: today,
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
