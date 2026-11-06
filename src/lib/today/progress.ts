import { MANUAL_SOURCE, type LogInput, type TodayData, type TodayHabit } from "@/lib/data/today";

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
