import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { BrandMark } from "./BrandMark";
import styles from "./footer.module.css";

/** Product name, a one-line summary and the PT/EN switch (plain links to /pt and /en). */
export function LandingFooter() {
  const t = useTranslations("landing.footer");
  const tCommon = useTranslations("common");
  const current = useLocale();
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <BrandMark />
          <span className={styles.name}>{tCommon("appName")}</span>
        </div>
        <p className={styles.tagline}>{t("tagline")}</p>
        <nav aria-label={t("language")}>
          <ul className={styles.languages}>
            {routing.locales.map((locale) => (
              <li key={locale}>
                <Link
                  href="/"
                  locale={locale}
                  lang={locale}
                  hrefLang={locale}
                  className={styles.language}
                  aria-current={locale === current ? "page" : undefined}
                >
                  {tCommon(`languages.${locale}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
