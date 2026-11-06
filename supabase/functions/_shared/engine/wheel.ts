import { ENGINE_CONFIG } from "./config.ts";
import { dayNumber } from "./streaks.ts";
import type { Completion } from "./types.ts";

/**
 * Wheel of life (controller rulings):
 * 1. `habitsByPillar` lists ONLY active, non-deleted habit ids per pillar.
 *    Window = the ENGINE_CONFIG.wheelWindowDays days ending at `today`
 *    inclusive. Per (habit, day) the highest `progress` among duplicates is
 *    used, clamped to [0,1] (negative/NaN -> 0). Completions of unlisted
 *    habits, outside the window or after `today` are ignored.
 *    Score = 100 * sum(progress) / (habitCount * windowDays), NOT rounded.
 *    Pillars with an empty habit list are omitted.
 */
export function pillarScores(
  completions: Completion[],
  habitsByPillar: Record<string, string[]>,
  today: string,
): Record<string, number> {
  const windowDays = ENGINE_CONFIG.wheelWindowDays;
  const todayN = dayNumber(today);
  const firstN = todayN - windowDays + 1;

  const habitPillar = new Map<string, string>();
  for (const [pillar, habits] of Object.entries(habitsByPillar)) {
    for (const h of habits) habitPillar.set(h, pillar);
  }

  // key "habitId\u0000dayNumber" -> best clamped progress
  const best = new Map<string, number>();
  for (const comp of completions) {
    const pillar = habitPillar.get(comp.habitId);
    if (pillar === undefined) continue;
    const n = dayNumber(comp.date);
    if (n < firstN || n > todayN) continue;
    const p = Number.isNaN(comp.progress) ? 0 : Math.min(1, Math.max(0, comp.progress));
    const key = `${comp.habitId}\u0000${n}`;
    if (p > (best.get(key) ?? -1)) best.set(key, p);
  }

  const sums = new Map<string, number>();
  for (const [key, p] of best) {
    const pillar = habitPillar.get(key.slice(0, key.indexOf("\u0000")));
    if (pillar === undefined) continue;
    sums.set(pillar, (sums.get(pillar) ?? 0) + p);
  }

  const result: Record<string, number> = {};
  for (const [pillar, habits] of Object.entries(habitsByPillar)) {
    if (habits.length === 0) continue;
    result[pillar] = (100 * (sums.get(pillar) ?? 0)) / (habits.length * windowDays);
  }
  return result;
}

/**
 * Balance index: 1 - sigma / ENGINE_CONFIG.balanceStdDevDivisor, where sigma
 * is the POPULATION standard deviation of the scores, clamped to [0,1].
 * Empty input -> 0; a single pillar -> 1.
 */
export function balanceIndex(scores: Record<string, number>): number {
  const values = Object.values(scores);
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  const idx = 1 - Math.sqrt(variance) / ENGINE_CONFIG.balanceStdDevDivisor;
  return Math.min(1, Math.max(0, idx));
}
