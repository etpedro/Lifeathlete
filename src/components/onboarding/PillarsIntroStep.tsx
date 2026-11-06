import { useTranslations } from "next-intl";
import { PILLAR_SLUGS } from "@/lib/onboarding/pillars";

/** Step 2: introduces the 10 pillars. */
export function PillarsIntroStep() {
  const t = useTranslations("onboarding.intro");
  const tPillars = useTranslations("pillars");
  return (
    <section>
      <p>{t("description")}</p>
      <ol>
        {PILLAR_SLUGS.map((slug) => (
          <li key={slug}>
            <strong>{tPillars(`${slug}.name`)}</strong>
            <p>{tPillars(`${slug}.description`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
