import type { Db } from "@/lib/supabase/types";
import { ENGINE_CONFIG } from "../../../supabase/functions/_shared/engine/config.ts";
import { dayNumber } from "../../../supabase/functions/_shared/engine/streaks.ts";
import { throwIfError } from "./errors";

/** `habit_logs.source` written by every client tap (RLS only lets the client write this one). */
export const MANUAL_SOURCE = "manual";
/** `TodayHabit.source` when the habit has no log on that day (not a DB value). */
export const NO_LOG_SOURCE = "none";

export type HabitKind = "check" | "value";

export type TodayHabit = {
  id: string;
  title: string;
  kind: HabitKind;
  /** Check habits: 1. Value habits: the target, 0 when none is set. */
  target: number;
  /** That day's logged value, 0 when there is no log. */
  value: number;
  /** That day's log source ("manual", "strava", ...) or NO_LOG_SOURCE. */
  source: string;
};

export type TodayPillar = { pillarId: string; slug: string; habits: TodayHabit[] };
export type TodayData = { pillars: TodayPillar[] };

export type LogInput = { userHabitId: string; userId: string; date: string; value: number };

export type LogValidationCode = "invalid_date" | "future_date" | "outside_backfill" | "invalid_value";

/** A log the app must never send (permanent: retrying cannot make it valid). */
export class LogValidationError extends Error {
  constructor(
    readonly code: LogValidationCode,
    message: string,
  ) {
    super(message);
    this.name = "LogValidationError";
  }
}

type PillarRow = { id: string; slug: string; sort: number };
type HabitRow = {
  id: string;
  pillar_id: string;
  title: string;
  kind: HabitKind;
  target: number | string | null;
  created_at: string;
};
type LogRow = { user_habit_id: string; value: number | string; source: string };

function dayOf(date: string, label: string): number {
  try {
    return dayNumber(date);
  } catch {
    throw new LogValidationError("invalid_date", `Invalid ${label}: "${date}" (expected YYYY-MM-DD)`);
  }
}

/** numeric columns may arrive as strings; anything non-finite becomes `fallback`. */
function num(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

/**
 * The caller's active habits (active and not soft-deleted) grouped by pillar, with
 * `date`'s log values. RLS scopes every table to the caller. Logs of habits that are
 * not listed (archived, paused) are never returned.
 */
export async function getToday(db: Db, date: string): Promise<TodayData> {
  dayOf(date, "date");
  const [pillarsRes, habitsRes, logsRes] = await Promise.all([
    db.from("pillars").select("id, slug, sort").order("sort"),
    db
      .from("user_habits")
      .select("id, pillar_id, title, kind, target, created_at")
      .eq("active", true)
      .is("deleted_at", null)
      .order("created_at"),
    db.from("habit_logs").select("user_habit_id, value, source").eq("date", date),
  ]);
  throwIfError(pillarsRes.error, "load pillars", pillarsRes.status);
  throwIfError(habitsRes.error, "load habits", habitsRes.status);
  throwIfError(logsRes.error, "load habit logs", logsRes.status);

  const logByHabit = new Map(((logsRes.data ?? []) as LogRow[]).map((l) => [l.user_habit_id, l]));
  const habits = [...((habitsRes.data ?? []) as HabitRow[])].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  const toHabit = (h: HabitRow): TodayHabit => {
    const log = logByHabit.get(h.id);
    return {
      id: h.id,
      title: h.title,
      kind: h.kind,
      target: h.kind === "check" ? 1 : Math.max(0, num(h.target, 0)),
      value: log ? Math.max(0, num(log.value, 0)) : 0,
      source: log?.source ?? NO_LOG_SOURCE,
    };
  };

  const pillars = [...((pillarsRes.data ?? []) as PillarRow[])]
    .sort((a, b) => a.sort - b.sort)
    .map((p) => ({ pillarId: p.id, slug: p.slug, habits: habits.filter((h) => h.pillar_id === p.id).map(toHabit) }))
    .filter((p) => p.habits.length > 0);
  return { pillars };
}

/** Throws LogValidationError unless `date` is within [today - backfillDays, today] and `value` >= 0. */
export function validateLog(input: Pick<LogInput, "date" | "value">, today: string): void {
  const todayN = dayOf(today, "today");
  const dateN = dayOf(input.date, "date");
  if (dateN > todayN) throw new LogValidationError("future_date", `Cannot log a future date: ${input.date}`);
  if (todayN - dateN > ENGINE_CONFIG.backfillDays) {
    throw new LogValidationError(
      "outside_backfill",
      `Cannot log ${input.date}: more than ${ENGINE_CONFIG.backfillDays} days before ${today}`,
    );
  }
  if (typeof input.value !== "number" || !Number.isFinite(input.value) || input.value < 0) {
    throw new LogValidationError("invalid_value", `Invalid value: ${String(input.value)}`);
  }
}

/**
 * Writes one manual log: upsert on (user_habit_id, date), so a habit has one row per
 * day and the last write wins. `source: "manual"` is sent explicitly so a tap turns a
 * provider-filled row into a manual one (ruling M; RLS rejects any other source).
 * Un-ticking is `value: 0` through the same upsert (the client has no DELETE).
 * Does not trigger a recalculation: the caller schedules it (see recalc.ts).
 */
export async function logHabit(db: Db, input: LogInput, today: string): Promise<void> {
  validateLog(input, today);
  const { error, status } = await db.from("habit_logs").upsert(
    {
      user_habit_id: input.userHabitId,
      user_id: input.userId,
      date: input.date,
      value: input.value,
      source: MANUAL_SOURCE,
    },
    { onConflict: "user_habit_id,date" },
  );
  throwIfError(error, "save habit log", status);
}

export type HeaderStats = { xpTotal: number; level: number; currentStreak: number };
export const DEFAULT_HEADER_STATS: HeaderStats = { xpTotal: 0, level: 1, currentStreak: 0 };

/** The caller's XP, level and streak (RLS returns only their row); defaults before the first recalculation. */
export async function getHeaderStats(db: Db): Promise<HeaderStats> {
  const { data, error, status } = await db.from("user_stats").select("xp_total, level, current_streak");
  throwIfError(error, "load stats", status);
  const row = ((data ?? []) as { xp_total: unknown; level: unknown; current_streak: unknown }[])[0];
  if (!row) return { ...DEFAULT_HEADER_STATS };
  return {
    xpTotal: num(row.xp_total, DEFAULT_HEADER_STATS.xpTotal),
    level: num(row.level, DEFAULT_HEADER_STATS.level),
    currentStreak: num(row.current_streak, DEFAULT_HEADER_STATS.currentStreak),
  };
}
