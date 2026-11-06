"use client";

import { useLocale } from "next-intl";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createDefaultRecalcScheduler } from "@/lib/data/recalc";
import { getAchievements } from "@/lib/data/stats";
import {
  getHeaderStats,
  getToday,
  logHabit,
  LogValidationError,
  validateLog,
  type HeaderStats,
  type LogInput,
  type TodayData,
  type TodayHabit,
} from "@/lib/data/today";
import { enqueueLog, flushQueue, listQueued } from "@/lib/offline/queue";
import { createClient } from "@/lib/supabase/client";
import type { Db } from "@/lib/supabase/types";
import { reanchorDay, shiftDate, todayIn } from "@/lib/today/dates";
import {
  createAchievementWatcher,
  hasFeedback,
  statsFeedback,
  withAchievements,
  type AchievementWatcher,
  type StatsFeedback,
} from "@/lib/today/feedback";
import { applyValue, fallbackDay, overlayQueued, rememberLoaded } from "@/lib/today/progress";
import { createStatsRefresher, type StatsRefresher } from "@/lib/today/stats-refresh";
import type { TodayNotice } from "./notices";

export type { TodayNotice } from "./notices";

type View = { date: string; data: TodayData | null; pendingIds: Set<string> };

export type TodayControllerProps = {
  userId: string;
  timezone: string;
  today: string;
  initialData: TodayData | null;
  initialStats: HeaderStats;
};

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
const isOnline = () => navigator.onLine;
const assumeOnline = () => true;

/**
 * Glue between the Today components and the data layer: optimistic writes, the offline
 * queue, debounced recalculation and XP feedback. All rules live in src/lib.
 */
