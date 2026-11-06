"use client";

import { useTranslations } from "next-intl";
import { remainingCount } from "@/lib/today/progress";
import { DayStrip } from "./DayStrip";
import { HeaderStats } from "./HeaderStats";
import { PillarGroup } from "./PillarGroup";
import styles from "./today.module.css";
import { useTodayController, type TodayControllerProps, type TodayNotice } from "./useTodayController";
import { XpToast } from "./XpToast";

const NOTICE_KEYS = { save: "errors.save", load: "errors.load", outsideWindow: "errors.outsideWindow" } as const;

/** The Today screen (spec §5): header stats, day picker, pillars with their habits. */
export function TodayView(props: TodayControllerProps) {
  const t = useTranslations("today");
  const tCommon = useTranslations("common");
  const c = useTodayController(props);

  const noticeText = (n: TodayNotice) =>
    n.kind === "dropped" ? t("errors.dropped", { count: n.count }) : t(NOTICE_KEYS[n.kind]);

  return (
    <main className={styles.screen}>
      <h1>{t("title")}</h1>
      <HeaderStats stats={c.stats} />
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
        <div role="alert" className={styles.notice}>
          <p>{noticeText(c.notice)}</p>
          {c.notice.kind === "load" && (
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
          <p aria-live="polite">{t("remaining", { count: remainingCount(c.data) })}</p>
          {c.data.pillars.map((p) => (
            <PillarGroup key={p.pillarId} pillar={p} pendingIds={c.pendingIds} onSetValue={c.setValue} />
          ))}
        </>
      )}

      {c.feedback && <XpToast feedback={c.feedback} onDismiss={c.dismissFeedback} />}
    </main>
  );
}
