"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { useRouter } from "@/i18n/navigation";
import { authErrorKey, type AuthErrorKey } from "@/lib/auth/errors";
import { createClient } from "@/lib/supabase/client";
import { authCallbackUrl } from "./callbackUrl";

type Mode = "signIn" | "signUp";

/** Email + password sign in / sign up. Errors are shown as friendly localized text. */
export function LoginForm() {
  const t = useTranslations("onboarding.login");
  const tErrors = useTranslations("common.errors");
  const locale = useLocale();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signIn");
  const [error, setError] = useState<AuthErrorKey | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const credentials = { email: String(form.get("email")), password: String(form.get("password")) };
    setBusy(true);
    setError(null);
    try {
      const auth = createClient().auth;
      if (mode === "signIn") {
        const { error } = await auth.signInWithPassword(credentials);
        if (error) return setError(authErrorKey(error));
        router.replace("/today");
      } else {
        const { data, error } = await auth.signUp({
          ...credentials,
          options: { emailRedirectTo: authCallbackUrl(locale) },
        });
        if (error) return setError(authErrorKey(error));
        if (!data.session) return setCheckEmail(true);
        router.replace("/onboarding");
      }
      router.refresh();
    } catch (e) {
      setError(authErrorKey(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <label>
        {t("email")}
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        {t("password")}
        <input
          name="password"
          type="password"
          autoComplete={mode === "signIn" ? "current-password" : "new-password"}
          minLength={8}
          required
        />
      </label>
      {error && <p role="alert">{tErrors(error)}</p>}
      {checkEmail && <p role="status">{t("checkEmail")}</p>}
      <button type="submit" disabled={busy}>
        {busy ? t("submitting") : t(mode)}
      </button>
      <button type="button" onClick={() => setMode(mode === "signIn" ? "signUp" : "signIn")}>
        {mode === "signIn" ? t("toSignUp") : t("toSignIn")}
      </button>
    </form>
  );
}
