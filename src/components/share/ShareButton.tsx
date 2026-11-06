"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { buildShareInput, runShare, shareCard, type ShareStatus } from "@/lib/data/share";
import type { SummaryCardLabels, SummaryCardStats } from "../../../supabase/functions/weekly-summary/summary.ts";
import styles from "./share.module.css";

/** Presentational part: a button plus a polite status region. All copy arrives via `t`. */
export function ShareButtonView({
  status,
  onShare,
  t,
}: {
  status: ShareStatus;
  onShare: () => void;
  t: (key: "button" | "working" | "shared" | "downloaded" | "failed") => string;
}) {
  const working = status === "working";
  const message = status === "shared" ? t("shared") : status === "downloaded" ? t("downloaded") : status === "error" ? t("failed") : "";
  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.button} onClick={onShare} aria-busy={working} disabled={working}>
        {working ? t("working") : t("button")}
      </button>
      <p role="status" className={styles.status}>
        {message}
      </p>
    </div>
  );
}

export type ShareButtonProps = {
  stats: SummaryCardStats;
  labels: SummaryCardLabels;
  locale: "pt" | "en";
};

/** Shares the summary card (level, streak, wheel only) via Web Share or a PNG download. */
export function ShareButton({ stats, labels, locale }: ShareButtonProps) {
  const t = useTranslations("share");
  const [status, setStatus] = useState<ShareStatus>("idle");

  async function onShare() {
    setStatus("working");
    const input = buildShareInput(stats, labels, locale, { title: t("title"), text: t("text") });
    setStatus(await runShare(() => shareCard(input)));
  }

  return <ShareButtonView status={status} onShare={() => void onShare()} t={(k) => t(k)} />;
}
