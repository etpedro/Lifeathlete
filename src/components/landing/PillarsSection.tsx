import { useTranslations } from "next-intl";
import { PILLAR_SLUGS, PillarIcon } from "./PillarIcon";
import styles from "./pillars.module.css";
import section from "./section.module.css";

const TONES = ["primary", "secondary", "gold"] as const;

/** The 10 pillars, numbered like the Wheel's axes, with their names and descriptions. */
export function PillarsSection() {
  const t = useTranslations("landing.pillars");
  const tp = useTranslations("pillars");
  return (
    <section className={section.section} aria-labelledby="landing-pillars">
      <div className={section.inner}>
        <div className={section.head}>
          <h2 id="landing-pillars" className={section.title}>
            {t("title")}
          </h2>
          <p className={section.lead}>{t("intro")}</p>
        </div>
        <ul className={styles.grid}>
          {PILLAR_SLUGS.map((slug, i) => (
            <li key={slug} className={`${styles.card} ${styles[TONES[i % TONES.length]]}`}>
              <span className={styles.badge}>
                <PillarIcon slug={slug} className={styles.icon} />
              </span>
              <span className={styles.number} aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className={styles.name}>{tp(`${slug}.name`)}</h3>
              <p className={styles.description}>{tp(`${slug}.description`)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
