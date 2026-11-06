"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { routing } from "@/i18n/routing";
import { usePathname, useRouter } from "@/i18n/navigation";
import { setProfileLocale, type ProfileLocale } from "@/lib/data/profile";
import { runLocaleSwitch, type LocaleSwitchStatus } from "@/lib/profile/locale-switch";
import { createClient } from "@/lib/supabase/client";
import styles from "./profile.module.css";

type Labels = { title: string; working: string; failed: string; language: (l: ProfileLocale) => string };

/** Presentational part: one radio per locale plus an alert region for errors. All copy arrives via `labels`. */
export function LanguageSwitchView({
  locale,
  status,
  onChoose,
  labels,
}: {
  locale: string;
  status: LocaleSwitchStatus;
  onChoose: (l: ProfileLocale) => void;
  labels: Labels;
}) {
  const working = status === "working";
  return (
    <fieldset className={`${styles.field} ${styles.card}`} aria-busy={working} disabled={working}>
      <legend>{labels.title}</legend>
      {routing.locales.map((l) => (
        <label key={l} className={styles.radioLabel}>
          <input
            type="radio"
            className={styles.radio}
            name="profile-locale"
            value={l}
            lang={l}
            checked={l === locale}
            onChange={() => onChoose(l)}
          />
          {labels.language(l)}
        </label>
      ))}
      <p role="status">{working ? labels.working : ""}</p>
      <p role="alert" className={styles.error}>
        {status === "error" ? labels.failed : ""}
      </p>
    </fieldset>
  );
}

/** Perfil "Idioma" (spec §5): stores profiles.locale, then switches the URL locale on the same page. */
export function LanguageSwitch({ userId }: { userId: string }) {
  const t = useTranslations("profile.language");
  const tLang = useTranslations("common.languages");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<LocaleSwitchStatus>("idle");

  async function choose(next: ProfileLocale) {
    setStatus("working");
    const result = await runLocaleSwitch(next, locale, {
      save: () => setProfileLocale(createClient(), userId, next),
      navigate: () => router.replace(pathname, { locale: next }),
    });
    setStatus(result === "error" ? "error" : "idle");
  }

  return (
    <LanguageSwitchView
      locale={locale}
      status={status}
      onChoose={(l) => void choose(l)}
      labels={{ title: t("title"), working: t("working"), failed: t("failed"), language: (l) => tLang(l) }}
    />
  );
}
