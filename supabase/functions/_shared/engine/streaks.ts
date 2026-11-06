import { ENGINE_CONFIG } from "./config.ts";

const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** YYYY-MM-DD -> integer day number since 1970-01-01 (UTC arithmetic only). */
export function dayNumber(date: string): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid date: "${date}" (expected YYYY-MM-DD)`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    throw new Error(`Invalid date: "${date}" (does not exist)`);
  }
  return ms / DAY_MS;
}

/** Day number of the Monday of the ISO week containing `day` (1970-01-01 was a Thursday). */
export function isoWeekStart(day: number): number {
  const weekdayFromMonday = (((day + 3) % 7) + 7) % 7;
  return day - weekdayFromMonday;
}

/**
 * Streak rules (controller rulings):
 * 1. A day is active if its date is in activeDates; duplicates count once;
 *    dates after `today` are ignored.
 * 2. `current` counts ACTIVE days only; a forgiven missed day neither adds
 *    to the count nor breaks the run.
 * 3. At most ENGINE_CONFIG.freezePerWeek missed days are forgiven per ISO
 *    week (Mon-Sun); a further missed day in that week ends the run.
 * 4. An inactive `today` is not a miss (day still in progress): evaluation
 *    then starts from yesterday.
 * 5. Days before the first ever active date are never misses; the walk
 *    stops at the earliest active date.
 * 6. `best` is the largest run over the whole history, using the same
 *    backward walk from every active day, and is always >= current.
 */
export function computeStreak(
  activeDates: string[],
  today: string,
): { current: number; best: number } {
  const todayN = dayNumber(today);
  const active = new Set<number>();
  for (const d of activeDates) {
    const n = dayNumber(d);
    if (n <= todayN) active.add(n);
  }
  if (active.size === 0) return { current: 0, best: 0 };

  let first = Infinity;
  for (const n of active) if (n < first) first = n;

  /** Active days in the run that ends at `end`, walking backwards. */
  const runFrom = (end: number): number => {
    const freezeUsed = new Map<number, number>();
    let count = 0;
    for (let d = end; d >= first; d--) {
      if (active.has(d)) {
        count += 1;
        continue;
      }
      const week = isoWeekStart(d);
      const used = freezeUsed.get(week) ?? 0;
      if (used >= ENGINE_CONFIG.freezePerWeek) break;
      freezeUsed.set(week, used + 1);
    }
    return count;
  };

  const current = runFrom(active.has(todayN) ? todayN : todayN - 1);
  let best = current;
  for (const n of active) {
    const r = runFrom(n);
    if (r > best) best = r;
  }
  return { current, best };
}
