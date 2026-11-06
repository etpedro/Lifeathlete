import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { TodayHabit, TodayPillar } from "@/lib/data/today";
import { isComplete } from "@/lib/today/progress";
import { HabitRow } from "./HabitRow";
import styles from "./today.module.css";

type Props = {
  pillar: TodayPillar;
  pendingIds: ReadonlySet<string>;
  onSetValue: (habit: TodayHabit, value: number) => void;
};

/** A pillar's habits under a heading that collapses/expands the list. */
export function PillarGroup({ pillar, pendingIds, onSetValue }: Props) {
  const t = useTranslations("today.pillar");
  const tPillars = useTranslations("pillars");
  const [open, setOpen] = useState(true);
  const listId = useId();
  const done = pillar.habits.filter(isComplete).length;
  const name = tPillars.has(`${pillar.slug}.name`) ? tPillars(`${pillar.slug}.name`) : pillar.slug;

  return (
    <section className={styles.pillar}>
      <h2 className={styles.pillarHeading}>
        <button
          type="button"
          className={styles.pillarToggle}
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((o) => !o)}
        >
          <span>{name}</span>
          <span>{t("progress", { done, total: pillar.habits.length })}</span>
        </button>
      </h2>
      <ul id={listId} className={styles.habits} hidden={!open}>
        {pillar.habits.map((h) => (
          <HabitRow key={h.id} habit={h} pending={pendingIds.has(h.id)} onSetValue={onSetValue} />
        ))}
      </ul>
    </section>
  );
}
