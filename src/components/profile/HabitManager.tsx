"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ManageablePillar, PillarOption } from "@/lib/data/habits";
import { AddHabitForm } from "./AddHabitForm";
import { HabitItem } from "./HabitItem";
import styles from "./profile.module.css";
import { useHabitManager } from "./useHabitManager";

type Props = {
  userId: string;
  /** The user's IANA timezone (pause intervals are recorded in their local day). */
  timezone: string;
  initial: ManageablePillar[] | null;
  pillarOptions: PillarOption[];
};

/** Habit management (spec §5 Perfil): habits by pillar plus the "add custom habit" form. */
export function HabitManager({ userId, timezone, initial, pillarOptions }: Props) {
  const t = useTranslations("profile");
  const tCommon = useTranslations("common");
  const tPillars = useTranslations("pillars");
  const m = useHabitManager(userId, timezone, initial);
  const pillarName = (slug: string) => (tPillars.has(`${slug}.name`) ? tPillars(`${slug}.name`) : slug);

  return (
    <main className={styles.screen}>
      <Link href="/profile" className={styles.link}>
        {t("habits.back")}
      </Link>
      <h1>{t("habits.title")}</h1>
      <p>{t("habits.intro")}</p>

      <p role="status" className={styles.status}>
        {m.status ? t(m.status) : ""}
      </p>

      {m.loadFailed && (
        <div role="alert">
          <p className={styles.error}>{t("habits.load")}</p>
          <button type="button" className={styles.button} onClick={() => void m.reload()}>
            {tCommon("errors.retry")}
          </button>
        </div>
      )}

      {m.pillars === null ? (
        !m.loadFailed && <p aria-busy="true">{tCommon("loading")}</p>
      ) : m.pillars.length === 0 ? (
        !m.loadFailed && <p>{t("habits.empty")}</p>
      ) : (
        m.pillars.map((p) => (
          <section key={p.pillarId} className={styles.pillar}>
            <h2 className={styles.pillarHeading}>{pillarName(p.slug)}</h2>
            <ul className={styles.habits}>
              {p.habits.map((h) => (
                <HabitItem
                  key={h.id}
                  habit={h}
                  busy={m.busy}
                  onSetActive={m.setActive}
                  onSaveTarget={m.saveTarget}
                  onArchive={m.archive}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      <AddHabitForm pillars={pillarOptions} busy={m.busy} onCreate={m.create} />
    </main>
  );
}
