import { useTranslations } from "next-intl";
import { Dragonfly } from "./Dragonfly";

/** Step 4 (spec step 5): meet the dragonfly. Finishing saves and goes to the first check-in. */
export function DragonflyStep({ failed }: { failed: boolean }) {
  const t = useTranslations("onboarding.dragonfly");
  const tErrors = useTranslations("common.errors");
  return (
    <section>
      <Dragonfly />
      <p>{t("description")}</p>
      {failed && <p role="alert">{tErrors("saveOnboarding")}</p>}
    </section>
  );
}
