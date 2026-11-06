"use client";

import { useLocale } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/lib/data/onboarding";
import { completeOnboarding } from "@/lib/data/onboarding";
import { createClient } from "@/lib/supabase/client";

/** Saves the onboarding choices, then goes to Today in the same locale. */
export function useFinishOnboarding() {
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function finish(timezone: string, habitTemplateIds: string[]) {
    setSaving(true);
    setFailed(false);
    try {
      await completeOnboarding(createClient(), { locale, timezone: timezone.trim(), habitTemplateIds });
      router.replace("/today");
      router.refresh();
    } catch {
      setFailed(true);
      setSaving(false);
    }
  }

  return { finish, saving, failed };
}
