import { useTranslations } from "next-intl";
import { ShareButton, type ShareButtonProps } from "@/components/share/ShareButton";
import { Mascot } from "@/components/mascot/Mascot";
import type { AchievementItem, ProfileStats } from "@/lib/data/stats";
import ui from "@/components/ui/ui.module.css";
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
    <section className={`${ui.cardHero} ${styles.hero}`} aria-label={t("mascotLabel")}>
      <div className={styles.stage}>
        <Mascot stage={stats.mascot.stage} variant={stats.mascot.variant} resting={resting} description={description} />
      </div>
      {resting && <p className={styles.restingNote}>{t("resting")}</p>}
      <p className={styles.level}>
        <span>{t("level", { level: stats.level })}</span>
        <span className={`${ui.badge} ${ui.badgeGold}`} aria-hidden="true">
          {tier}
        </span>
      </p>
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

function FlameIcon() {
  return (
    <span className={`${styles.tileIcon} ${styles.tileFlame}`}>
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
        <path d="M12 2c1 3.2 4.5 5.4 4.5 9.6A4.5 4.5 0 0 1 12 16a4.5 4.5 0 0 1-4.5-4.4c0-1.6.7-2.8 1.6-3.8.2 1.2.8 1.9 1.6 2.2C10.3 7 10.7 4.4 12 2Zm0 20a6.5 6.5 0 0 1-6.5-6.5c0-1 .3-2 .8-2.9.6 1.6 1.9 2.7 3.2 3.2a5 5 0 0 0 5 1.1 5 5 0 0 0 3.5-4.2 6.5 6.5 0 0 1 .5 2.8A6.5 6.5 0 0 1 12 22Z" />
      </svg>
    </span>
  );
}

function TrophyIcon() {
  return (
    <span className={`${styles.tileIcon} ${styles.tileGold}`}>
      <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 4h8v6a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 14v4M8 20h8" />
      </svg>
    </span>
  );
}

function Streaks({ stats }: { stats: ProfileStats }) {
  const t = useTranslations("achievements");
  return (
    <ul className={styles.streaks}>
      <li className={ui.card}>
        <FlameIcon />
        <span className={styles.tileText}>
          <span>{t("streakCurrent")}</span>
          <span className={styles.streakValue}>{t("days", { count: stats.currentStreak })}</span>
        </span>
      </li>
      <li className={ui.card}>
        <TrophyIcon />
        <span className={styles.tileText}>
          <span>{t("streakBest")}</span>
          <span className={styles.streakValue}>{t("days", { count: stats.bestStreak })}</span>
        </span>
      </li>
    </ul>
  );
}
