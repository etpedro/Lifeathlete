// Deno Edge Function: POST /recalculate
// Thin adapter: authenticates the caller from `Authorization: Bearer <jwt>` ONLY
// (never from the body or query), implements the Db interface with a service-role
// client and delegates to recalculateUser. Excluded from tsc/eslint (Deno code).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { recalculateUser, type Db, type LoadedInputs, type UserState } from "./recalculate.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PAGE = 1000; // PostgREST caps rows per request; page through larger results.

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data;
}

/** Db over a service-role client. Ruling L: maps pillar uuid <-> slug at this boundary. */
function supabaseDb(admin: SupabaseClient): Db {
  let pillarIdBySlug = new Map<string, string>();

  return {
    async loadInputs(userId: string): Promise<LoadedInputs> {
      const pillars = check(await admin.from("pillars").select("id, slug")) as { id: string; slug: string }[];
      pillarIdBySlug = new Map(pillars.map((p) => [p.slug, p.id]));
      const slugById = new Map(pillars.map((p) => [p.id, p.slug]));

      const profile = check(
        await admin.from("profiles").select("timezone").eq("user_id", userId).maybeSingle(),
      ) as { timezone: string } | null;

      const habits = await selectAll<{
        id: string; pillar_id: string; kind: "check" | "value"; target: number | string | null;
        active: boolean; created_at: string; deleted_at: string | null;
      }>((from, to) =>
        admin.from("user_habits")
          .select("id, pillar_id, kind, target, active, created_at, deleted_at")
          .eq("user_id", userId).order("id").range(from, to)
      );

      const logs = await selectAll<{
        user_habit_id: string; date: string; value: number | string; target: number | string | null;
      }>(
        (from, to) =>
          admin.from("habit_logs").select("user_habit_id, date, value, target")
            .eq("user_id", userId).order("id").range(from, to),
      );

      const achievements = check(await admin.from("achievements").select("code, rule")) as
        { code: string; rule: unknown }[];

      const unlocked = await selectAll<{ achievements: { code: string } | null }>((from, to) =>
        admin.from("user_achievements").select("achievements(code)")
          .eq("user_id", userId).order("achievement_id").range(from, to)
      );

      return {
        timezone: profile?.timezone ?? "UTC",
        habits: habits.map((h) => ({
          id: h.id,
          pillar: slugById.get(h.pillar_id) ?? h.pillar_id,
          kind: h.kind,
          target: h.target === null ? null : Number(h.target), // numeric may arrive as string
          active: h.active,
          createdAt: h.created_at,
          deletedAt: h.deleted_at,
        })),
        logs: logs.map((l) => ({
          habitId: l.user_habit_id,
          date: l.date,
          value: Number(l.value),
          target: l.target === null ? null : Number(l.target), // snapshot at log time (0007)
        })),
        achievements,
        unlockedCodes: unlocked.flatMap((u) => (u.achievements ? [u.achievements.code] : [])),
      };
    },

    async saveState(userId: string, state: UserState): Promise<void> {
      const s = state.stats;
      check(await admin.from("user_stats").upsert({
        user_id: userId,
        xp_total: s.xpTotal,
        level: s.level,
        current_streak: s.currentStreak,
        best_streak: s.bestStreak,
        last_active_date: s.lastActiveDate,
      }, { onConflict: "user_id" }));

      // pillar_scores: replace set (upsert present pillars, delete the rest)
      const updatedAt = new Date().toISOString();
      const rows = Object.entries(state.pillarScores).flatMap(([slug, score]) => {
        const pillarId = pillarIdBySlug.get(slug);
        return pillarId ? [{ user_id: userId, pillar_id: pillarId, score, updated_at: updatedAt }] : [];
      });
      if (rows.length > 0) {
        check(await admin.from("pillar_scores").upsert(rows, { onConflict: "user_id,pillar_id" }));
        const keep = rows.map((r) => r.pillar_id);
        check(await admin.from("pillar_scores").delete().eq("user_id", userId)
          .not("pillar_id", "in", `(${keep.join(",")})`));
      } else {
        check(await admin.from("pillar_scores").delete().eq("user_id", userId));
      }

      // user_achievements: insert-only; never touch existing rows / unlocked_at
      if (state.newAchievements.length > 0) {
        const catalog = check(await admin.from("achievements").select("id, code")
          .in("code", state.newAchievements.map((a) => a.code))) as { id: string; code: string }[];
        const idByCode = new Map(catalog.map((a) => [a.code, a.id]));
        const inserts = state.newAchievements.flatMap((a) => {
          const id = idByCode.get(a.code);
          return id ? [{ user_id: userId, achievement_id: id, unlocked_at: a.unlockedAt }] : [];
        });
        if (inserts.length > 0) {
          check(await admin.from("user_achievements").upsert(inserts, {
            onConflict: "user_id,achievement_id",
            ignoreDuplicates: true,
          }));
        }
      }

      check(await admin.from("mascot_state").upsert({
        user_id: userId,
        stage: state.mascot.stage,
        variant: state.mascot.variant,
      }, { onConflict: "user_id" }));
    },
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);

  // The user comes ONLY from the caller's JWT; body and query are ignored.
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("Authorization") ?? "");
  if (!match) return json({ error: "unauthorized" }, 401);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.getUser(match[1].trim());
  if (error || !data?.user) return json({ error: "unauthorized" }, 401);

  try {
    await recalculateUser(supabaseDb(admin), data.user.id, new Date().toISOString());
    return json({ ok: true }, 200);
  } catch (e) {
    console.error("recalculate failed", e);
    return json({ error: "recalculate_failed" }, 500);
  }
});
