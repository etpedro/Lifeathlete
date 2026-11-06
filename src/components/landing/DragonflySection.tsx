import { useTranslations } from "next-intl";
import { Mascot } from "@/components/mascot/Mascot";
import styles from "./dragonfly.module.css";
import section from "./section.module.css";

const STAGES = [1, 2, 3, 4, 5] as const;

/** The dragonfly's five stages, and the promise that it rests (never dies) during a break. */
export function DragonflySection() {
  const t = useTranslations("landing.dragonfly");
  return (
    <section className={`${section.section} ${section.band}`} aria-labelledby="landing-dragonfly">
      <div className={section.inner}>
        <div className={section.head}>
          <h2 id="landing-dragonfly" className={section.title}>
            {t("title")}
          </h2>
          <p className={section.lead}>{t("body")}</p>
        </div>
        <ol className={styles.stages} aria-label={t("stages")}>
          {STAGES.map((stage) => (
            <li key={stage} className={styles.stage} data-stage={stage}>
              <Mascot stage={stage} variant={stage === 5 ? "bright" : "normal"} description={t("stage", { stage })} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
