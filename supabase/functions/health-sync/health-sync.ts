// Pure decisions of the health-sync Edge Function (automatic steps, phase 1).
// Runtime-agnostic: no Deno/Node globals, relative imports with explicit .ts extensions,
// so it runs under Vitest and in the Deno entrypoint (index.ts), which is only I/O glue.
// Steps come from the user's phone and cannot be verified server-side (documented limitation).
import { localDate } from "../_shared/engine/dates.ts";
import { dayNumber } from "../_shared/engine/streaks.ts";

/** The only supported source/provider for now (Android Health Connect). */
export const PROVIDER = "health_connect";
/** Days per sync request, and how far back (days before local today) a day may be. */
export const MAX_DAYS = 7;
export const WINDOW_DAYS = 7;
/** Daily steps above this are rejected as implausible (never clamped). */
export const MAX_STEPS = 100_000;
export const MAX_CONSENT_VERSION = 32;
/**
 * Version of the consent text the app shows (mirrored by HEALTH_CONSENT_VERSION in
 * src/lib/data/integrations.ts; a test fails if they differ). connect accepts only this
 * version and sync requires it, so changing the text makes every user consent again.
 */
export const CURRENT_CONSENT_VERSION = "steps-2026-11-v2";
/** Steps habits handled per sync (bounds the queries and writes to 20 habits x 7 days). */
export const MAX_STEPS_HABITS = 20;
/** A recalculation is forwarded at most once per this interval (repeated syncs). */
export const RECALC_MIN_INTERVAL_MS = 60_000;

export type StepDay = { date: string; steps: number };

export type HealthSyncRequest =
  | { action: "connect"; source: typeof PROVIDER; consentVersion: string }
  | { action: "sync"; source: typeof PROVIDER; days: StepDay[] }
  | { action: "disconnect"; source: typeof PROVIDER };

export type ErrorCode = "unauthorized" | "invalid_request" | "unsupported_source" | "consent_required" | "sync_failed";

export type ParseResult =
  | { ok: true; request: HealthSyncRequest }
  | { ok: false; error: "invalid_request" | "unsupported_source" };

const ACTIONS = ["connect", "sync", "disconnect"] as const;
const invalid = { ok: false, error: "invalid_request" } as const;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function dayOrNull(date: unknown): number | null {
  if (typeof date !== "string") return null;
  try {
    return dayNumber(date);
  } catch {
    return null; // malformed or not a calendar date (2026-02-30)
  }
}

function parseDays(raw: unknown, today: string): StepDay[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_DAYS) return null;
  const todayN = dayNumber(today);
  const seen = new Set<string>();
  const days: StepDay[] = [];
  for (const entry of raw) {
    if (!isObject(entry)) return null;
    const n = dayOrNull(entry.date);
    if (n === null || n > todayN || n < todayN - WINDOW_DAYS) return null;
    const date = entry.date as string;
    if (seen.has(date)) return null;
    seen.add(date);
    const steps = entry.steps;
    if (typeof steps !== "number" || !Number.isFinite(steps) || steps < 0 || steps > MAX_STEPS) return null;
    days.push({ date, steps: Math.round(steps) });
  }
  return days;
}

/**
 * Validates a request body. `today` is the user's local date (todayFor). Any violation
 * rejects the whole request: nothing is clamped and nothing is written. Unknown keys
 * (a user id included: the user only comes from the JWT) are ignored.
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
      return { ok: true, request: { action: "connect", source, consentVersion: version } };
    }
    case "sync": {
      const days = parseDays(body.days, today);
      return days ? { ok: true, request: { action: "sync", source, days } } : invalid;
    }
    case "disconnect":
      return { ok: true, request: { action: "disconnect", source } };
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

export type Connection = { status: string; consentedAt: string | null; consentVersion: string | null } | null;

/** Sync is allowed only for a connected row whose consent to the CURRENT text was recorded. */
export function consentGiven(connection: Connection): boolean {
  return (
    connection !== null &&
    connection.status === "connected" &&
    connection.consentedAt !== null &&
    connection.consentVersion === CURRENT_CONSENT_VERSION
  );
}

