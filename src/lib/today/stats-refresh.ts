import type { RecalcScheduler } from "@/lib/data/recalc";
import type { HeaderStats } from "@/lib/data/today";

/**
 * Whether stored stats are out of date: never computed, or computed for a local day
 * before `today` (streaks, scores and the resting mascot depend on the current day).
 */
export function isStale(computedFor: string | null | undefined, today: string): boolean {
  return !computedFor || computedFor < today;
}

export type StatsRefresher = {
  /** After a write: debounced recalculation, then a fresh read of the stats. */
  afterWrite(): void;
  /** Requests a recalculation when the shown stats were computed before `today` (once per day while in flight). */
  ensureFresh(today: string): void;
  /** Leaving the screen: runs a still-pending recalculation now; no UI callbacks afterwards. */
  dispose(): Promise<void>;
};

export type StatsRefresherDeps = {
  /** Created lazily, on the first request. */
  createScheduler: () => RecalcScheduler;
  loadStats: () => Promise<HeaderStats>;
  /** The stats currently shown. */
  current: () => HeaderStats;
  onStats: (next: HeaderStats) => void;
  /** The recalculation (after its retries) or the read failed; the UI shows a non-blocking notice. */
  onFailed: () => void;
};

/** Keeps the Today header stats fresh: after writes, and when they belong to an earlier day. */
export function createStatsRefresher(deps: StatsRefresherDeps): StatsRefresher {
  let scheduler: RecalcScheduler | null = null;
  let staleRequestFor: string | null = null;
  let disposed = false;

  const run = (): Promise<void> =>
    (scheduler ??= deps.createScheduler())
      .request()
      .then(deps.loadStats)
      .then(
        (next) => {
          if (!disposed) deps.onStats(next);
        },
        (error: unknown) => {
          if (!disposed) deps.onFailed();
          throw error;
        },
      );

  return {
    afterWrite() {
      run().catch(() => undefined);
    },
    ensureFresh(today) {
      if (staleRequestFor === today || !isStale(deps.current().computedFor, today)) return;
      staleRequestFor = today;
      run().then(
        () => (staleRequestFor = null),
        () => (staleRequestFor = null),
      );
    },
    async dispose() {
      disposed = true;
      await scheduler?.flush().catch(() => undefined);
    },
  };
}
