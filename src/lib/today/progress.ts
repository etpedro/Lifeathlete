import { MANUAL_SOURCE, NO_LOG_SOURCE, type LogInput, type TodayData, type TodayHabit } from "@/lib/data/today";

type ProgressHabit = Pick<TodayHabit, "kind" | "target" | "value">;

/**
 * Same ruling as the engine (recalculate.ts `progressOf`): check -> 1 when value > 0;
 * value -> value / target, and a missing/0 target counts as 1 when value > 0.
 * Unclamped (can exceed 1); never NaN or Infinity.
 */
export function habitProgress(h: ProgressHabit): number {
  if (!(Number.isFinite(h.value) && h.value > 0)) return 0;
  if (h.kind === "check") return 1;
  if (!(Number.isFinite(h.target) && h.target > 0)) return 1;
  return h.value / h.target;
}

export function isComplete(h: ProgressHabit): boolean {
  return habitProgress(h) >= 1;
}

/** Progress as an integer percentage clamped to 0..100 (safe for widths and labels). */
export function progressPercent(h: ProgressHabit): number {
  return Math.round(Math.min(1, habitProgress(h)) * 100);
}

/** Habits still missing for "day complete". */
export function remainingCount(data: TodayData): number {
  return data.pillars.reduce((n, p) => n + p.habits.filter((h) => !isComplete(h)).length, 0);
}

/** Optimistic update: a copy of `data` with `habitId` set to `value` as a manual log. */
export function applyValue(data: TodayData, habitId: string, value: number): TodayData {
  return {
    pillars: data.pillars.map((p) =>
      p.habits.some((h) => h.id === habitId)
        ? { ...p, habits: p.habits.map((h) => (h.id === habitId ? { ...h, value, source: MANUAL_SOURCE } : h)) }
        : p,
    ),
  };
}

/** Step of the value picker's -/+ buttons, scaled to the target. */
export function valueStep(target: number): number {
  if (!(target > 10)) return 1;
  if (target <= 100) return 5;
  if (target <= 1000) return 50;
  return 500;
}

/**
 * Shows check-ins still waiting in the offline queue on top of the server data for `date`.
 * Returns the ids of habits shown with a pending (not yet synced) value.
 */
export function overlayQueued(
  data: TodayData,
  queued: readonly Pick<LogInput, "userHabitId" | "date" | "value">[],
  date: string,
): { data: TodayData; pendingIds: Set<string> } {
  const shown = new Set(data.pillars.flatMap((p) => p.habits.map((h) => h.id)));
  const pendingIds = new Set<string>();
  let out = data;
  for (const q of queued) {
    if (q.date !== date || !shown.has(q.userHabitId)) continue;
    out = applyValue(out, q.userHabitId, q.value);
    pendingIds.add(q.userHabitId);
  }
  return { data: out, pendingIds };
}

/** `data`'s pillars and habits with every value reset to 0 and no log source. */
export function blankDay(data: TodayData): TodayData {
  return {
    pillars: data.pillars.map((p) => ({
      ...p,
      habits: p.habits.map((h) => ({ ...h, value: 0, source: NO_LOG_SOURCE })),
    })),
  };
}

/** How many loaded days the Today screen remembers (today, a few days back, a day ahead of a stale clock). */
const REMEMBERED_DAYS = 5;

/** `loaded` plus `date`'s data, keeping only the newest {@link REMEMBERED_DAYS} days (input not mutated). */
export function rememberLoaded(
  loaded: Readonly<Record<string, TodayData>>,
  date: string,
  data: TodayData,
): Record<string, TodayData> {
  const dates = Object.keys({ ...loaded, [date]: data }).sort().slice(-REMEMBERED_DAYS);
  return Object.fromEntries(dates.map((d) => [d, d === date ? data : loaded[d]]));
}

/**
 * What to show when `date` could not be loaded (offline the next morning, a failed reload, or
 * "yesterday" offline):
 * - a day that loaded earlier in this session keeps its REAL values (a done habit must never
 *   look undone, and a value picker must start from the real value — otherwise confirming it
 *   would queue a lower absolute value that last-write-wins then writes over the real one),
 *   with that date's queued values on top (`valuesKnown: true`);
 * - a day that never loaded shows the newest loaded day's habits blank, flagged
 *   `valuesKnown: false` so the UI can warn that already logged values are unavailable;
 * - null when no day was ever loaded (the load error is shown instead).
 * Taps keep working and are queued in every case.
 */
export function fallbackDay(
  loaded: Readonly<Record<string, TodayData>>,
  queued: readonly Pick<LogInput, "userHabitId" | "date" | "value">[],
  date: string,
): { data: TodayData; pendingIds: Set<string>; valuesKnown: boolean } | null {
  const known = loaded[date];
  if (known) return { ...overlayQueued(known, queued, date), valuesKnown: true };
  const newest = Object.keys(loaded).sort().at(-1);
  if (newest === undefined) return null;
  return { ...overlayQueued(blankDay(loaded[newest]), queued, date), valuesKnown: false };
}
