"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  selectedTemplateIds,
  toggleHabit,
  togglePillar,
  type CatalogPillar,
  type Selection,
} from "@/lib/onboarding/selection";
import { PillarChoice } from "./PillarChoice";

type Props = {
  catalog: CatalogPillar[] | null;
  failed: boolean;
  onRetry: () => void;
  selection: Selection;
  onChange: (next: Selection) => void;
};

/** Step 3: pick pillars (none is fine) and confirm their suggested habits. */
export function ChoosePillarsStep({ catalog, failed, onRetry, selection, onChange }: Props) {
  const t = useTranslations("onboarding.choose");
  const tCommon = useTranslations("common");
  const locale = useLocale() === "en" ? "en" : "pt";

  if (failed) {
    return (
      <section>
        <p role="alert">{tCommon("errors.loadCatalog")}</p>
        <button type="button" onClick={onRetry}>
          {tCommon("errors.retry")}
        </button>
      </section>
    );
  }
  if (!catalog) return <p role="status">{tCommon("loading")}</p>;

  const count = selectedTemplateIds(catalog, selection).length;
  return (
    <section>
      <p>{t("description")}</p>
      <ul>
        {catalog.map((pillar) => (
          <PillarChoice
            key={pillar.id}
            pillar={pillar}
            locale={locale}
            selection={selection}
            onTogglePillar={() => onChange(togglePillar(catalog, selection, pillar.id))}
            onToggleHabit={(id) => onChange(toggleHabit(selection, id))}
          />
        ))}
      </ul>
      <p role="status">{selection.pillars.length === 0 ? t("none") : t("selected", { count })}</p>
    </section>
  );
}
