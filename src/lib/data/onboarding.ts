import type { Db } from "@/lib/supabase/types";
import { isValidTimeZone } from "@/lib/time/timezone";
import { requireUserId, throwIfError } from "./errors";

export type AppLocale = "pt" | "en";
export const APP_LOCALES: readonly AppLocale[] = ["pt", "en"];

export type OnboardingInput = {
  locale: AppLocale;
  timezone: string;
  habitTemplateIds: string[];
};

type TemplateRow = {
  id: string;
  pillar_id: string;
  kind: "check" | "value";
  default_target: number | null;
  habit_templates_i18n: { locale: string; title: string }[];
};

const UNIQUE_VIOLATION = "23505";

/**
 * Saves the onboarding choices for the signed-in user.
 *
 * Order matters: profile, then habits, then `onboarded_at` LAST, so a failure midway
 * leaves the user not onboarded and able to retry. Idempotent: habits that already
 * exist (active, same template) are not created again; the DB enforces this with the
 * partial unique index from migration 0006.
 */
export async function completeOnboarding(db: Db, input: OnboardingInput): Promise<void> {
  const { locale, timezone } = validate(input);
  const templateIds = [...new Set(input.habitTemplateIds)];
  const userId = await requireUserId(db);

  // display_name is left out on purpose: new rows get the column default (null),
  // existing rows keep their value.
  const { error: profileError } = await db
    .from("profiles")
    .upsert({ user_id: userId, locale, timezone }, { onConflict: "user_id" });
  throwIfError(profileError, "save profile");

  if (templateIds.length > 0) {
    const templates = await loadTemplates(db, templateIds);
    await createMissingHabits(db, userId, locale, templates);
  }

  const { error: doneError } = await db
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("user_id", userId);
  throwIfError(doneError, "mark onboarding complete");
}

function validate(input: OnboardingInput): { locale: AppLocale; timezone: string } {
  if (!APP_LOCALES.includes(input.locale)) {
    throw new Error(`completeOnboarding: unknown locale "${String(input.locale)}"`);
  }
  if (!isValidTimeZone(input.timezone)) {
    throw new Error(`completeOnboarding: invalid timezone "${String(input.timezone)}"`);
  }
  return { locale: input.locale, timezone: input.timezone };
}

async function loadTemplates(db: Db, ids: string[]): Promise<TemplateRow[]> {
  const { data, error } = await db
    .from("habit_templates")
    .select("id, pillar_id, kind, default_target, habit_templates_i18n(locale, title)")
    .in("id", ids);
  throwIfError(error, "load habit templates");
  const rows = (data ?? []) as TemplateRow[];
  const missing = ids.filter((id) => !rows.some((r) => r.id === id));
  if (missing.length > 0) {
    throw new Error(`completeOnboarding: unknown habit template(s) ${missing.join(", ")}`);
  }
  return rows;
}

async function existingTemplateIds(db: Db, userId: string, ids: string[]): Promise<Set<string>> {
  const { data, error } = await db
    .from("user_habits")
    .select("template_id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("template_id", ids);
  throwIfError(error, "load existing habits");
  return new Set(((data ?? []) as { template_id: string }[]).map((r) => r.template_id));
}

/**
 * Inserts the habits the user does not have yet. A PostgREST upsert cannot target the
 * partial unique index (ON CONFLICT needs its predicate), so this reads what exists
 * and inserts the rest; a concurrent duplicate (23505) triggers one re-read and retry.
 */
async function createMissingHabits(db: Db, userId: string, locale: AppLocale, templates: TemplateRow[]) {
  for (let attempt = 0; ; attempt++) {
    const existing = await existingTemplateIds(db, userId, templates.map((t) => t.id));
    const rows = templates.filter((t) => !existing.has(t.id)).map((t) => toUserHabit(t, userId, locale));
    if (rows.length === 0) return;
    const { error } = await db.from("user_habits").insert(rows);
    if (error?.code === UNIQUE_VIOLATION && attempt === 0) continue;
    throwIfError(error, "create habits");
    return;
  }
}

function toUserHabit(t: TemplateRow, userId: string, locale: AppLocale) {
  const title = t.habit_templates_i18n.find((i) => i.locale === locale)?.title;
  if (!title) throw new Error(`completeOnboarding: template ${t.id} has no "${locale}" title`);
  return {
    user_id: userId,
    template_id: t.id,
    pillar_id: t.pillar_id,
    title,
    kind: t.kind,
    target: t.default_target,
  };
}
