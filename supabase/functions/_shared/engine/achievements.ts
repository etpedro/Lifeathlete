import { computeStreak, dayNumber, isoWeekStart } from "./streaks.ts";
import type { Completion } from "./types.ts";

export type AchievementRule =
  | { type: "streak"; days: number; pillar?: string }
  | { type: "total"; count: number; pillar?: string }
  | { type: "balance"; pillars: number };

/**
 * Achievement rules (controller rulings):
 * - A completion is "done" when progress >= 1; achievements use done ones.
 * - streak: unlocked when computeStreak(distinct done dates, restricted to
 *   rule.pillar if given, today).best >= rule.days.
 * - total: count of distinct done (habitId, date) pairs (restricted to
 *   rule.pillar if given) >= rule.count.
 * - balance: unlocked when, in any single ISO week (Mon-Sun) up to `today`,
 *   at least rule.pillars distinct pillars (only those in activePillars)
 *   each have a completion with progress > 0, AND
 *   activePillars.length >= rule.pillars.
 * - A pillar-specific rule for a pillar not in activePillars can still
 *   unlock from history.
 * - Unknown rule types are ignored (forward compatible), never throw.
 * - Codes are returned in input order, without duplicates.
 * - days/count/pillars <= 0 (or non-finite) never unlock.
 */
export function evaluateAchievements(
  rules: { code: string; rule: AchievementRule }[],
  state: { completions: Completion[]; today: string; activePillars: string[] },
): string[] {
  const todayN = dayNumber(state.today);
  const past = state.completions.filter((c) => dayNumber(c.date) <= todayN);
  const done = past.filter((c) => c.progress >= 1);
  const active = new Set(state.activePillars);

  const out: string[] = [];
  const seen = new Set<string>();

  for (const { code, rule } of rules) {
    if (seen.has(code)) continue;
    let unlocked = false;
    const r = rule as { type?: unknown; days?: number; count?: number; pillars?: number; pillar?: string };
    if (r.type === "streak") {
      const days = r.days as number;
      if (Number.isFinite(days) && days > 0) {
        const dates = new Set<string>();
        for (const c of done) if (r.pillar === undefined || c.pillarId === r.pillar) dates.add(c.date);
        unlocked = computeStreak([...dates], state.today).best >= days;
      }
    } else if (r.type === "total") {
      const count = r.count as number;
      if (Number.isFinite(count) && count > 0) {
        const pairs = new Set<string>();
        for (const c of done) {
          if (r.pillar === undefined || c.pillarId === r.pillar) pairs.add(`${c.habitId}\u0000${c.date}`);
        }
        unlocked = pairs.size >= count;
      }
    } else if (r.type === "balance") {
      const need = r.pillars as number;
      if (Number.isFinite(need) && need > 0 && state.activePillars.length >= need) {
        const byWeek = new Map<number, Set<string>>();
        for (const c of past) {
          if (!(c.progress > 0) || !active.has(c.pillarId)) continue;
          const week = isoWeekStart(dayNumber(c.date));
          let set = byWeek.get(week);
          if (!set) byWeek.set(week, (set = new Set()));
          set.add(c.pillarId);
        }
        for (const set of byWeek.values()) {
          if (set.size >= need) {
            unlocked = true;
            break;
          }
        }
      }
    }
    if (unlocked) {
      seen.add(code);
      out.push(code);
    }
  }
  return out;
}
