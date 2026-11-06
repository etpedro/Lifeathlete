import { useTranslations } from "next-intl";
import { PILLAR_SLUGS } from "@/lib/onboarding/pillars";
import styles from "./onboarding.module.css";

/** Step 2: introduces the 10 pillars. */
export function PillarsIntroStep() {
  const t = useTranslations("onboarding.intro");
  const tPillars = useTranslations("pillars");
  return (
    <section className={styles.section}>
      <p className={styles.muted}>{t("description")}</p>
      <ol className={styles.list}>
        {PILLAR_SLUGS.map((slug) => (
          <li key={slug} className={styles.introItem}>
            <strong>{tPillars(`${slug}.name`)}</strong>
            <p>{tPillars(`${slug}.description`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
