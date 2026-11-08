import {
  connectHealth,
  HEALTH_CONSENT_VERSION,
  HealthError,
  syncHealth,
  type HealthErrorCode,
  type HealthSyncResult,
  type StepDay,
} from "@/lib/data/integrations";
import type { Db } from "@/lib/supabase/types";
import { todayIn } from "@/lib/today/dates";
import { dayNumber } from "../../../supabase/functions/_shared/engine/streaks.ts";
import { MAX_DAYS, MAX_STEPS } from "../../../supabase/functions/health-sync/health-sync.ts";
import type { HealthBridge } from "./bridge";

/** Every failure the integrations screen can show. */
export type HealthFlowCode = HealthErrorCode | "permission_denied" | "read_failed";

/** `result` is null when the phone had no usable day to send. */
export type HealthSyncOutcome = { ok: true; result: HealthSyncResult | null } | { ok: false; code: HealthFlowCode };

export type HealthFlowDeps = { db: Db; bridge: HealthBridge; now: Date; timezone: string };

function dayOrNull(date: unknown): number | null {
  if (typeof date !== "string") return null;
  try {
    return dayNumber(date);
  } catch {
    return null;
  }
}

/**
 * The bridge's days the function will accept: real dates within the last MAX_DAYS local
 * days (today included), 0..MAX_STEPS steps (rounded), one per date, newest first. An
 * implausible day is dropped here rather than making the server reject the whole batch.
 */
export function stepDaysToSend(raw: { date: unknown; steps: unknown }[], today: string): StepDay[] {
  const todayN = dayNumber(today);
  const seen = new Set<string>();
  const out: StepDay[] = [];
  for (const d of raw) {
    const n = dayOrNull(d?.date);
    const steps = d?.steps;
    if (n === null || n > todayN || n <= todayN - MAX_DAYS) continue;
    if (typeof steps !== "number" || !Number.isFinite(steps) || steps < 0 || steps > MAX_STEPS) continue;
    const date = d.date as string;
    if (seen.has(date)) continue;
    seen.add(date);
    out.push({ date, steps: Math.round(steps) });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, MAX_DAYS);
}

const codeOf = (e: unknown): HealthFlowCode => (e instanceof HealthError ? e.code : "sync_failed");

/** Reads the last 7 days from the phone and sends them (the user's local today in `timezone`). */
export async function runHealthSync({ db, bridge, now, timezone }: HealthFlowDeps): Promise<HealthSyncOutcome> {
  let raw: unknown;
  try {
    raw = await bridge.readSteps(MAX_DAYS);
  } catch {
    return { ok: false, code: "read_failed" };
  }
  if (!Array.isArray(raw)) return { ok: false, code: "read_failed" };
  const days = stepDaysToSend(raw, todayIn(timezone, now));
  if (days.length === 0) return { ok: true, result: null };
  try {
    return { ok: true, result: await syncHealth(db, days) };
  } catch (e) {
    return { ok: false, code: codeOf(e) };
  }
}

export type HealthConnectOutcome = { connected: false; code: HealthFlowCode } | { connected: true; sync: HealthSyncOutcome };

/** The consent flow: system permission, then the recorded consent, then the first sync. */
export async function connectAndSync(deps: HealthFlowDeps): Promise<HealthConnectOutcome> {
  let granted = false;
  try {
    granted = await deps.bridge.requestPermission();
  } catch {
    granted = false;
  }
  if (granted !== true) return { connected: false, code: "permission_denied" };
  try {
    await connectHealth(deps.db, HEALTH_CONSENT_VERSION);
  } catch (e) {
    return { connected: false, code: codeOf(e) };
  }
  return { connected: true, sync: await runHealthSync(deps) };
}
