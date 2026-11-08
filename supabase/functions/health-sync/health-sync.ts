// Pure decisions of the health-sync Edge Function (automatic data collection, phase 1b).
// Runtime-agnostic: no Deno/Node globals, relative imports with explicit .ts extensions,
// so it runs under Vitest and in the Deno entrypoint (index.ts), which is only I/O glue.
// Values come from the user's phone and cannot be verified server-side (documented limitation).
import { localDate } from "../_shared/engine/dates.ts";
import { dayNumber } from "../_shared/engine/streaks.ts";

/** The only source this function accepts for now (Android Health Connect). */
export const PROVIDER = "health_connect";

/**
 * The metrics a habit can be filled from (user_habits.auto_source, consent categories,
 * provider_activity payload keys). Mirrored by src/lib/health/metrics.ts (a test fails if
 * they differ) and by the checks of migration 0012.
 */
export const AUTO_METRICS = ["steps", "workout_minutes", "sleep_hours", "mindful_minutes"] as const;
export type AutoMetric = (typeof AUTO_METRICS)[number];
/** Per metric: accepted range 0..max (outside -> rejected, never clamped) and rounding. */
export const METRIC_LIMITS: Record<AutoMetric, { max: number; decimals: number }> = {
  steps: { max: 100_000, decimals: 0 },
  workout_minutes: { max: 1440, decimals: 0 },
  sleep_hours: { max: 24, decimals: 2 },
  mindful_minutes: { max: 1440, decimals: 0 },
};

/** Days per sync request, and how far back (days before local today) a day may be. */
export const MAX_DAYS = 7;
export const WINDOW_DAYS = 7;
export const MAX_CONSENT_VERSION = 32;
/**
 * Version of the consent text the app shows (mirrored by HEALTH_CONSENT_VERSION in
 * src/lib/data/integrations.ts; a test fails if they differ). connect accepts only this
 * version and sync requires it, so changing the text makes every user consent again.
 */
export const CURRENT_CONSENT_VERSION = "metrics-2026-11-v3";
/** Habits filled per sync by fill_habits_from_activity (the SQL constant is authoritative). */
export const MAX_FILL_HABITS = 50;
/** A recalculation is forwarded at most once per this interval (repeated syncs). */
export const RECALC_MIN_INTERVAL_MS = 60_000;

export type Metrics = Partial<Record<AutoMetric, number>>;
export type MetricDay = { date: string; metrics: Metrics };

export type HealthSyncRequest =
  | { action: "connect"; source: typeof PROVIDER; consentVersion: string; categories: AutoMetric[] }
  | { action: "sync"; source: typeof PROVIDER; days: MetricDay[] }
  | { action: "disconnect"; source: typeof PROVIDER }
  | { action: "status"; source: typeof PROVIDER };

export type ErrorCode = "unauthorized" | "invalid_request" | "unsupported_source" | "consent_required" | "sync_failed";

export type ParseResult =
  | { ok: true; request: HealthSyncRequest }
  | { ok: false; error: "invalid_request" | "unsupported_source" };

const ACTIONS = ["connect", "sync", "disconnect", "status"] as const;
const invalid = { ok: false, error: "invalid_request" } as const;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export const isAutoMetric = (v: unknown): v is AutoMetric => (AUTO_METRICS as readonly unknown[]).includes(v);

/** The stored value of a metric (rounded), or null when it is not a number within 0..max. */
export function normalizeMetric(metric: unknown, value: unknown): number | null {
  if (!isAutoMetric(metric)) return null;
  const { max, decimals } = METRIC_LIMITS[metric];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) return null;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** Known metrics in canonical (AUTO_METRICS) order. */
const canonical = (set: ReadonlySet<unknown>): AutoMetric[] => AUTO_METRICS.filter((m) => set.has(m));

function dayOrNull(date: unknown): number | null {
  if (typeof date !== "string") return null;
  try {
    return dayNumber(date);
  } catch {
    return null; // malformed or not a calendar date (2026-02-30)
  }
}

