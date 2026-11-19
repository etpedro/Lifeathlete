import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { PillarIcon } from "@/components/ui/PillarIcon";
import { pillarColor } from "@/lib/pillars";
import { isHabitChecked, type CatalogPillar, type Selection } from "@/lib/onboarding/selection";
import styles from "./onboarding.module.css";

type Props = {
  pillar: CatalogPillar;
  locale: "pt" | "en";
  selection: Selection;
  onTogglePillar: () => void;
  onToggleHabit: (templateId: string) => void;
};

/** One pillar: a colorful selectable tile (a real checkbox) and, when active, its suggested habits. */
export function PillarChoice({ pillar, locale, selection, onTogglePillar, onToggleHabit }: Props) {
  const t = useTranslations("onboarding.choose");
  const tPillars = useTranslations("pillars");
  const active = selection.pillars.includes(pillar.id);
  return (
    <li className={styles.pillar} style={{ "--pillar": pillarColor(pillar.slug) } as CSSProperties}>
      <label className={styles.tile}>
        <input type="checkbox" className={styles.tileInput} checked={active} onChange={onTogglePillar} />
        <span className={styles.tileIcon}>
          <PillarIcon slug={pillar.slug} />
        </span>
        <span className={styles.tileName}>{tPillars(`${pillar.slug}.name`)}</span>
        {/* The selected state is a check mark + a thicker ring, never color alone. */}
        <span className={styles.tileMark} aria-hidden="true">
          {active && (
            <svg data-check="" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          )}
        </span>
      </label>
      {active && (
        <fieldset className={styles.fieldset}>
          <legend>{t("habits")}</legend>
          {pillar.templates.map((tpl) => (
            <label key={tpl.id} className={styles.choice}>
              <input
                type="checkbox"
                checked={isHabitChecked(selection, pillar.id, tpl.id)}
                onChange={() => onToggleHabit(tpl.id)}
              />
              {tpl.title[locale]}
            </label>
          ))}
        </fieldset>
      )}
    </li>
  );
}
