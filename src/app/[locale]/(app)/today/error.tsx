"use client";

import { useTranslations } from "next-intl";
import styles from "@/components/today/today.module.css";

/**
 * Hoje could not be loaded on the server (the page throws on purpose, so the response is
 * not a 200 and the service worker never stores it over a good offline copy). Localized,
 * no technical detail; `retry` re-fetches the page.
 */
export default function TodayError({ retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("today");
  const tCommon = useTranslations("common");
  return (
    <main className={styles.screen}>
      <h1>{t("title")}</h1>
      <div role="alert" className={styles.notice}>
        <p>{t("errors.page")}</p>
        <button type="button" className={styles.target} onClick={() => retry()}>
          {tCommon("errors.retry")}
        </button>
      </div>
    </main>
  );
}
