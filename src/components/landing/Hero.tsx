import { useTranslations } from "next-intl";
import { CtaLink } from "./CtaLink";
import cta from "./cta.module.css";
import { HeroArt } from "./HeroArt";
import { HOW_IT_WORKS_ID } from "./HowItWorks";
import styles from "./hero.module.css";

/** The headline, the promise, the two calls to action and the illustration. */
export function Hero() {
  const t = useTranslations("landing.hero");
  return (
    <section className={styles.hero} aria-labelledby="landing-title">
      <div className={styles.inner}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>{t("eyebrow")}</p>
          <h1 id="landing-title" className={styles.title}>
            {t("title")}
          </h1>
          <p className={styles.subtitle}>{t("subtitle")}</p>
          <div className={styles.actions}>
            <CtaLink label={t("cta")} />
            <a href={`#${HOW_IT_WORKS_ID}`} className={`${cta.button} ${cta.secondary}`}>
              {t("more")}
            </a>
          </div>
          <p className={styles.note}>{t("note")}</p>
        </div>
        <HeroArt mascotLabel={t("mascot")} />
      </div>
    </section>
  );
}
