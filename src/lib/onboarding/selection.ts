// Pure state transitions for the "choose pillars and habits" onboarding step.

export type CatalogTemplate = { id: string; title: { pt: string; en: string } };
export type CatalogPillar = { id: string; slug: string; templates: CatalogTemplate[] };

/** Active pillar ids, and template ids the user unchecked inside active pillars. */
export type Selection = { pillars: string[]; unchecked: string[] };

export function emptySelection(): Selection {
  return { pillars: [], unchecked: [] };
}

export function togglePillar(catalog: CatalogPillar[], s: Selection, pillarId: string): Selection {
  const ids = catalog.find((p) => p.id === pillarId)?.templates.map((t) => t.id) ?? [];
  const active = s.pillars.includes(pillarId);
  return {
    pillars: active ? s.pillars.filter((id) => id !== pillarId) : [...s.pillars, pillarId],
    // (de)activating resets the pillar's habits to "all suggested"
    unchecked: s.unchecked.filter((id) => !ids.includes(id)),
  };
}

export function toggleHabit(s: Selection, templateId: string): Selection {
  return {
    pillars: s.pillars,
    unchecked: s.unchecked.includes(templateId)
      ? s.unchecked.filter((id) => id !== templateId)
      : [...s.unchecked, templateId],
  };
}

export function isHabitChecked(s: Selection, pillarId: string, templateId: string): boolean {
  return s.pillars.includes(pillarId) && !s.unchecked.includes(templateId);
}

/** Template ids to create, in catalog order. */
export function selectedTemplateIds(catalog: CatalogPillar[], s: Selection): string[] {
  return catalog.flatMap((p) => p.templates.filter((t) => isHabitChecked(s, p.id, t.id)).map((t) => t.id));
}
