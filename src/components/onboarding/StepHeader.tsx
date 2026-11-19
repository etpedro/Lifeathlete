import { useTranslations } from "next-intl";
import styles from "./onboarding.module.css";

/** Calm stepper: a row of progress dots (decorative) above the "Step x of y" text and the title. */
export function StepHeader({ current, total, title }: { current: number; total: number; title: string }) {
  const t = useTranslations("onboarding");
  return (
    <header className={styles.header}>
      <div className={styles.dots} aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={styles.dot} data-step-dot="" data-state={i + 1 < current ? "done" : i + 1 === current ? "current" : "todo"} />
        ))}
      </div>
      <p className={styles.step}>{t("stepOf", { current, total })}</p>
      <h1>{title}</h1>
    </header>
  );
}
