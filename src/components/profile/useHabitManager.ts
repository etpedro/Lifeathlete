"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  archiveHabit,
  createCustomHabit,
  listManageableHabits,
  setHabitActive,
  updateHabitTarget,
  type ManageablePillar,
} from "@/lib/data/habits";
import { createDefaultRecalcScheduler, type RecalcScheduler } from "@/lib/data/recalc";
import type { HabitKind } from "@/lib/data/today";
import { habitErrorMessageKey, type ProfileErrorKey } from "@/lib/profile/habit-form";
import { createClient } from "@/lib/supabase/client";
import type { Db } from "@/lib/supabase/types";
import { todayIn } from "@/lib/today/dates";

/** Keys inside the `profile` namespace of the success messages. */
export type StatusKey = "habits.targetSaved" | "habits.activated" | "habits.paused_done" | "habits.archived" | "add.added";

/** Result of a mutation: `null` = done, otherwise the message key of the error to show. */
export type MutationResult = ProfileErrorKey | null;

export type NewHabit = { pillarId: string; title: string; kind: HabitKind; target: number };

/**
 * Glue between the management components and the data layer: runs one mutation at a time,
 * re-reads the list, and asks for a debounced recalculation after every success.
 */
export function useHabitManager(userId: string, timezone: string, initial: ManageablePillar[] | null) {
  const [pillars, setPillars] = useState<ManageablePillar[] | null>(initial);
  const [status, setStatus] = useState<StatusKey | null>(null);
  const [loadFailed, setLoadFailed] = useState(initial === null);
  const [busy, setBusy] = useState(false);
  const dbRef = useRef<Db | null>(null);
  const schedulerRef = useRef<RecalcScheduler | null>(null);
  const busyRef = useRef(false);

  const db = useCallback(() => (dbRef.current ??= createClient()), []);
  const scheduler = useCallback(() => (schedulerRef.current ??= createDefaultRecalcScheduler(db())), [db]);

  const reload = useCallback(async () => {
    try {
      setPillars(await listManageableHabits(db()));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [db]);

  useEffect(() => {
    if (initial !== null) return;
    listManageableHabits(db()).then(setPillars, () => setLoadFailed(true));
  }, [initial, db]);

  // Leaving the screen runs a still-pending recalculation right away.
  useEffect(() => {
    return () => {
      void schedulerRef.current?.flush().catch(() => undefined);
    };
  }, []);

  const run = useCallback(
    async (action: () => Promise<unknown>, success: StatusKey): Promise<MutationResult> => {
      if (busyRef.current) return null;
      busyRef.current = true;
      setBusy(true);
      setStatus(null);
      try {
        await action();
      } catch (error) {
        busyRef.current = false;
        setBusy(false);
        if (habitErrorMessageKey(error) === "errors.notFound") await reload();
        return habitErrorMessageKey(error);
      }
      scheduler().request().catch(() => undefined); // failures only delay the stats; the next write retries
      await reload();
      setStatus(success);
      busyRef.current = false;
      setBusy(false);
      return null;
    },
    [reload, scheduler],
  );

  return {
    pillars,
    loadFailed,
    busy,
    status,
    reload,
    setActive: (id: string, active: boolean) =>
      run(
        () => setHabitActive(db(), id, active, todayIn(timezone)), // pause intervals use the user's local day
        active ? "habits.activated" : "habits.paused_done",
      ),
    saveTarget: (id: string, target: number) => run(() => updateHabitTarget(db(), id, target), "habits.targetSaved"),
    archive: (id: string) => run(() => archiveHabit(db(), id), "habits.archived"),
    create: (input: NewHabit) => run(() => createCustomHabit(db(), { userId, ...input }), "add.added"),
  };
}
