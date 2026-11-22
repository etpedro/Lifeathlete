import { useTranslations } from "next-intl";
import styles from "./privacy.module.css";

const SECTIONS = ["reads", "stores", "kept", "unverified", "control"] as const;

/** Static text of the public health-privacy page (what the app reads and stores from Health Connect). */
export function PrivacyHealthView({ backHref }: { backHref: string }) {
  const t = useTranslations("privacyHealth");
  return (
    <main className={styles.page}>
      <header>
        <h1>{t("title")}</h1>
        <p className={styles.lead}>{t("intro")}</p>
      </header>
      <div className={styles.card}>
        {SECTIONS.map((key) => (
          <section key={key} className={styles.section}>
            <h2>{t(`headings.${key}`)}</h2>
            <p>{t(key)}</p>
          </section>
        ))}
      </div>
      <p>
        <a className={styles.back} href={backHref}>
          {t("back")}
        </a>
      </p>
    </main>
  );
}
