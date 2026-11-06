import { useTranslations } from "next-intl";
import section from "./section.module.css";
import { StepArt, type StepKind } from "./StepArt";
import styles from "./how.module.css";

/** Anchor target of the hero's "See how it works" link. */
export const HOW_IT_WORKS_ID = "how-it-works";

const STEPS: StepKind[] = ["checkin", "progress", "balance"];

/** Three steps: check in, earn XP / levels / streaks, balance the wheel. */
export function HowItWorks() {
  const t = useTranslations("landing.how");
  return (
    <section id={HOW_IT_WORKS_ID} className={`${section.section} ${section.band} ${styles.anchor}`} aria-labelledby="landing-how">
      <div className={section.inner}>
        <div className={section.head}>
          <h2 id="landing-how" className={section.title}>
            {t("title")}
          </h2>
          <p className={section.lead}>{t("intro")}</p>
        </div>
        <ol className={styles.steps}>
          {STEPS.map((kind, i) => (
            <li key={kind} className={styles.step} data-step={kind}>
              <StepArt kind={kind} />
              <p className={styles.label}>{t("step", { number: i + 1 })}</p>
              <h3 className={styles.title}>{t(`${kind}.title`)}</h3>
              <p className={styles.body}>{t(`${kind}.body`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
