/** XP needed to go from level n to level n+1. */
export function xpForLevel(n: number): number {
  return Math.round(100 * Math.pow(n, 1.5));
}

function tierForLevel(level: number): 1 | 2 | 3 | 4 | 5 {
  if (level <= 5) return 1;
  if (level <= 10) return 2;
  if (level <= 15) return 3;
  if (level <= 20) return 4;
  return 5;
}

/** Level derived from cumulative XP. */
export function levelFromXp(xp: number): {
  level: number;
  tier: 1 | 2 | 3 | 4 | 5;
  xpIntoLevel: number;
  xpForNext: number;
} {
  let remaining = Number.isFinite(xp) && xp > 0 ? xp : 0;
  let level = 1;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level += 1;
  }
  return { level, tier: tierForLevel(level), xpIntoLevel: remaining, xpForNext: xpForLevel(level) };
}
