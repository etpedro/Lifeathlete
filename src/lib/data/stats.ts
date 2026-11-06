import type { Db } from "@/lib/supabase/types";
import { levelFromXp } from "../../../supabase/functions/_shared/engine/levels.ts";
import { mascotState } from "../../../supabase/functions/_shared/engine/mascot.ts";
import { throwIfError } from "./errors";

export type Wheel = { scores: Record<string, number>; weakest?: string; strongest?: string };
export type MascotVariant = "dim" | "normal" | "bright";
export type ProfileStats = {
  level: number;
  tier: number;
  xpIntoLevel: number;
  xpForNext: number;
  currentStreak: number;
  bestStreak: number;
  lastActiveDate: string | null;
  mascot: { stage: number; variant: MascotVariant };
};
export type AchievementItem = {
  code: string;
  title: string;
  description: string;
  pillarSlug: string | null;
  xpReward: number;
  unlockedAt: string | null;
  progress: { current: number; target: number } | null;
};

type PillarRow = { id: string; slug: string; sort: number };

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

/**
 * Pillar scores (0-100, as stored) keyed by pillar slug, plus the weakest and strongest
 * pillar. Ties go to the pillar with the lowest `pillars.sort`. Nothing is highlighted
 * with fewer than 2 scored pillars or when all scores are equal.
 */
export async function getWheel(db: Db): Promise<Wheel> {
  const [pillarsRes, scoresRes] = await Promise.all([
    db.from("pillars").select("id, slug, sort").order("sort"),
    db.from("pillar_scores").select("pillar_id, score"),
  ]);
  throwIfError(pillarsRes.error, "load pillars", pillarsRes.status);
  throwIfError(scoresRes.error, "load pillar scores", scoresRes.status);

  const bySort = [...((pillarsRes.data ?? []) as PillarRow[])].sort((a, b) => a.sort - b.sort);
  const scoreById = new Map(
    ((scoresRes.data ?? []) as { pillar_id: string; score: unknown }[]).map((r) => [r.pillar_id, num(r.score)]),
  );
  const scored = bySort.filter((p) => scoreById.has(p.id)).map((p) => ({ slug: p.slug, score: scoreById.get(p.id)! }));

  const scores: Record<string, number> = {};
  for (const s of scored) scores[s.slug] = s.score;
  if (scored.length < 2) return { scores };

  // First match in sort order wins ties.
  let weakest = scored[0];
  let strongest = scored[0];
  for (const s of scored) {
    if (s.score < weakest.score) weakest = s;
    if (s.score > strongest.score) strongest = s;
  }
  if (weakest.score === strongest.score) return { scores };
  return { scores, weakest: weakest.slug, strongest: strongest.slug };
}

/** Level (engine), streaks, last active date and the mascot state; defaults for a new user. */
export async function getProfileStats(db: Db): Promise<ProfileStats> {
  const [statsRes, mascotRes] = await Promise.all([
    db.from("user_stats").select("xp_total, current_streak, best_streak, last_active_date"),
    db.from("mascot_state").select("stage, variant"),
  ]);
  throwIfError(statsRes.error, "load user stats", statsRes.status);
  throwIfError(mascotRes.error, "load mascot state", mascotRes.status);

  const s = ((statsRes.data ?? []) as Record<string, unknown>[])[0];
  const m = ((mascotRes.data ?? []) as { stage: unknown; variant: unknown }[])[0];
  const lvl = levelFromXp(num(s?.xp_total));
  const fallback = mascotState(1, 0);
  const variant: MascotVariant =
    m?.variant === "dim" || m?.variant === "normal" || m?.variant === "bright"
      ? m.variant
      : m
        ? "normal" // e.g. the column default "default" before the first recalculation
        : fallback.variant;
  const stage = m ? Math.min(5, Math.max(1, Math.round(num(m.stage, 1)))) : fallback.stage;
  return {
    level: lvl.level,
    tier: lvl.tier,
    xpIntoLevel: lvl.xpIntoLevel,
    xpForNext: lvl.xpForNext,
    currentStreak: Math.max(0, num(s?.current_streak)),
    bestStreak: Math.max(0, num(s?.best_streak)),
    lastActiveDate: typeof s?.last_active_date === "string" ? s.last_active_date : null,
    mascot: { stage, variant },
  };
}

type AchievementRow = {
  id: string;
  code: string;
  pillar_id: string | null;
  rule: { type?: string; days?: number; pillar?: string } | null;
  xp_reward: unknown;
};
type I18nRow = { achievement_id: string; locale: string; name: string | null; description: string | null };

/**
 * The achievement catalog in `locale` (other locale as fallback, then the code, never
 * empty) with the caller's unlock state. `progress` exists only for global streak rules
 * (from stored best_streak); everything else is a plain locked/unlocked medal.
 */
export async function getAchievements(db: Db, locale: "pt" | "en"): Promise<AchievementItem[]> {
  const [catalogRes, i18nRes, pillarsRes, unlockedRes, statsRes] = await Promise.all([
    db.from("achievements").select("id, code, pillar_id, rule, xp_reward"),
    db.from("achievements_i18n").select("achievement_id, locale, name, description"),
    db.from("pillars").select("id, slug, sort"),
    db.from("user_achievements").select("achievement_id, unlocked_at"),
    db.from("user_stats").select("best_streak"),
  ]);
  throwIfError(catalogRes.error, "load achievements", catalogRes.status);
  throwIfError(i18nRes.error, "load achievement texts", i18nRes.status);
  throwIfError(pillarsRes.error, "load pillars", pillarsRes.status);
  throwIfError(unlockedRes.error, "load unlocked achievements", unlockedRes.status);
  throwIfError(statsRes.error, "load user stats", statsRes.status);

  const slugById = new Map(((pillarsRes.data ?? []) as PillarRow[]).map((p) => [p.id, p.slug]));
  const unlockedAt = new Map(
    ((unlockedRes.data ?? []) as { achievement_id: string; unlocked_at: string }[]).map((u) => [
      u.achievement_id,
      u.unlocked_at,
    ]),
  );
  const best = Math.max(0, num(((statsRes.data ?? []) as Record<string, unknown>[])[0]?.best_streak));
  const texts = (id: string, loc: string) =>
    ((i18nRes.data ?? []) as I18nRow[]).find((r) => r.achievement_id === id && r.locale === loc);

  return [...((catalogRes.data ?? []) as AchievementRow[])]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((a) => {
      const own = texts(a.id, locale);
      const other = texts(a.id, locale === "pt" ? "en" : "pt");
      const unlocked = unlockedAt.get(a.id) ?? null;
      const rule = a.rule ?? {};
      const globalStreak =
        rule.type === "streak" && !rule.pillar && !a.pillar_id && typeof rule.days === "number" && rule.days > 0;
      return {
        code: a.code,
        title: own?.name || other?.name || a.code,
        description: own?.description || other?.description || "",
        pillarSlug: (a.pillar_id ? slugById.get(a.pillar_id) : undefined) ?? rule.pillar ?? null,
        xpReward: num(a.xp_reward),
        unlockedAt: unlocked,
        progress:
          globalStreak && !unlocked ? { current: Math.min(best, rule.days as number), target: rule.days as number } : null,
      };
    });
}
