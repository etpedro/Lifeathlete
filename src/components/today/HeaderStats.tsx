import { useTranslations } from "next-intl";
import type { HeaderStats as Stats } from "@/lib/data/today";
import styles from "./today.module.css";

/** Level, XP and current streak at the top of Today. */
export function HeaderStats({ stats }: { stats: Stats }) {
  const t = useTranslations("today.stats");
  return (
    <section aria-label={t("label")}>
      <ul className={styles.stats}>
        <li>{t("level", { level: stats.level })}</li>
        <li>{t("xp", { xp: stats.xpTotal })}</li>
        <li>{t("streak", { count: stats.currentStreak })}</li>
      </ul>
    </section>
  );
}
