import type { HeaderStats } from "@/lib/data/today";

export type StatsFeedback = {
  /** XP gained (> 0) since the previous read, or null: drives the "+N XP" toast. */
  xpGained: number | null;
  /** The new level when it went up, else null. */
  levelUp: number | null;
  /** The new current streak when it grew, else null. */
  streak: number | null;
};

const grew = (before: number, after: number) => Number.isFinite(before) && Number.isFinite(after) && after > before;

/** What to celebrate after a recalculation; only numbers that actually changed upwards. */
export function statsFeedback(before: HeaderStats, after: HeaderStats): StatsFeedback {
  return {
    xpGained: grew(before.xpTotal, after.xpTotal) ? after.xpTotal - before.xpTotal : null,
    levelUp: grew(before.level, after.level) ? after.level : null,
    streak: grew(before.currentStreak, after.currentStreak) ? after.currentStreak : null,
  };
}

export const hasFeedback = (f: StatsFeedback) => f.xpGained !== null || f.levelUp !== null || f.streak !== null;
