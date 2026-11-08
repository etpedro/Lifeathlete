import { knownMetrics, type AutoMetric } from "@/lib/health/metrics";
import type { Db } from "@/lib/supabase/types";
import { throwIfError } from "./errors";

/** The provider id of Android Health Connect (provider_connections.provider, habit_logs.source). */
export const HEALTH_PROVIDER = "health_connect";
/**
 * Version of the consent text the user accepts (`profile.integrations.consent.*`). It MUST
 * equal CURRENT_CONSENT_VERSION in supabase/functions/health-sync/health-sync.ts (a test
 * checks it): the server rejects any other version. Bump both whenever the text changes.
 */
export const HEALTH_CONSENT_VERSION = "metrics-2026-11-v3";

export type HealthConnection = { status: "connected" | "disconnected" | "none"; lastSyncedAt: string | null };
/**
 * The server-side view of the connection (health-sync `status` action): the consented
 * categories and whether the consent is to the current text are not readable by the client.
 */
export type HealthStatus = HealthConnection & { categories: AutoMetric[]; consentCurrent: boolean };
/** One day of the v2 sync format. */
export type MetricDay = { date: string; metrics: Partial<Record<AutoMetric, number>> };
export type HealthSyncResult = {
  lastSyncedAt: string | null;
  days: number;
  /** The metrics the server received in this sync. */
  metricsReceived: AutoMetric[];
  habitsUpdated: number;
  /** Habits filled automatically beyond the server's limit of 50 per sync (not filled). */
  habitsIgnored: number;
  skippedManual: number;
};

export type HealthErrorCode =
  | "consent_required"
  | "invalid_request"
  | "unauthorized"
  | "unsupported_source"
  | "sync_failed"
  | "network";

const BACKEND_CODES: readonly HealthErrorCode[] = [
  "consent_required",
  "invalid_request",
  "unauthorized",
  "unsupported_source",
  "sync_failed",
];

/** Error of a health-sync call. `code` is stable (the UI maps it to copy); never a backend message. */
export class HealthError extends Error {
  constructor(readonly code: HealthErrorCode) {
    super(`health-sync failed: ${code}`);
    this.name = "HealthError";
  }
}

/**
 * The caller's Health Connect connection (RLS scopes the read to the user). Only the
 * columns granted to the client are read: consent and tokens stay server-side.
 */
export async function getHealthConnection(db: Db): Promise<HealthConnection> {
  const { data, error, status } = await db
    .from("provider_connections")
    .select("status, last_synced_at")
    .eq("provider", HEALTH_PROVIDER);
  throwIfError(error, "load health connection", status);
  const row = ((data ?? []) as { status: unknown; last_synced_at: unknown }[])[0];
  if (!row) return { status: "none", lastSyncedAt: null };
  return {
    status: row.status === "connected" ? "connected" : "disconnected",
    lastSyncedAt: typeof row.last_synced_at === "string" ? row.last_synced_at : null,
  };
}

async function codeFromError(error: unknown): Promise<HealthErrorCode> {
  const e = error as { name?: unknown; context?: unknown } | null;
  if (e?.name === "FunctionsFetchError") return "network";
  if (e?.name !== "FunctionsHttpError") return "sync_failed";
  const response = e.context as Response | undefined;
  let body: unknown = null;
  try {
    body = await response?.json();
  } catch {
    body = null;
  }
  const code = (body as { error?: unknown } | null)?.error;
  if (BACKEND_CODES.includes(code as HealthErrorCode)) return code as HealthErrorCode;
  return response?.status === 401 ? "unauthorized" : "sync_failed";
}

async function call(db: Db, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  let res: { data: unknown; error: unknown };
  try {
    res = await db.functions.invoke("health-sync", { body: { ...body, source: HEALTH_PROVIDER } });
  } catch {
    throw new HealthError("network");
  }
  if (res.error) throw new HealthError(await codeFromError(res.error));
  const data = res.data as Record<string, unknown> | null;
  if (!data || data.ok !== true) throw new HealthError("sync_failed");
  return data;
}

const count = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Records the user's consent to the current text for `categories` (the ones the phone
 * granted) and connects Health Connect. Returns the categories the server stored.
 */
export async function connectHealth(
  db: Db,
  consentVersion: string,
  categories: AutoMetric[],
): Promise<{ status: "connected"; categories: AutoMetric[] }> {
  const data = await call(db, { action: "connect", consent: true, consentVersion, categories });
  const stored = knownMetrics(data.categories);
  return { status: "connected", categories: stored.length > 0 ? stored : knownMetrics(categories) };
}

/** Sends daily metric values (v2 format); the function fills the habits the user chose. */
export async function syncHealth(db: Db, days: MetricDay[]): Promise<HealthSyncResult> {
  const data = await call(db, { action: "sync", days });
  if (data.status !== "connected") throw new HealthError("sync_failed");
  return {
    lastSyncedAt: typeof data.lastSyncedAt === "string" ? data.lastSyncedAt : null,
    days: count(data.days),
    metricsReceived: knownMetrics(data.metricsReceived),
    habitsUpdated: count(data.habitsUpdated),
    habitsIgnored: count(data.habitsIgnored),
    skippedManual: count(data.skippedManual),
  };
}

/** The connection as the server sees it, consent categories included (survives a reload). */
export async function getHealthStatus(db: Db): Promise<HealthStatus> {
  const data = await call(db, { action: "status" });
  const status = data.status === "connected" || data.status === "none" ? data.status : "disconnected";
  return {
    status,
    categories: knownMetrics(data.categories),
    consentCurrent: data.consentCurrent === true,
    lastSyncedAt: typeof data.lastSyncedAt === "string" ? data.lastSyncedAt : null,
  };
}

/** Stops automatic collection; the imported history is kept. Idempotent. */
export async function disconnectHealth(db: Db): Promise<{ status: "disconnected" }> {
  await call(db, { action: "disconnect" });
  return { status: "disconnected" };
}
