import { useTranslations } from "next-intl";
import styles from "./onboarding.module.css";

export function StepHeader({ current, total, title }: { current: number; total: number; title: string }) {
  const t = useTranslations("onboarding");
  return (
    <header className={styles.header}>
      <p className={styles.step}>{t("stepOf", { current, total })}</p>
      <h1>{title}</h1>
    </header>
  );
}
