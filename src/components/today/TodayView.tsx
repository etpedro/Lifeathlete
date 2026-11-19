"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { greetingKey } from "@/lib/today/greeting";
import { hourIn } from "@/lib/today/dates";
import { isComplete, remainingCount } from "@/lib/today/progress";
import { DayStrip } from "./DayStrip";
import { PillarGroup } from "./PillarGroup";
import { dayNumber } from "../../../supabase/functions/_shared/engine/streaks.ts";
import { TodayHero } from "./TodayHero";
import styles from "./today.module.css";
import { noticeRole, type TodayNotice } from "./notices";
import { useTodayController, type TodayControllerProps } from "./useTodayController";
import { XpToast } from "./XpToast";

const NOTICE_KEYS = {
  save: "errors.save",
  load: "errors.load",
  fallback: "errors.fallback",
  fallbackStale: "errors.fallbackStale",
  rolledOver: "errors.rolledOver",
  outsideWindow: "errors.outsideWindow",
} as const;

const subscribeNothing = () => () => {};

const DAY_KEYS = ["today", "yesterday", "twoDaysAgo"] as const;

/** The Today screen (spec §5): greeting, hero, day picker, pillars with their habits. */
export function TodayView(props: TodayControllerProps) {
  const t = useTranslations("today");
  const tCommon = useTranslations("common");
  const c = useTodayController(props);
  const locale = useLocale();

  // The hour depends on the client clock: null on the server and during hydration, the key once mounted.
  const greeting = useSyncExternalStore(
    subscribeNothing,
    () => greetingKey(hourIn(props.timezone)),
    () => null,
  );

  const dateText = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: props.timezone,
  }).format(new Date(`${c.today}T12:00:00Z`));

  const habits = c.data?.pillars.flatMap((p) => p.habits) ?? [];
  const total = habits.length;
  const done = habits.filter(isComplete).length;
  const daysAgo = Math.min(Math.max(dayNumber(c.today) - dayNumber(c.date), 0), DAY_KEYS.length - 1);

  const noticeText = (n: TodayNotice) =>
    n.kind === "dropped" ? t("errors.dropped", { count: n.count }) : t(NOTICE_KEYS[n.kind]);

  return (
    <main className={styles.screen}>
      <header className={styles.top}>
        <p className={styles.greeting}>{greeting ? `${t(`greeting.${greeting}`)} · ${dateText}` : dateText}</p>
        <h1>{t("title")}</h1>
      </header>
      <TodayHero stats={c.stats} done={done} total={total} dayLabel={t(`ring.day.${DAY_KEYS[daysAgo]}`)} />
      <DayStrip today={c.today} selected={c.date} onSelect={c.selectDay} />

      {!c.online && (
        <p role="status" className={styles.notice}>
          {t("offline")}
        </p>
      )}
      {c.statsFailed && (
        <p role="status" className={styles.notice}>
          {t("errors.stats")}
        </p>
      )}
      {c.notice && (
        <div role={noticeRole(c.notice)} className={styles.notice}>
          <p>{noticeText(c.notice)}</p>
          {(c.notice.kind === "load" || c.notice.kind === "fallback" || c.notice.kind === "fallbackStale") && (
            <button type="button" className={styles.target} onClick={c.retry}>
              {tCommon("errors.retry")}
            </button>
          )}
        </div>
      )}

      {c.data === null ? (
        c.notice?.kind !== "load" && <p aria-busy="true">{tCommon("loading")}</p>
      ) : c.data.pillars.length === 0 ? (
        <p>{t("empty")}</p>
      ) : (
        <>
          <p aria-live="polite" className={styles.remaining}>{t("remaining", { count: remainingCount(c.data) })}</p>
          {c.data.pillars.map((p) => (
            <PillarGroup key={p.pillarId} pillar={p} pendingIds={c.pendingIds} onSetValue={c.setValue} />
          ))}
        </>
      )}

      {c.feedback && <XpToast feedback={c.feedback} onDismiss={c.dismissFeedback} />}
    </main>
  );
}