export function useTodayController({ userId, timezone, today, initialData, initialStats }: TodayControllerProps) {
  const online = useSyncExternalStore(subscribeOnline, isOnline, assumeOnline);
  const locale = useLocale() === "en" ? "en" : "pt";
  const [view, setView] = useState<View>({ date: today, data: initialData, pendingIds: new Set() });
  const [currentToday, setCurrentToday] = useState(today);
  const [stats, setStats] = useState(initialStats);
  const [feedback, setFeedback] = useState<StatsFeedback | null>(null);
  const [notice, setNotice] = useState<TodayNotice | null>(null);
  /** The stats could not be refreshed (after retries): a polite, non-blocking notice. */
  const [statsFailed, setStatsFailed] = useState(false);

  const dbRef = useRef<Db | null>(null);
  const refresherRef = useRef<StatsRefresher | null>(null);
  const achievementsRef = useRef<AchievementWatcher | null>(null);
  const statsRef = useRef(initialStats);
  const dateRef = useRef(today);
  const todayRef = useRef(today);
  /** The days that loaded (by date): a later failed load of the same day keeps its real values; another day reuses the habit structure blank. */
  const loadedRef = useRef<Record<string, TodayData>>(initialData ? { [today]: initialData } : {});
  /** The shown day is a fallback (not the server's data): reload it when back online. */
  const fallbackRef = useRef(false);
  const directWrites = useRef<Promise<void>>(Promise.resolve());

  const db = useCallback(() => (dbRef.current ??= createClient()), []);
  const achievements = useCallback(
    () => (achievementsRef.current ??= createAchievementWatcher(() => getAchievements(db(), locale))),
    [db, locale],
  );

  /** Debounced recalculation (with retry) + fresh header stats; one per mount (see the unmount flush). */
  const refresher = useCallback(
    () =>
      (refresherRef.current ??= createStatsRefresher({
        createScheduler: () => createDefaultRecalcScheduler(db()),
        loadStats: () => getHeaderStats(db()),
        current: () => statsRef.current,
        onStats: (next) => {
          const change = statsFeedback(statsRef.current, next);
          statsRef.current = next;
          setStats(next);
          setStatsFailed(false);
          if (hasFeedback(change)) setFeedback(change);
          // Achievement unlocks join the same toast (localized titles from the data layer).
          achievements()
            .check()
            .then((unlocked) => {
              if (unlocked.length > 0) setFeedback((f) => withAchievements(f, unlocked.map((a) => a.title)));
            })
            .catch(() => undefined); // only the notice is lost; the medal shows on Conquistas
        },
        onFailed: () => setStatsFailed(true),
      })),
    [db, achievements],
  );

  /**
   * Re-reads a day from the server and shows still-queued values on top. When that fails
   * (offline the next morning, "yesterday" offline, a transient error): a day that loaded
   * before keeps its real values, a day that never loaded shows the habits blank (and says
   * so); queued values go on top and taps keep working and queue.
   */
  const reload = useCallback(
    async (date: string) => {
      const queuedFor = () => listQueued(undefined, userId).catch(() => []);
      try {
        const fresh = await getToday(db(), date);
        loadedRef.current = rememberLoaded(loadedRef.current, date, fresh);
        const { data, pendingIds } = overlayQueued(fresh, await queuedFor(), date);
        if (dateRef.current !== date) return;
        fallbackRef.current = false;
        setView({ date, data, pendingIds });
        setNotice((n) => (n?.kind === "fallback" || n?.kind === "fallbackStale" ? null : n));
      } catch {
        if (dateRef.current !== date) return;
        const fallback = fallbackDay(loadedRef.current, await queuedFor(), date);
        if (dateRef.current !== date) return;
        if (!fallback) return setNotice({ kind: "load" });
        fallbackRef.current = true;
        setView({ date, data: fallback.data, pendingIds: fallback.pendingIds });
        setNotice({ kind: fallback.valuesKnown ? "fallbackStale" : "fallback" });
      }
    },
    [db, userId],
  );

  /**
   * Re-anchors the day strip when the local date rolled over while the page was open
   * (midnight, timezone or clock change); reloads when the shown day moves. Returns true
   * when the shown day changed.
   */
  const checkDay = useCallback(() => {
    const next = reanchorDay({ today: todayRef.current, selected: dateRef.current }, todayIn(timezone));
    if (!next.changed) return false;
    todayRef.current = next.today;
    setCurrentToday(next.today);
    refresher().ensureFresh(next.today); // yesterday's streak/mascot are stale now
    if (!next.reload) return false;
    dateRef.current = next.selected;
    setView({ date: next.selected, data: null, pendingIds: new Set() });
    void reload(next.selected);
    return true;
  }, [timezone, reload, refresher]);

  /** Debounced recalculation, then fresh header stats (a final failure shows a notice). */
  const recalc = useCallback(() => refresher().afterWrite(), [refresher]);

  /** Marks the shown day's habits that still have a queued (unsynced) value; no network. */
  const showPending = useCallback(async () => {
    const queued = await listQueued(undefined, userId).catch(() => []);
    setView((v) => ({ ...v, pendingIds: new Set(queued.filter((q) => q.date === v.date).map((q) => q.userHabitId)) }));
  }, [userId]);

  /** Flushes the offline queue, then re-reads the day if anything reached the server. */
  const sync = useCallback(async () => {
    if (!navigator.onLine) return showPending();
    try {
      const result = await flushQueue(db(), todayIn(timezone), userId);
      if (result.sent > 0) recalc();
      if (result.dropped > 0) setNotice({ kind: "dropped", count: result.dropped });
      if (result.sent > 0 || result.dropped > 0 || fallbackRef.current) await reload(dateRef.current);
      else await showPending(); // e.g. a transient failure kept the item
    } catch {
      // IndexedDB unavailable: nothing was queued on this device.
    }
  }, [db, timezone, userId, recalc, reload, showPending]);

  // Flush on mount (also shows values queued in an earlier visit) and whenever the device comes back online.
  useEffect(() => {
    if (!checkDay()) void reload(dateRef.current).then(sync);
    else void sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [checkDay, reload, sync]);

  // Stats computed for an earlier day (e.g. back after 5 days: the streak shown is old) are
  // recalculated on mount and when coming back; leaving Hoje runs a pending recalculation.
  useEffect(() => {
    achievements().prime(); // what was already unlocked is never announced
    refresher().ensureFresh(todayRef.current);
    return () => {
      void refresherRef.current?.dispose();
      refresherRef.current = null;
    };
  }, [refresher, achievements]);

  // Coming back to the app (e.g. the next morning): re-check which day "today" is.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      checkDay();
      refresher().ensureFresh(todayRef.current);
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [checkDay, refresher]);

  /** Without IndexedDB (rare): write directly, one at a time so taps never race. */
  const writeDirect = useCallback(
    (input: LogInput) => {
      directWrites.current = directWrites.current.then(async () => {
        try {
          await logHabit(db(), input, todayIn(timezone));
          recalc();
        } catch {
          setNotice({ kind: "save" });
          await reload(input.date);
        }
      });
    },
    [db, timezone, recalc, reload],
  );

  /**
   * One tap / picker confirm. Optimistic update, then every write goes through the
   * persistent queue (last value per habit/day wins, passes never overlap), so online
   * and offline taps follow one path: offline or on a transient failure the item stays
   * queued and is shown as pending; it is flushed on reconnect, on mount and after writes.
   */
  const setValue = useCallback(
    (habit: TodayHabit, value: number) => {
      // The day rolled over and the shown day moved (it was "today"): this tap is not saved
      // (it must never land on the previous day); the real today is shown with a notice.
      if (checkDay()) return setNotice({ kind: "rolledOver" });
      // The habit's target travels with the log (snapshot): check habits carry 1.
      const input: LogInput = { userHabitId: habit.id, userId, date: dateRef.current, value, target: habit.target };
      try {
        validateLog(input, todayIn(timezone));
      } catch (error) {
        const outside = error instanceof LogValidationError && error.code !== "invalid_value";
        setNotice({ kind: outside ? "outsideWindow" : "save" });
        return;
      }
      setNotice(null);
      setView((v) => (v.data ? { ...v, data: applyValue(v.data, habit.id, value) } : v));
      void enqueueLog(input).then(sync, () => writeDirect(input));
    },
    [userId, timezone, checkDay, sync, writeDirect],
  );

  /** DayStrip choice (0 = today), resolved against the real current day. */
  const selectDay = useCallback(
    (daysAgo: number) => {
      checkDay();
      const date = shiftDate(todayRef.current, -daysAgo);
      if (date === dateRef.current) return;
      dateRef.current = date;
      setNotice(null);
      setView({ date, data: null, pendingIds: new Set() });
      void reload(date);
    },
    [checkDay, reload],
  );

  return {
    online,
    date: view.date,
    data: view.data,
    pendingIds: view.pendingIds,
    stats,
    statsFailed,
    feedback,
    dismissFeedback: useCallback(() => setFeedback(null), []),
    notice,
    retry: useCallback(() => {
      setNotice(null);
      void reload(dateRef.current);
    }, [reload]),
    setValue,
    today: currentToday,
    selectDay,
  };
}
