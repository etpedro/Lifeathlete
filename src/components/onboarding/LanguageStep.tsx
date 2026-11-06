"use client";

import { useLocale, useTranslations } from "next-intl";
import { routing } from "@/i18n/routing";
import { usePathname, useRouter } from "@/i18n/navigation";
import styles from "./onboarding.module.css";

type Props = { timezone: string; timezoneValid: boolean; onTimezoneChange: (value: string) => void };

/** Step 1: language (switches the URL locale) and the detected, editable time zone. */
export function LanguageStep({ timezone, timezoneValid, onTimezoneChange }: Props) {
  const t = useTranslations("onboarding.language");
  const tLang = useTranslations("common.languages");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <section className={styles.section}>
      <p className={styles.muted}>{t("description")}</p>
      <fieldset className={styles.fieldset}>
        <legend>{t("title")}</legend>
        {routing.locales.map((l) => (
          <label key={l} className={styles.choice}>
            <input
              type="radio"
              name="locale"
              value={l}
              checked={l === locale}
              onChange={() => router.replace(pathname, { locale: l })}
            />
            {tLang(l)}
          </label>
        ))}
      </fieldset>
      <label className={styles.field}>
        {t("timezone")}
        <input value={timezone} onChange={(e) => onTimezoneChange(e.target.value)} aria-invalid={!timezoneValid} />
      </label>
      <p className={timezoneValid ? styles.muted : styles.hintError}>{timezoneValid ? t("timezoneHint") : t("invalidTimezone")}</p>
    </section>
  );
}
