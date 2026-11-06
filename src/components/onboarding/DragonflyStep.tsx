import { useTranslations } from "next-intl";
import { Dragonfly } from "./Dragonfly";
import styles from "./onboarding.module.css";

/** Step 4 (spec step 5): meet the dragonfly. Finishing saves and goes to the first check-in. */
export function DragonflyStep({ failed }: { failed: boolean }) {
  const t = useTranslations("onboarding.dragonfly");
  const tErrors = useTranslations("common.errors");
  return (
    <section className={styles.section}>
      <div className={styles.mascot}>
        <Dragonfly />
      </div>
      <p>{t("description")}</p>
      {failed && (
        <p role="alert" className={styles.alert}>
          {tErrors("saveOnboarding")}
        </p>
      )}
    </section>
  );
}
