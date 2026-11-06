import { useTranslations } from "next-intl";
import { BrandMark } from "./BrandMark";
import styles from "./brand.module.css";

/** The page banner: just the product name (the calls to action live in the hero and at the end). */
export function LandingHeader() {
  const t = useTranslations("common");
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <BrandMark />
        <span className={styles.name}>{t("appName")}</span>
      </div>
    </header>
  );
}
