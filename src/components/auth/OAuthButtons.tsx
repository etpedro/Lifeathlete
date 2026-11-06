"use client";

import type { Provider } from "@supabase/supabase-js";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authCallbackUrl } from "./callbackUrl";

const PROVIDERS = [
  { id: "google", label: "google" },
  { id: "apple", label: "apple" },
] as const satisfies { id: Provider; label: string }[];

/** "Continue with Google/Apple": redirects to the provider, back to /{locale}/auth/callback. */
export function OAuthButtons() {
  const t = useTranslations("onboarding.login");
  const tErrors = useTranslations("common.errors");
  const locale = useLocale();
  const [failed, setFailed] = useState(false);

  async function signIn(provider: Provider) {
    setFailed(false);
    try {
      const { error } = await createClient().auth.signInWithOAuth({
        provider,
        options: { redirectTo: authCallbackUrl(locale) },
      });
      if (error) setFailed(true);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div>
      {PROVIDERS.map((p) => (
        <button key={p.id} type="button" onClick={() => signIn(p.id)}>
          {t(p.label)}
        </button>
      ))}
      {failed && <p role="alert">{tErrors("oauth")}</p>}
    </div>
  );
}