/** The provider_connections columns connect writes (tokens are never touched). */
export function consentRecord(version: string, now: string) {
  return { status: "connected", consented_at: now, consent_version: version, consent_withdrawn_at: null };
}

/** The columns disconnect writes; consented_at/consent_version stay as the record of what was accepted. */
export function consentWithdrawal(now: string) {
  return { status: "disconnected", consent_withdrawn_at: now };
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

/** A user habit as loaded by the entrypoint (numeric target already converted). */
export type StepHabit = {
  id: string;
  kind: "check" | "value";
  target: number | null;
  active: boolean;
  deletedAt: string | null;
  autoSource: string | null;
};

export type ActivityRow = { provider: typeof PROVIDER; date: string; payload: { steps: number } };

/**
 * A row for public.apply_health_logs (the entrypoint passes the verified user id beside
 * it). The database writes it atomically and never overwrites a manual log.
 */
export type LogRow = { user_habit_id: string; date: string; value: number; target: number | null };

export type SyncPlan = {
  activityRows: ActivityRow[];
  logRows: LogRow[];
  /** Steps habits beyond MAX_STEPS_HABITS, not filled by this sync. */
  habitsIgnored: number;
  /** `now` as given (null when absent): provider_connections.last_synced_at. */
  lastSyncedAt: string | null;
};

/** Counts returned by public.apply_health_logs. */
export type Applied = { written: number; skippedManual: number; habitsUpdated: number };

/** Habits filled by steps: value kind, auto_source 'steps', active and not archived. */
export function isStepsHabit(h: StepHabit): boolean {
  return h.autoSource === "steps" && h.kind === "value" && h.active && h.deletedAt === null;
}

const snapshot = (t: number | null): number | null =>
  typeof t === "number" && Number.isFinite(t) && t > 0 ? t : null;

/**
 * What a validated sync writes: one provider_activity row per day and one log row per
 * eligible habit (the first MAX_STEPS_HABITS, in the given order) and day. Manual
 * precedence is enforced by the database (apply_health_logs), not by a read snapshot.
 * `totalHabits` = how many steps habits the database has (the loaded list may be capped).
 * Deterministic, so a repeated sync writes the same rows.
 */
export function planSync(input: {
  days: StepDay[];
  habits: StepHabit[];
  totalHabits?: number | null;
  now?: string;
}): SyncPlan {
  const eligible = input.habits.filter(isStepsHabit);
  const used = eligible.slice(0, MAX_STEPS_HABITS);
  const total = Math.max(eligible.length, input.totalHabits ?? 0);
  return {
    activityRows: input.days.map((d) => ({ provider: PROVIDER, date: d.date, payload: { steps: d.steps } })),
    logRows: used.flatMap((h) =>
      input.days.map((d) => ({ user_habit_id: h.id, date: d.date, value: d.steps, target: snapshot(h.target) })),
    ),
    habitsIgnored: total - used.length,
    lastSyncedAt: input.now ?? null,
  };
}

const count = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);

/** The jsonb result of apply_health_logs (anything malformed counts as 0). */
export function parseApplied(data: unknown): Applied {
  const d = isObject(data) ? data : {};
  return { written: count(d.written), skippedManual: count(d.skippedManual), habitsUpdated: count(d.habitsUpdated) };
}

/** The 200 body of a sync. */
export function syncResponse(plan: SyncPlan, applied: Applied) {
  return {
    ok: true as const,
    status: "connected" as const,
    lastSyncedAt: plan.lastSyncedAt,
    days: plan.activityRows.length,
    habitsUpdated: applied.habitsUpdated,
    habitsIgnored: plan.habitsIgnored,
    skippedManual: applied.skippedManual,
  };
}
