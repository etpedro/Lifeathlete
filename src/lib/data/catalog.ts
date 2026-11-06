import type { CatalogPillar } from "@/lib/onboarding/selection";
import type { Db } from "@/lib/supabase/types";
import { throwIfError } from "./errors";

type PillarRow = { id: string; slug: string; sort: number };
type TemplateRow = {
  id: string;
  pillar_id: string;
  sort: number;
  habit_templates_i18n: { locale: string; title: string }[];
};

const bySort = (a: { sort: number }, b: { sort: number }) => a.sort - b.sort;

/** Pillars (by sort) with their suggested habit templates, titled in both locales. */
export async function loadOnboardingCatalog(db: Db): Promise<CatalogPillar[]> {
  const [pillars, templates] = await Promise.all([
    db.from("pillars").select("id, slug, sort").order("sort"),
    db.from("habit_templates").select("id, pillar_id, sort, habit_templates_i18n(locale, title)").order("sort"),
  ]);
  throwIfError(pillars.error, "load pillars");
  throwIfError(templates.error, "load habit templates");

  const tpl = [...((templates.data ?? []) as TemplateRow[])].sort(bySort);
  return [...((pillars.data ?? []) as PillarRow[])].sort(bySort).map((p) => ({
    id: p.id,
    slug: p.slug,
    templates: tpl.filter((t) => t.pillar_id === p.id).map((t) => ({ id: t.id, title: titles(t) })),
  }));
}

function titles(t: TemplateRow): { pt: string; en: string } {
  const get = (locale: string) => t.habit_templates_i18n.find((i) => i.locale === locale)?.title;
  const pt = get("pt") ?? get("en") ?? "";
  const en = get("en") ?? pt;
  return { pt, en };
}
