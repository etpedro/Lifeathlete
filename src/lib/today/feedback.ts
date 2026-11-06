import type { AchievementItem } from "@/lib/data/stats";
import type { HeaderStats } from "@/lib/data/today";

export type StatsFeedback = {
  /** XP gained (> 0) since the previous read, or null: drives the "+N XP" toast. */
  xpGained: number | null;
  /** The new level when it went up, else null. */
  levelUp: number | null;
  /** The new current streak when it grew, else null. */
  streak: number | null;
  /** Localized titles of achievements unlocked since the last check (spec §5 "feedback de conquista"). */
  achievements?: string[];
};

const grew = (before: number, after: number) => Number.isFinite(before) && Number.isFinite(after) && after > before;

/** What to celebrate after a recalculation; only numbers that actually changed upwards. */
type Counters = Pick<HeaderStats, "xpTotal" | "level" | "currentStreak">;

export function statsFeedback(before: Counters, after: Counters): StatsFeedback {
  return {
    xpGained: grew(before.xpTotal, after.xpTotal) ? after.xpTotal - before.xpTotal : null,
    levelUp: grew(before.level, after.level) ? after.level : null,
    streak: grew(before.currentStreak, after.currentStreak) ? after.currentStreak : null,
  };
}

export const hasFeedback = (f: StatsFeedback) =>
  f.xpGained !== null || f.levelUp !== null || f.streak !== null || (f.achievements?.length ?? 0) > 0;

/** Codes of the unlocked achievements in a getAchievements list. */
export const unlockedCodes = (items: readonly AchievementItem[]) =>
  new Set(items.filter((a) => a.unlockedAt !== null).map((a) => a.code));

/** Achievements unlocked in `after` that were not unlocked `before`. */
export function newlyUnlocked(before: ReadonlySet<string>, after: readonly AchievementItem[]): AchievementItem[] {
  return after.filter((a) => a.unlockedAt !== null && !before.has(a.code));
}

/** `feedback` (or an empty one) with `titles` appended to its unlocked achievements. */
export function withAchievements(feedback: StatsFeedback | null, titles: string[]): StatsFeedback {
  const base = feedback ?? { xpGained: null, levelUp: null, streak: null };
  return { ...base, achievements: [...(base.achievements ?? []), ...titles] };
}

export type AchievementWatcher = {
  /** Takes the baseline (the achievements already unlocked when the screen opened). */
  prime(): void;
  /** Re-reads the list and returns what was unlocked since the last read (serialized; rejects on load failure). */
  check(): Promise<AchievementItem[]>;
};

/**
 * Detects achievement unlocks across stats refreshes. Without a baseline (the first load
 * failed) a check only sets it, so medals unlocked long ago are never announced as new.
 */
export function createAchievementWatcher(load: () => Promise<AchievementItem[]>): AchievementWatcher {
  let baseline: Promise<Set<string> | null> | null = null;
  let chain: Promise<unknown> = Promise.resolve();
  const prime = () => (baseline ??= load().then(unlockedCodes, () => null));
  return {
    prime() {
      prime();
    },
    check() {
      const run = chain.then(async () => {
        const before = await prime();
        const items = await load();
        baseline = Promise.resolve(unlockedCodes(items));
        return before === null ? [] : newlyUnlocked(before, items);
      });
      chain = run.catch(() => undefined);
      return run;
    },
  };
}
