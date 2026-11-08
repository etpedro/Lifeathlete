import type { Db } from "@/lib/supabase/types";
import { throwIfError } from "./errors";

/** The provider id of Android Health Connect (provider_connections.provider, habit_logs.source). */
export const HEALTH_PROVIDER = "health_connect";
/** Version of the consent text the user accepts (sent with connect; at most 32 characters). */
export const HEALTH_CONSENT_VERSION = "steps-2026-11";

export type HealthConnection = { status: "connected" | "disconnected" | "none"; lastSyncedAt: string | null };
export type StepDay = { date: string; steps: number };
export type HealthSyncResult = { lastSyncedAt: string | null; days: number; habitsUpdated: number; skippedManual: number };

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

/** Records the user's consent and connects Health Connect (the permission was granted on the phone). */
export async function connectHealth(db: Db, consentVersion: string): Promise<{ status: "connected" }> {
  await call(db, { action: "connect", consent: true, consentVersion });
  return { status: "connected" };
}

/** Sends daily step totals; the function fills the habits the user chose. */
export async function syncHealth(db: Db, days: StepDay[]): Promise<HealthSyncResult> {
  const data = await call(db, { action: "sync", days });
  if (data.status !== "connected") throw new HealthError("sync_failed");
  return {
    lastSyncedAt: typeof data.lastSyncedAt === "string" ? data.lastSyncedAt : null,
    days: count(data.days),
    habitsUpdated: count(data.habitsUpdated),
    skippedManual: count(data.skippedManual),
  };
}

/** Stops automatic steps; the imported history is kept. Idempotent. */
export async function disconnectHealth(db: Db): Promise<{ status: "disconnected" }> {
  await call(db, { action: "disconnect" });
  return { status: "disconnected" };
}
