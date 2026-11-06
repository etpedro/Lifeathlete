import { useTranslations } from "next-intl";
import { ShareButton, type ShareButtonProps } from "@/components/share/ShareButton";
import { Mascot } from "@/components/mascot/Mascot";
import type { AchievementItem, ProfileStats } from "@/lib/data/stats";
import styles from "./achievements.module.css";
import { MedalGrid } from "./MedalGrid";
import { XpBar } from "./XpBar";

export type AchievementsViewProps = {
  stats: ProfileStats | null;
  medals: AchievementItem[] | null;
  resting: boolean;
  timeZone: string;
  /** Props for the share button; omitted when there is nothing to share. */
  share?: ShareButtonProps | null;
};

/** Presentational Achievements screen: level, XP, mascot, streaks and medals. */
export function AchievementsView({ stats, medals, resting, timeZone, share }: AchievementsViewProps) {
  const t = useTranslations("achievements");
  return (
    <main className={styles.screen}>
      <h1>{t("title")}</h1>
      {stats ? (
        <Hero stats={stats} resting={resting} />
      ) : (
        <p role="alert" className={styles.alert}>
          {t("loadError")}
        </p>
      )}
      {stats && <Streaks stats={stats} />}
      {share && <ShareButton {...share} />}
      <section aria-labelledby="medals-heading" className={styles.medalsSection}>
        <h2 id="medals-heading">{t("medals")}</h2>
        {medals ? (
          <MedalGrid items={medals} timeZone={timeZone} />
        ) : (
          <p role="alert" className={styles.alert}>
            {t("loadError")}
          </p>
        )}
      </section>
    </main>
  );
}

function Hero({ stats, resting }: { stats: ProfileStats; resting: boolean }) {
  const t = useTranslations("achievements");
  const tier = t(`tier.${Math.min(5, Math.max(1, stats.tier))}`);
  const xpText = t("xp", { into: stats.xpIntoLevel, next: stats.xpForNext });
  const description = resting
    ? t("restingDescription", { stage: stats.mascot.stage })
    : t("mascotDescription", { stage: stats.mascot.stage, variant: t(`variant.${stats.mascot.variant}`) });
  return (
    <section className={styles.hero} aria-label={t("mascotLabel")}>
      <Mascot stage={stats.mascot.stage} variant={stats.mascot.variant} resting={resting} description={description} />
      {resting && <p className={styles.restingNote}>{t("resting")}</p>}
      <p className={styles.level}>{t("level", { level: stats.level })}</p>
      <p className={styles.tier}>
        {t("tierLabel")}: {tier}
      </p>
      <div className={styles.xp}>
        <XpBar label={t("xpLabel")} valueText={xpText} value={stats.xpIntoLevel} max={stats.xpForNext} />
        <span>{xpText}</span>
      </div>
    </section>
  );
}

function Streaks({ stats }: { stats: ProfileStats }) {
  const t = useTranslations("achievements");
  return (
    <ul className={styles.streaks}>
      <li>
        <span>{t("streakCurrent")}</span>
        <span className={styles.streakValue}>{t("days", { count: stats.currentStreak })}</span>
      </li>
      <li>
        <span>{t("streakBest")}</span>
        <span className={styles.streakValue}>{t("days", { count: stats.bestStreak })}</span>
      </li>
    </ul>
  );
}
