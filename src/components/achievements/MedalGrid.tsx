import { useFormatter, useTranslations } from "next-intl";
import type { AchievementItem } from "@/lib/data/stats";
import styles from "./achievements.module.css";
import { XpBar } from "./XpBar";

/** Medals: unlocked (with date) and locked (with a progress bar only when progress is known). */
export function MedalGrid({ items, timeZone }: { items: AchievementItem[]; timeZone: string }) {
  const t = useTranslations("achievements");
  const tp = useTranslations("pillars");
  const format = useFormatter();
  const unlockDate = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    try {
      return format.dateTime(date, { dateStyle: "medium", timeZone });
    } catch {
      return format.dateTime(date, { dateStyle: "medium", timeZone: "UTC" });
    }
  };

  return (
    <ul className={styles.medals}>
      {items.map((a) => {
        const unlocked = a.unlockedAt !== null;
        const when = unlocked ? unlockDate(a.unlockedAt as string) : "";
        return (
          <li key={a.code} className={`${styles.medal} ${unlocked ? styles.medalUnlocked : styles.medalLocked}`} data-unlocked={unlocked}>
            <svg className={styles.medalIcon} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
              <circle className={unlocked ? styles.discUnlocked : styles.discLocked} cx="20" cy="22" r="13" strokeWidth="2" strokeDasharray={unlocked ? undefined : "4 3"} />
              {unlocked ? <path className={styles.check} d="M13 22l5 5 9-10" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /> : <path className={styles.lock} d="M16 20v-3a4 4 0 018 0v3M15 20h10v8H15z" strokeWidth="2" fill="none" strokeLinejoin="round" />}
            </svg>
            <h3>{a.title}</h3>
            {a.description && <p>{a.description}</p>}
            {a.pillarSlug && <p className={styles.muted}>{t("pillar", { pillar: tp(`${a.pillarSlug}.name`) })}</p>}
            <p className={styles.status}>{unlocked ? (when ? t("unlockedOn", { date: when }) : t("unlocked")) : t("locked")}</p>
            {a.progress && (
              <>
                <XpBar
                  label={a.title}
                  valueText={t("progress", { current: a.progress.current, target: a.progress.target })}
                  value={a.progress.current}
                  max={a.progress.target}
                />
                <p className={styles.muted}>{t("progress", { current: a.progress.current, target: a.progress.target })}</p>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
