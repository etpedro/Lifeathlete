import { ENGINE_CONFIG } from "../../../supabase/functions/_shared/engine/config.ts";
import { localDate } from "../../../supabase/functions/_shared/engine/dates.ts";
import { dayNumber } from "../../../supabase/functions/_shared/engine/streaks.ts";

const DAY_MS = 86_400_000;

/**
 * The user's local calendar date "now" (YYYY-MM-DD), via the engine's localDate.
 * An invalid profile timezone falls back to UTC (same rule as the recalculate function).
 */
export function todayIn(timezone: string, now: Date = new Date()): string {
  const instant = now.toISOString();
  try {
    return localDate(instant, timezone);
  } catch {
    return localDate(instant, "UTC");
  }
}

/** `date` moved by `days` whole calendar days (pure date arithmetic, no timezone). */
export function shiftDate(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** The days the user may fill in: today and up to ENGINE_CONFIG.backfillDays before, newest first. */
export function backfillDates(today: string): { date: string; daysAgo: number }[] {
  return Array.from({ length: ENGINE_CONFIG.backfillDays + 1 }, (_, daysAgo) => ({
    date: shiftDate(today, -daysAgo),
    daysAgo,
  }));
}