/** A day's metrics: the v2 `metrics` object, or the phase 1 (legacy) `steps` number. */
function parseMetrics(entry: Record<string, unknown>): Metrics | null {
  const hasMetrics = "metrics" in entry;
  const hasLegacy = "steps" in entry;
  if (hasMetrics === hasLegacy) return null; // neither, or an ambiguous mix
  const raw = hasMetrics ? entry.metrics : { steps: entry.steps };
  if (!isObject(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length === 0) return null;
  const out: Metrics = {};
  for (const key of canonical(new Set(keys))) {
    const value = normalizeMetric(key, raw[key]);
    if (value === null) return null;
    out[key] = value;
  }
  return Object.keys(out).length === keys.length ? out : null; // an unknown key rejects the day
}

function parseDays(raw: unknown, today: string): MetricDay[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_DAYS) return null;
  const todayN = dayNumber(today);
  const seen = new Set<string>();
  const days: MetricDay[] = [];
  for (const entry of raw) {
    if (!isObject(entry)) return null;
    const n = dayOrNull(entry.date);
    if (n === null || n > todayN || n < todayN - WINDOW_DAYS) return null;
    const date = entry.date as string;
    if (seen.has(date)) return null;
    seen.add(date);
    const metrics = parseMetrics(entry);
    if (!metrics) return null;
    days.push({ date, metrics });
  }
  return days;
}

function parseCategories(raw: unknown): AutoMetric[] | null {
  if (!Array.isArray(raw) || raw.length < 1) return null;
  const set = new Set(raw);
  if (set.size !== raw.length || !raw.every(isAutoMetric)) return null;
  return canonical(set);
}

/**
 * Validates a request body. `today` is the user's local date (todayFor). Any violation
 * rejects the whole request: nothing is clamped and nothing is written. Unknown envelope
 * keys (a user id included: the user only comes from the JWT) are ignored; unknown metric
 * keys are rejected.
 */
export function parseRequest(body: unknown, today: string): ParseResult {
  if (!isObject(body)) return invalid;
  const action = body.action;
  if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) return invalid;
  if (typeof body.source !== "string") return invalid;
  if (body.source !== PROVIDER) return { ok: false, error: "unsupported_source" };
  const source = PROVIDER;

  switch (action as (typeof ACTIONS)[number]) {
    case "connect": {
      const version = body.consentVersion;
      if (body.consent !== true) return invalid;
      if (typeof version !== "string" || version.trim() === "" || version.length > MAX_CONSENT_VERSION) return invalid;
      if (version !== CURRENT_CONSENT_VERSION) return invalid; // a stale client cannot consent to an old text
      const categories = parseCategories(body.categories);
      if (!categories) return invalid;
      return { ok: true, request: { action: "connect", source, consentVersion: version, categories } };
    }
    case "sync": {
      const days = parseDays(body.days, today);
      return days ? { ok: true, request: { action: "sync", source, days } } : invalid;
    }
    case "disconnect":
      return { ok: true, request: { action: "disconnect", source } };
    case "status":
      return { ok: true, request: { action: "status", source } };
  }
}

/** The user's local date at `now` in the profile timezone; invalid or missing -> UTC (as recalculate). */
export function todayFor(now: string, timezone: string | null | undefined): string {
  try {
    return localDate(now, timezone || "UTC");
  } catch {
    return localDate(now, "UTC");
  }
}

/** A provider_connections row as the entrypoint reads it (service role). */
export type Connection = {
  status: string;
  consentedAt: string | null;
  consentVersion: string | null;
  /** consented_categories as stored (validated here, never trusted). */
  categories?: unknown;
  lastSyncedAt?: string | null;
} | null;

const storedCategories = (c: Connection): AutoMetric[] =>
  c && Array.isArray(c.categories) ? canonical(new Set(c.categories)) : [];

/** A connected row whose consent to the CURRENT text was recorded. */
export function consentGiven(connection: Connection): boolean {
  return (
    connection !== null &&
    connection.status === "connected" &&
    connection.consentedAt !== null &&
    connection.consentVersion === CURRENT_CONSENT_VERSION
  );
}

/** Sync is allowed only with current consent covering EVERY metric in the request. */
export function consentCovers(connection: Connection, metrics: readonly AutoMetric[]): boolean {
  if (!consentGiven(connection)) return false;
  const consented = new Set(storedCategories(connection));
  return metrics.every((m) => consented.has(m));
}

