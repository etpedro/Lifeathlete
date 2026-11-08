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

export type Connection = { status: string; consentedAt: string | null } | null;

/** Sync is allowed only for a connected row whose consent was recorded. */
export function consentGiven(connection: Connection): boolean {
  return connection !== null && connection.status === "connected" && connection.consentedAt !== null;
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

/** An existing habit_logs row for one of the habits and dates of the sync. */
export type ExistingLog = { habitId: string; date: string; source: string };

export type ActivityRow = { provider: typeof PROVIDER; date: string; payload: { steps: number } };

/**
 * A habit_logs row to write (the entrypoint adds the verified user_id). `replace` = an
 * automatic log exists and is updated (only while it is still non-manual); otherwise it
 * is inserted, doing nothing if a log appeared meanwhile.
 */
export type LogRow = {
  user_habit_id: string;
  date: string;
  value: number;
  source: string;
  target: number | null;
  replace: boolean;
};

export type SyncPlan = {
  activityRows: ActivityRow[];
  logRows: LogRow[];
  /** (habit, day) pairs left alone because the user logged them by hand. */
  skippedManual: number;
  /** Distinct habits that got at least one log row. */
  habitsUpdated: number;
  /** `now` as given (null when absent): provider_connections.last_synced_at. */
  lastSyncedAt: string | null;
};

/** Habits filled by steps: value kind, auto_source 'steps', active and not archived. */
export function isStepsHabit(h: StepHabit): boolean {
  return h.autoSource === "steps" && h.kind === "value" && h.active && h.deletedAt === null;
}

const snapshot = (t: number | null): number | null =>
  typeof t === "number" && Number.isFinite(t) && t > 0 ? t : null;

/**
 * What a validated sync writes. A manual log always prevails (counted in skippedManual);
 * an automatic log (any other source) is replaced, since steps grow during the day. Same
 * input twice gives the same rows, so a sync is idempotent.
 */
export function planSync(input: {
  days: StepDay[];
  habits: StepHabit[];
  existingLogs: ExistingLog[];
  now?: string;
}): SyncPlan {
  const existing = new Map(input.existingLogs.map((l) => [`${l.habitId}|${l.date}`, l.source]));
  const activityRows: ActivityRow[] = input.days.map((d) => ({
    provider: PROVIDER,
    date: d.date,
    payload: { steps: d.steps },
  }));
  const logRows: LogRow[] = [];
  let skippedManual = 0;
  for (const h of input.habits.filter(isStepsHabit)) {
    for (const d of input.days) {
      const source = existing.get(`${h.id}|${d.date}`);
      if (source === "manual") {
        skippedManual++;
        continue;
      }
      logRows.push({
        user_habit_id: h.id,
        date: d.date,
        value: d.steps,
        source: PROVIDER,
        target: snapshot(h.target),
        replace: source !== undefined,
      });
    }
  }
  return {
    activityRows,
    logRows,
    skippedManual,
    habitsUpdated: new Set(logRows.map((r) => r.user_habit_id)).size,
    lastSyncedAt: input.now ?? null,
  };
}

/** The 200 body of a sync. */
export function syncResponse(plan: SyncPlan) {
  return {
    ok: true as const,
    status: "connected" as const,
    lastSyncedAt: plan.lastSyncedAt,
    days: plan.activityRows.length,
    habitsUpdated: plan.habitsUpdated,
    skippedManual: plan.skippedManual,
  };
}
