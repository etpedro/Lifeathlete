import { useTranslations } from "next-intl";
import { isHabitChecked, type CatalogPillar, type Selection } from "@/lib/onboarding/selection";
import styles from "./onboarding.module.css";

type Props = {
  pillar: CatalogPillar;
  locale: "pt" | "en";
  selection: Selection;
  onTogglePillar: () => void;
  onToggleHabit: (templateId: string) => void;
};

/** One pillar: an activation checkbox and, when active, its suggested habits. */
export function PillarChoice({ pillar, locale, selection, onTogglePillar, onToggleHabit }: Props) {
  const t = useTranslations("onboarding.choose");
  const tPillars = useTranslations("pillars");
  const active = selection.pillars.includes(pillar.id);
  return (
    <li className={styles.pillar}>
      <label className={styles.choice}>
        <input type="checkbox" checked={active} onChange={onTogglePillar} />
        {tPillars(`${pillar.slug}.name`)}
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
