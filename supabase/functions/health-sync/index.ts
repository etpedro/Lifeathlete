// Deno Edge Function: POST /health-sync (automatic data collection, v2)
// Thin adapter: authenticates the caller from `Authorization: Bearer <jwt>` ONLY (never
// from the body or query), writes with a service-role client and filters every query by
// the verified user id. All decisions live in health-sync.ts; ingest, source priority and
// manual precedence live in the SQL functions of migration 0012. Excluded from tsc/eslint
// (Deno code). Values are client-supplied and cannot be verified (documented limitation).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  consentCovers,
  consentRecord,
  consentWithdrawal,
  errorStatus,
  isConsentRequiredError,
  metricsOf,
  parseFilled,
  parseRequest,
  planSync,
  PROVIDER,
  recalculateUrl,
  shouldRecalculate,
  statusResponse,
  syncResponse,
  todayFor,
  type AutoMetric,
  type Connection,
  type ErrorCode,
  type MetricDay,
} from "./health-sync.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const fail = (code: ErrorCode) => json({ error: code }, errorStatus(code));

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

/** Consent was not given, was withdrawn, or does not cover a metric sent: nothing is written. */
class ConsentRequired extends Error {}

type ConnectionRow = {
  status: string;
  consented_at: string | null;
  consent_version: string | null;
  consented_categories: unknown;
  last_synced_at: string | null;
};

async function loadConnection(admin: SupabaseClient, userId: string): Promise<Connection> {
  const row = check(await admin.from("provider_connections")
    .select("status, consented_at, consent_version, consented_categories, last_synced_at")
    .eq("user_id", userId).eq("provider", PROVIDER).maybeSingle()) as ConnectionRow | null;
  return row && {
    status: row.status,
    consentedAt: row.consented_at,
    consentVersion: row.consent_version,
    categories: row.consented_categories,
    lastSyncedAt: row.last_synced_at,
  };
}

async function connect(
  admin: SupabaseClient, userId: string, version: string, categories: AutoMetric[], now: string,
): Promise<Response> {
  // Consent record + status only: tokens stay null (Health Connect is read on the phone).
  check(await admin.from("provider_connections").upsert(
    { user_id: userId, provider: PROVIDER, ...consentRecord(version, categories, now) },
    { onConflict: "user_id,provider" },
  ));
  return json({ ok: true, status: "connected", categories }, 200);
}

async function disconnect(admin: SupabaseClient, userId: string, now: string): Promise<Response> {
  // Idempotent (a second disconnect keeps the first withdrawal time); provider_activity and
  // habit_logs (the imported history) are kept, and so is the record of what was accepted.
  check(await admin.from("provider_connections").update(consentWithdrawal(now))
    .eq("user_id", userId).eq("provider", PROVIDER).neq("status", "disconnected"));
  return json({ ok: true, status: "disconnected" }, 200);
}

type SyncOutcome = { body: ReturnType<typeof syncResponse>; recalculate: boolean };

async function sync(admin: SupabaseClient, userId: string, days: MetricDay[], now: string): Promise<SyncOutcome> {
  const connection = await loadConnection(admin, userId);
  // Fast path (data minimization: an unconsented category is never stored). The
  // authority is upsert_provider_activity itself, which re-checks consent atomically
  // with the write, so a disconnect that commits after this point still blocks it.
  if (!consentCovers(connection, metricsOf(days))) throw new ConsentRequired();

  const plan = planSync({ days, now });
  // (a) ingest, merged per day; (b) fill from connected, consented providers by priority.
  const ingested = await admin.rpc("upsert_provider_activity", {
    p_user_id: userId, p_provider: PROVIDER, p_rows: plan.activityRows,
  });
  if (ingested.error && isConsentRequiredError(ingested.error)) throw new ConsentRequired();
  check(ingested);
  const filled = parseFilled(check(await admin.rpc("fill_habits_from_activity", {
    p_user_id: userId, p_from: plan.fillFrom, p_to: plan.fillTo,
  })));

  check(await admin.from("provider_connections").update({ last_synced_at: now })
    .eq("user_id", userId).eq("provider", PROVIDER));
  return { body: syncResponse(plan, filled), recalculate: shouldRecalculate(connection!.lastSyncedAt ?? null, now) };
}

/** Best effort: stats also refresh on the next app open, so a failure never fails the sync. */
async function requestRecalculation(url: string, jwt: string): Promise<void> {
  try {
    const res = await fetch(recalculateUrl(url), {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) console.error("health-sync: recalculate returned", res.status);
  } catch (e) {
    console.error("health-sync: recalculate request failed", e);
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);

  // The user comes ONLY from the caller's JWT; any user id in the body or query is ignored.
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("Authorization") ?? "");
  if (!match) return fail("unauthorized");
  const jwt = match[1].trim();

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) return fail("unauthorized");
  const userId = data.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("invalid_request");
  }

  try {
    const now = new Date().toISOString();
    const profile = check(await admin.from("profiles").select("timezone").eq("user_id", userId).maybeSingle()) as
      { timezone: string | null } | null;
    const parsed = parseRequest(body, todayFor(now, profile?.timezone));
    if (!parsed.ok) return fail(parsed.error);

    const request = parsed.request;
    if (request.action === "connect") {
      return await connect(admin, userId, request.consentVersion, request.categories, now);
    }
    if (request.action === "disconnect") return await disconnect(admin, userId, now);
    if (request.action === "status") return json(statusResponse(await loadConnection(admin, userId)), 200);

    const result = await sync(admin, userId, request.days, now);
    // Throttled: repeated syncs within a minute do not each trigger a recalculation.
    if (result.recalculate) await requestRecalculation(url, jwt);
    return json(result.body, 200);
  } catch (e) {
    if (e instanceof ConsentRequired) return fail("consent_required");
    console.error("health-sync failed", e);
    return fail("sync_failed");
  }
});