/** The provider_connections columns connect writes (categories replaced; tokens never touched). */
export function consentRecord(version: string, categories: AutoMetric[], now: string) {
  return {
    status: "connected",
    consented_at: now,
    consent_version: version,
    consented_categories: categories,
    consent_withdrawn_at: null,
  };
}

/** The columns disconnect writes; what was accepted (version, categories) stays as the record. */
export function consentWithdrawal(now: string) {
  return { status: "disconnected", consent_withdrawn_at: now };
}

/** The 200 body of the status action: what the screen needs after a reload, nothing more. */
export function statusResponse(connection: Connection) {
  return {
    ok: true as const,
    status: connection === null ? "none" : connection.status === "connected" ? "connected" : "disconnected",
    categories: storedCategories(connection),
    consentCurrent: consentGiven(connection),
    lastSyncedAt: connection?.lastSyncedAt ?? null,
  };
}

/** False when the previous sync was less than RECALC_MIN_INTERVAL_MS ago (unreadable/future -> true). */
export function shouldRecalculate(previousSyncedAt: string | null, now: string): boolean {
  if (previousSyncedAt === null) return true;
  const elapsed = Date.parse(now) - Date.parse(previousSyncedAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return true;
  return elapsed >= RECALC_MIN_INTERVAL_MS;
}

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  invalid_request: 400,
  unsupported_source: 400,
  consent_required: 403,
  sync_failed: 500,
};

export function errorStatus(code: ErrorCode): number {
  return STATUS[code];
}

/** URL of the recalculate function of the same project. */
export function recalculateUrl(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/recalculate`;
}

/** The distinct metrics of the days, in canonical order. */
export function metricsOf(days: readonly MetricDay[]): AutoMetric[] {
  return canonical(new Set(days.flatMap((d) => Object.keys(d.metrics))));
}

export type SyncPlan = {
  /** p_rows of public.upsert_provider_activity: only the metrics sent (the database merges). */
  activityRows: MetricDay[];
  /** p_from / p_to of public.fill_habits_from_activity: the request's oldest and newest day. */
  fillFrom: string;
  fillTo: string;
  metricsReceived: AutoMetric[];
  /** `now` as given (null when absent): provider_connections.last_synced_at. */
  lastSyncedAt: string | null;
};

/** Counts returned by public.fill_habits_from_activity. */
export type Filled = { written: number; skippedManual: number; habitsUpdated: number; habitsIgnored: number };

/**
 * What a validated sync writes. Manual precedence, source priority and the habit cap are
 * enforced by the database functions (migration 0012). Deterministic, so a repeated sync
 * writes the same rows. The range spans at most WINDOW_DAYS + 1 = 8 days (the SQL limit).
 */
export function planSync(input: { days: MetricDay[]; now?: string }): SyncPlan {
  const dates = input.days.map((d) => d.date).sort();
  return {
    activityRows: input.days.map((d) => ({ date: d.date, metrics: { ...d.metrics } })),
    fillFrom: dates[0],
    fillTo: dates[dates.length - 1],
    metricsReceived: metricsOf(input.days),
    lastSyncedAt: input.now ?? null,
  };
}

const count = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);

/** The jsonb result of fill_habits_from_activity (anything malformed counts as 0). */
export function parseFilled(data: unknown): Filled {
  const d = isObject(data) ? data : {};
  return {
    written: count(d.written),
    skippedManual: count(d.skippedManual),
    habitsUpdated: count(d.habitsUpdated),
    habitsIgnored: count(d.habitsIgnored),
  };
}

/** The 200 body of a sync (every v1 field name kept; metricsReceived added). */
export function syncResponse(plan: SyncPlan, filled: Filled) {
  return {
    ok: true as const,
    status: "connected" as const,
    lastSyncedAt: plan.lastSyncedAt,
    days: plan.activityRows.length,
    metricsReceived: plan.metricsReceived,
    habitsUpdated: filled.habitsUpdated,
    skippedManual: filled.skippedManual,
    habitsIgnored: filled.habitsIgnored,
  };
}
