import { useLocale, useTranslations } from "next-intl";
import section from "./section.module.css";
import styles from "./seeIt.module.css";

/** Real app screens (390x844 at 2x, dark theme, sample data) committed under public/landing/. */
export const SCREEN_WIDTH = 390;
export const SCREEN_HEIGHT = 844;
const SCREENS = ["today", "wheel"] as const;

export function screenSrc(screen: (typeof SCREENS)[number], locale: string): string {
  return `/landing/${screen}-${locale === "en" ? "en" : "pt"}.webp`;
}

/** Two real screens (Hoje and Roda) in CSS phone frames. */
export function SeeIt() {
  const t = useTranslations("landing.see");
  const locale = useLocale();
  return (
    <section className={section.section} aria-labelledby="landing-see">
      <div className={section.inner}>
        <div className={section.head}>
          <h2 id="landing-see" className={section.title}>
            {t("title")}
          </h2>
          <p className={section.lead}>{t("intro")}</p>
        </div>
        <div className={styles.phones}>
          {SCREENS.map((screen) => (
            <figure key={screen} className={styles.figure} data-screen={screen}>
              <div className={styles.phone}>
                {/* A plain <img>: next/image would add client code for two static, lazy images. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={styles.screen}
                  src={screenSrc(screen, locale)}
                  alt={t(`${screen}.alt`)}
                  width={SCREEN_WIDTH}
                  height={SCREEN_HEIGHT}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <figcaption className={styles.caption}>{t(`${screen}.caption`)}</figcaption>
            </figure>
          ))}
        </div>
        <p className={styles.sample}>{t("sample")}</p>
      </div>
    </section>
  );
}
