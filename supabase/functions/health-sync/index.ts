// Deno Edge Function: POST /health-sync (automatic steps, phase 1)
// Thin adapter: authenticates the caller from `Authorization: Bearer <jwt>` ONLY (never
// from the body or query), writes with a service-role client and filters every query by
// the verified user id. All decisions live in health-sync.ts. Excluded from tsc/eslint
// (Deno code). Steps are client-supplied and cannot be verified (documented limitation).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  consentGiven,
  errorStatus,
  parseRequest,
  planSync,
  PROVIDER,
  recalculateUrl,
  syncResponse,
  todayFor,
  type ErrorCode,
  type StepDay,
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

/** Consent was not given (or was withdrawn): the sync is refused before anything is written. */
class ConsentRequired extends Error {}

async function connect(admin: SupabaseClient, userId: string, now: string): Promise<Response> {
  // Status columns only: tokens stay null (Health Connect is read on the phone).
  check(await admin.from("provider_connections").upsert(
    { user_id: userId, provider: PROVIDER, status: "connected", consented_at: now },
    { onConflict: "user_id,provider" },
  ));
  return json({ ok: true, status: "connected" }, 200);
}

async function disconnect(admin: SupabaseClient, userId: string): Promise<Response> {
  // Idempotent; provider_activity and habit_logs (the imported history) are kept.
  check(await admin.from("provider_connections").update({ status: "disconnected" })
    .eq("user_id", userId).eq("provider", PROVIDER));
  return json({ ok: true, status: "disconnected" }, 200);
}

async function sync(
  admin: SupabaseClient,
  userId: string,
  days: StepDay[],
  now: string,
): Promise<ReturnType<typeof syncResponse>> {
  const connection = check(await admin.from("provider_connections").select("status, consented_at")
    .eq("user_id", userId).eq("provider", PROVIDER).maybeSingle()) as
    { status: string; consented_at: string | null } | null;
  if (!consentGiven(connection && { status: connection.status, consentedAt: connection.consented_at })) {
    throw new ConsentRequired();
  }

  const habits = check(await admin.from("user_habits")
    .select("id, kind, target, active, deleted_at, auto_source")
    .eq("user_id", userId).eq("auto_source", "steps").eq("kind", "value")
    .eq("active", true).is("deleted_at", null)) as {
      id: string; kind: "check" | "value"; target: number | string | null; active: boolean;
      deleted_at: string | null; auto_source: string | null;
    }[];
  const dates = days.map((d) => d.date);
  const logs = habits.length === 0 ? [] : check(await admin.from("habit_logs")
    .select("user_habit_id, date, source")
    .eq("user_id", userId).in("user_habit_id", habits.map((h) => h.id)).in("date", dates)) as
    { user_habit_id: string; date: string; source: string }[];

  const plan = planSync({
    days,
    habits: habits.map((h) => ({
      id: h.id,
      kind: h.kind,
      target: h.target === null ? null : Number(h.target), // numeric may arrive as string
      active: h.active,
      deletedAt: h.deleted_at,
      autoSource: h.auto_source,
    })),
    existingLogs: logs.map((l) => ({ habitId: l.user_habit_id, date: l.date, source: l.source })),
    now,
  });

  check(await admin.from("provider_activity").upsert(
    plan.activityRows.map((r) => ({ user_id: userId, ...r })),
    { onConflict: "user_id,provider,date" },
  ));

  const inserts = plan.logRows.filter((r) => !r.replace).map(({ replace: _, ...r }) => ({ user_id: userId, ...r }));
  if (inserts.length > 0) {
    // ON CONFLICT DO NOTHING: a log written meanwhile (manual or not) is never overwritten here.
    check(await admin.from("habit_logs").upsert(inserts, { onConflict: "user_habit_id,date", ignoreDuplicates: true }));
  }
  for (const r of plan.logRows.filter((row) => row.replace)) {
    // Only while the row is still automatic: a manual edit made meanwhile prevails.
    check(await admin.from("habit_logs").update({ value: r.value, source: r.source, target: r.target })
      .eq("user_id", userId).eq("user_habit_id", r.user_habit_id).eq("date", r.date).neq("source", "manual"));
  }

  check(await admin.from("provider_connections").update({ last_synced_at: now })
    .eq("user_id", userId).eq("provider", PROVIDER));
  return syncResponse(plan);
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
    if (request.action === "connect") return await connect(admin, userId, now);
    if (request.action === "disconnect") return await disconnect(admin, userId);

    const result = await sync(admin, userId, request.days, now);
    await requestRecalculation(url, jwt);
    return json(result, 200);
  } catch (e) {
    if (e instanceof ConsentRequired) return fail("consent_required");
    console.error("health-sync failed", e);
    return fail("sync_failed");
  }
});
