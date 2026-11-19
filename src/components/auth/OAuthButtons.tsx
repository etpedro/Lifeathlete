"use client";

import type { Provider } from "@supabase/supabase-js";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { authCallbackUrl } from "./callbackUrl";
import styles from "./auth.module.css";

const PROVIDERS = [
  { id: "google", label: "google" },
  { id: "apple", label: "apple" },
] as const satisfies { id: Provider; label: string }[];

/** "Continue with Google/Apple": redirects to the provider, back to /{locale}/auth/callback. */
export function OAuthButtons() {
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

  return <OAuthButtonsView failed={failed} onSignIn={(p) => void signIn(p)} />;
}

/** Presentational part: one secondary button per provider and the failure alert. */
export function OAuthButtonsView({ failed, onSignIn }: { failed: boolean; onSignIn: (provider: Provider) => void }) {
  const t = useTranslations("onboarding.login");
  const tErrors = useTranslations("common.errors");
  return (
    <div>
      {PROVIDERS.map((p) => (
        <button key={p.id} type="button" className={styles.button} onClick={() => onSignIn(p.id)}>
          {t(p.label)}
        </button>
      ))}
      {failed && <p role="alert">{tErrors("oauth")}</p>}
    </div>
  );
}
