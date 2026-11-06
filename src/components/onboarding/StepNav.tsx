import { useTranslations } from "next-intl";

type Props = { onBack?: () => void; onNext: () => void; nextDisabled?: boolean; nextLabel?: string };

export function StepNav({ onBack, onNext, nextDisabled, nextLabel }: Props) {
  const t = useTranslations("common");
  return (
    <nav>
      {onBack && (
        <button type="button" onClick={onBack}>
          {t("back")}
        </button>
      )}
      <button type="button" onClick={onNext} disabled={nextDisabled}>
        {nextLabel ?? t("next")}
      </button>
    </nav>
  );
}
