import { useTranslations } from "next-intl";

export function StepHeader({ current, total, title }: { current: number; total: number; title: string }) {
  const t = useTranslations("onboarding");
  return (
    <header>
      <p>{t("stepOf", { current, total })}</p>
      <h1>{title}</h1>
    </header>
  );
}
