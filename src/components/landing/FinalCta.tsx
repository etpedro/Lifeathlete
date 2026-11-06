import { useTranslations } from "next-intl";
import { CtaLink } from "./CtaLink";
import styles from "./final.module.css";

/** The closing call to action. */
export function FinalCta() {
  const t = useTranslations("landing.final");
  return (
    <section className={styles.final} aria-labelledby="landing-final">
      <div className={styles.inner}>
        <h2 id="landing-final" className={styles.title}>
          {t("title")}
        </h2>
        <p className={styles.body}>{t("body")}</p>
        <CtaLink label={t("cta")} />
      </div>
    </section>
  );
}
