import { useTranslations } from "next-intl";
import styles from "./onboarding.module.css";

type Props = { onBack?: () => void; onNext: () => void; nextDisabled?: boolean; nextLabel?: string };

export function StepNav({ onBack, onNext, nextDisabled, nextLabel }: Props) {
  const t = useTranslations("common");
  return (
    <nav className={styles.nav}>
      {onBack && (
        <button type="button" onClick={onBack}>
          {t("back")}
        </button>
      )}
      <button type="button" className={styles.next} onClick={onNext} disabled={nextDisabled}>
        {nextLabel ?? t("next")}
      </button>
    </nav>
  );
}
