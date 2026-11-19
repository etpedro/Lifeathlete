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
            <span className={styles.medallion}>
              <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {unlocked ? <path d="M5 12.5l4.5 4.5L19 7" /> : <path d="M8 11V8a4 4 0 018 0v3M6 11h12v9H6z" />}
              </svg>
            </span>
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
