import {
  connectHealth,
  HEALTH_CONSENT_VERSION,
  HealthError,
  syncHealth,
  type HealthErrorCode,
  type HealthSyncResult,
  type MetricDay,
} from "@/lib/data/integrations";
import type { Db } from "@/lib/supabase/types";
import { todayIn } from "@/lib/today/dates";
import { dayNumber } from "../../../supabase/functions/_shared/engine/streaks.ts";
import type { HealthBridge } from "./bridge";
import { AUTO_METRICS, knownMetrics, metricValue, SYNC_DAYS, type AutoMetric } from "./metrics";

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

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The bridge's days the function will accept: real dates within the last SYNC_DAYS local
 * days (today included), one per date, newest first, at most SYNC_DAYS. Inside a day only
 * the consented metrics with a valid value are kept (rounded); unknown keys, NaN,
 * negative and over-limit values are dropped here rather than making the server reject
 * the whole batch, and a day left with no metric is dropped.
 */
export function metricDaysToSend(raw: unknown[], categories: readonly AutoMetric[], today: string): MetricDay[] {
  const todayN = dayNumber(today);
  const allowed = new Set(categories);
  const seen = new Set<string>();
  const out: MetricDay[] = [];
  for (const d of raw) {
    if (!isObject(d)) continue;
    const n = dayOrNull(d.date);
    if (n === null || n > todayN || n <= todayN - SYNC_DAYS || !isObject(d.metrics)) continue;
    const date = d.date as string;
    if (seen.has(date)) continue;
    const source = d.metrics;
    const metrics: MetricDay["metrics"] = {};
    for (const m of AUTO_METRICS) {
      if (!allowed.has(m) || !(m in source)) continue;
      const value = metricValue(m, source[m]);
      if (value !== null) metrics[m] = value;
    }
    if (Object.keys(metrics).length === 0) continue;
    seen.add(date);
    out.push({ date, metrics });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, SYNC_DAYS);
}

const codeOf = (e: unknown): HealthFlowCode => (e instanceof HealthError ? e.code : "sync_failed");

/**
 * Reads the consented `categories` of the last 7 days from the phone and sends them (the
 * user's local today in `timezone`). With no category nothing is read or sent.
 */
export async function runHealthSync({
  db,
  bridge,
  now,
  timezone,
  categories,
}: HealthFlowDeps & { categories: AutoMetric[] }): Promise<HealthSyncOutcome> {
  const wanted = knownMetrics(categories);
  if (wanted.length === 0) return { ok: true, result: null };
  let raw: unknown;
  try {
    raw = await bridge.readMetrics(SYNC_DAYS, wanted);
  } catch {
    return { ok: false, code: "read_failed" };
  }
  if (!Array.isArray(raw)) return { ok: false, code: "read_failed" };
  const days = metricDaysToSend(raw, wanted, todayIn(timezone, now));
  if (days.length === 0) return { ok: true, result: null };
  try {
    return { ok: true, result: await syncHealth(db, days) };
  } catch (e) {
    return { ok: false, code: codeOf(e) };
  }
}

export type HealthConnectOutcome =
  | { connected: false; code: HealthFlowCode }
  | { connected: true; categories: AutoMetric[]; sync: HealthSyncOutcome };

/**
 * The consent flow for the categories the user ticked: system permission (the phone may
 * grant only part of them), then the recorded consent for the granted ones, then the
 * first sync of exactly those.
 */
export async function connectAndSync(deps: HealthFlowDeps, selected: AutoMetric[]): Promise<HealthConnectOutcome> {
  const wanted = knownMetrics(selected);
  if (wanted.length === 0) return { connected: false, code: "permission_denied" };
  let granted: AutoMetric[] = [];
  try {
    const answer = await deps.bridge.requestPermission(wanted);
    granted = knownMetrics(answer).filter((m) => wanted.includes(m));
  } catch {
    granted = [];
  }
  if (granted.length === 0) return { connected: false, code: "permission_denied" };
  let categories: AutoMetric[];
  try {
    categories = (await connectHealth(deps.db, HEALTH_CONSENT_VERSION, granted)).categories;
  } catch (e) {
    return { connected: false, code: codeOf(e) };
  }
  return { connected: true, categories, sync: await runHealthSync({ ...deps, categories }) };
}
