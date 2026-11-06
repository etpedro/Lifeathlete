import { ENGINE_CONFIG } from "./config.ts";
import type { Completion } from "./types.ts";

function clamp01(p: number): number {
  if (!Number.isFinite(p) || p <= 0) return 0;
  return p >= 1 ? 1 : p;
}

/** XP for one day: per-habit proportional XP plus a bonus when every active habit is complete. */
export function dayXp(dayCompletions: Completion[], activeHabitCount: number): number {
  if (activeHabitCount <= 0) return 0;
  const best = new Map<string, number>();
  for (const c of dayCompletions) {
    const p = clamp01(c.progress);
    const prev = best.get(c.habitId);
    if (prev === undefined || p > prev) best.set(c.habitId, p);
  }
  let xp = 0;
  let complete = 0;
  for (const p of best.values()) {
    xp += p * ENGINE_CONFIG.xpPerHabit;
    if (p >= 1) complete += 1;
  }
  if (complete >= activeHabitCount) xp += ENGINE_CONFIG.dayCompleteBonus;
  return xp;
}

/** Weekly bonus when every active pillar had activity (progress > 0) on enough distinct days. */
export function weeklyBalanceBonus(
  weekCompletions: Completion[],
  activePillarIds: string[],
): number {
  if (activePillarIds.length === 0) return 0;
  const daysByPillar = new Map<string, Set<string>>();
  for (const c of weekCompletions) {
    if (!(c.progress > 0)) continue;
    let set = daysByPillar.get(c.pillarId);
    if (!set) daysByPillar.set(c.pillarId, (set = new Set()));
    set.add(c.date);
  }
  const balanced = activePillarIds.every(
    (id) => (daysByPillar.get(id)?.size ?? 0) >= ENGINE_CONFIG.balanceMinDays,
  );
  return balanced ? ENGINE_CONFIG.weeklyBalanceBonus : 0;
}
