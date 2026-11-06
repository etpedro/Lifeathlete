// Deno Edge Function: POST /weekly-summary  body: { locale?: "pt" | "en" }  ->  { svg }
// Thin adapter: authenticates the caller from `Authorization: Bearer <jwt>` ONLY
// (never from the body or query), reads that user's level, streak and pillar scores
// with a service-role client filtered by the verified id, and renders the card.
// Excluded from tsc/eslint (Deno code).
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildSummaryCard, type SummaryCardLabels } from "./summary.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Keep in sync with `share.card` and `pillars.<slug>.name` in src/messages/{pt,en}.json.
const LABELS: Record<"pt" | "en", SummaryCardLabels> = {
  pt: {
    title: "A minha Roda da Vida",
    level: "Nível",
    streak: "Sequência",
    days: "dias",
    wheel: "Roda da Vida",
    pillars: {
      exercise: "Exercício regular",
      nutrition: "Alimentação saudável",
      nature: "Carregar baterias na natureza",
      gratitude: "Viver com gratidão",
      screens: "Ecrãs em doses moderadas",
      lightness: "Viver leve como uma libelinha",
      meditation: "Meditação",
      "active-lifestyle": "Estilo de vida saudável e ativo",
      reading: "Ler mais",
      family: "Família e valores",
    },
  },
  en: {
    title: "My Wheel of Life",
    level: "Level",
    streak: "Streak",
    days: "days",
    wheel: "Wheel of Life",
    pillars: {
      exercise: "Regular exercise",
      nutrition: "Healthy eating",
      nature: "Recharge in nature",
      gratitude: "Live with gratitude",
      screens: "Screens in moderate doses",
      lightness: "Live light like a dragonfly",
      meditation: "Meditation",
      "active-lifestyle": "Healthy and active lifestyle",
      reading: "Read more",
      family: "Family and values",
    },
  },
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "server_misconfigured" }, 500);

  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("Authorization") ?? "");
  if (!match) return json({ error: "unauthorized" }, 401);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.getUser(match[1].trim());
  if (error || !data?.user) return json({ error: "unauthorized" }, 401);
  const userId = data.user.id;

  let locale: "pt" | "en" = "pt";
  try {
    const body = await req.json();
    if (body?.locale === "en") locale = "en";
    else if (body?.locale !== undefined && body.locale !== "pt") return json({ error: "invalid_request" }, 400);
  } catch {
    // empty or non-JSON body: default locale
  }

  try {
    const [statsRes, scoresRes, pillarsRes] = await Promise.all([
      admin.from("user_stats").select("level, current_streak").eq("user_id", userId).maybeSingle(),
      admin.from("pillar_scores").select("pillar_id, score").eq("user_id", userId),
      admin.from("pillars").select("id, slug"),
    ]);
    if (statsRes.error || scoresRes.error || pillarsRes.error) throw new Error("load failed");

    const slugById = new Map((pillarsRes.data ?? []).map((p: { id: string; slug: string }) => [p.id, p.slug]));
    const scores: Record<string, number> = {};
    for (const row of (scoresRes.data ?? []) as { pillar_id: string; score: number | string }[]) {
      const slug = slugById.get(row.pillar_id);
      if (slug) scores[slug] = Number(row.score);
    }
    const stats = {
      level: Number(statsRes.data?.level ?? 1),
      streak: Number(statsRes.data?.current_streak ?? 0),
      scores,
    };
    return json(buildSummaryCard(stats, LABELS[locale]), 200);
  } catch (e) {
    console.error("weekly-summary failed", e);
    return json({ error: "summary_failed" }, 500);
  }
});
