import { useTranslations } from "next-intl";
import type { HeaderStats } from "@/lib/data/today";
import { levelFromXp } from "../../../supabase/functions/_shared/engine/levels.ts";
import { ProgressRing } from "@/components/ui/ProgressRing";
import ui from "@/components/ui/ui.module.css";
import styles from "./today.module.css";

type Props = { stats: HeaderStats; done: number; total: number; dayLabel: string; loading?: boolean };

function FlameIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="currentColor" className={styles.flame}>
      <path d="M12 2c1 3.2 4.5 5.4 4.5 9.6A4.5 4.5 0 0 1 12 16a4.5 4.5 0 0 1-4.5-4.4c0-1.6.7-2.8 1.6-3.8.2 1.2.8 1.9 1.6 2.2C10.3 7 10.7 4.4 12 2Zm0 20a6.5 6.5 0 0 1-6.5-6.5c0-1 .3-2 .8-2.9.6 1.6 1.9 2.7 3.2 3.2a5 5 0 0 0 5 1.1 5 5 0 0 0 3.5-4.2 6.5 6.5 0 0 1 .5 2.8A6.5 6.5 0 0 1 12 22Z" />
    </svg>
  );
}

/** The Today hero card: progress ring for the selected day, level, tier, XP bar and streak. */
export function TodayHero({ stats, done, total, dayLabel, loading = false }: Props) {
  const t = useTranslations("today");
  const tAch = useTranslations("achievements");
  const lvl = levelFromXp(stats.xpTotal);
  const xpPercent = Math.min(100, Math.max(0, (lvl.xpIntoLevel / lvl.xpForNext) * 100));
  const safeDone = Math.max(0, Math.min(Number.isFinite(done) ? done : 0, total > 0 ? total : 0));
  return (
    <section aria-label={t("stats.label")} className={`${ui.cardHero} ${styles.hero}`}>
      <ProgressRing
        done={loading ? 0 : done}
        total={loading ? 0 : total}
        label={loading ? t("ring.loading") : t("ring.label", { done: safeDone, total })}
        size={112}
      >
        {loading ? (
          <span className={styles.ringDone} aria-hidden="true">
            —
          </span>
        ) : (
          <span className={styles.ringDone}>
            {safeDone}
            <small className={styles.ringOf}>{t("ring.of", { total, day: dayLabel })}</small>
          </span>
        )}
      </ProgressRing>
      <div className={styles.heroInfo}>
        <p className={styles.level}>
          <span>{t("stats.level", { level: lvl.level })}</span>
          <span className={`${ui.badge} ${ui.badgeGold}`}>{tAch(`tier.${lvl.tier}`)}</span>
        </p>
        <div className={ui.track} aria-hidden="true">
          <div className={ui.trackFill} style={{ width: `${xpPercent}%` }} />
        </div>
        <p className={styles.xpText}>{tAch("xp", { into: lvl.xpIntoLevel, next: lvl.xpForNext })}</p>
        <p className={styles.streakLine}>
          <FlameIcon />
          <span>{t("stats.streak", { count: stats.currentStreak })}</span>
        </p>
      </div>
    </section>
  );
}
