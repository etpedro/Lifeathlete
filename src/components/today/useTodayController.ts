"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createRecalcScheduler, RECALC_DELAY_MS, recalculateVia, type RecalcScheduler } from "@/lib/data/recalc";
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
import { todayIn } from "@/lib/today/dates";
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
  const [stats, setStats] = useState(initialStats);
  const [feedback, setFeedback] = useState<StatsFeedback | null>(null);
  const [notice, setNotice] = useState<TodayNotice | null>(null);

  const dbRef = useRef<Db | null>(null);
  const schedulerRef = useRef<RecalcScheduler | null>(null);
  const statsRef = useRef(initialStats);
  const dateRef = useRef(today);
  const directWrites = useRef<Promise<void>>(Promise.resolve());

  const db = useCallback(() => (dbRef.current ??= createClient()), []);
  const scheduler = useCallback(
    () => (schedulerRef.current ??= createRecalcScheduler(recalculateVia(db()), RECALC_DELAY_MS)),
    [db],
  );

  /** Re-reads a day from the server and shows still-queued values on top. */
  const reload = useCallback(
    async (date: string) => {
      try {
        const fresh = await getToday(db(), date);
        const queued = await listQueued().catch(() => []);
        const { data, pendingIds } = overlayQueued(fresh, queued, date);
        if (dateRef.current === date) setView({ date, data, pendingIds });
      } catch {
        if (dateRef.current === date) setNotice({ kind: "load" });
      }
    },
    [db],
  );

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
    const queued = await listQueued().catch(() => []);
    setView((v) => ({ ...v, pendingIds: new Set(queued.filter((q) => q.date === v.date).map((q) => q.userHabitId)) }));
  }, []);

  /** Flushes the offline queue, then re-reads the day if anything reached the server. */
  const sync = useCallback(async () => {
    if (!navigator.onLine) return showPending();
    try {
      const result = await flushQueue(db(), todayIn(timezone));
      if (result.sent > 0) recalc();
      if (result.dropped > 0) setNotice({ kind: "dropped", count: result.dropped });
      if (result.sent > 0 || result.dropped > 0) await reload(dateRef.current);
      else await showPending(); // e.g. a transient failure kept the item
    } catch {
      // IndexedDB unavailable: nothing was queued on this device.
    }
  }, [db, timezone, recalc, reload, showPending]);

  // Flush on mount (also shows values queued in an earlier visit) and whenever the device comes back online.
  useEffect(() => {
    void reload(dateRef.current).then(sync);
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [reload, sync]);

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
    [userId, timezone, sync, writeDirect],
  );

  const selectDate = useCallback(
    (date: string) => {
      if (date === dateRef.current) return;
      dateRef.current = date;
      setNotice(null);
      setView({ date, data: null, pendingIds: new Set() });
      void reload(date);
    },
    [reload],
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
    selectDate,
  };
}
