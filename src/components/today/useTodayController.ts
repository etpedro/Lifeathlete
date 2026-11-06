"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createDefaultRecalcScheduler, type RecalcScheduler } from "@/lib/data/recalc";
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
import { hasFeedback, statsFeedback, type StatsFeedback } from "@/lib/today/feedback";
import { applyValue, overlayQueued } from "@/lib/today/progress";

export type TodayNotice =
  | { kind: "save" }
  | { kind: "load" }
  | { kind: "outsideWindow" }
  | { kind: "dropped"; count: number };

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
  const [view, setView] = useState<View>({ date: today, data: initialData, pendingIds: new Set() });
  const [currentToday, setCurrentToday] = useState(today);
  const [stats, setStats] = useState(initialStats);
  const [feedback, setFeedback] = useState<StatsFeedback | null>(null);
  const [notice, setNotice] = useState<TodayNotice | null>(null);

  const dbRef = useRef<Db | null>(null);
  const schedulerRef = useRef<RecalcScheduler | null>(null);
  const statsRef = useRef(initialStats);
  const dateRef = useRef(today);
  const todayRef = useRef(today);
  const directWrites = useRef<Promise<void>>(Promise.resolve());

  const db = useCallback(() => (dbRef.current ??= createClient()), []);
  const scheduler = useCallback(
    () => (schedulerRef.current ??= createDefaultRecalcScheduler(db())),
    [db],
  );

  /** Re-reads a day from the server and shows still-queued values on top. */
  const reload = useCallback(
    async (date: string) => {
      try {
        const fresh = await getToday(db(), date);
        const queued = await listQueued(undefined, userId).catch(() => []);
        const { data, pendingIds } = overlayQueued(fresh, queued, date);
        if (dateRef.current === date) setView({ date, data, pendingIds });
      } catch {
        if (dateRef.current === date) setNotice({ kind: "load" });
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
    if (!next.reload) return false;
    dateRef.current = next.selected;
    setView({ date: next.selected, data: null, pendingIds: new Set() });
    void reload(next.selected);
    return true;
  }, [timezone, reload]);

  const refreshStats = useCallback(async () => {
    const next = await getHeaderStats(db());
    const change = statsFeedback(statsRef.current, next);
    statsRef.current = next;
    setStats(next);
    if (hasFeedback(change)) setFeedback(change);
  }, [db]);

  /** Debounced recalculation, then fresh header stats (failures only delay the update). */
  const recalc = useCallback(() => {
    scheduler()
      .request()
      .then(refreshStats)
      .catch(() => undefined);
  }, [scheduler, refreshStats]);

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
      if (result.sent > 0 || result.dropped > 0) await reload(dateRef.current);
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

  // Coming back to the app (e.g. the next morning): re-check which day "today" is.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") checkDay();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [checkDay]);

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
      // The day rolled over and the shown day moved (it was "today"): drop this tap so it
      // never lands on the previous day; the real today is reloaded and shown instead.
      if (checkDay()) return;
      const input: LogInput = { userHabitId: habit.id, userId, date: dateRef.current, value };
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
