"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { runResetRequest, type ResetRequestOutcome } from "@/lib/auth/password-reset";
import { createClient } from "@/lib/supabase/client";

export type ForgotStatus = "idle" | "working" | ResetRequestOutcome;
type Labels = { email: string; submit: string; submitting: string; sent: string; error: (key: Exclude<ResetRequestOutcome, "sent">) => string };

/** Presentational part: email field, submit, and the outcome (the "sent" text never says whether the account exists). */
export function ForgotPasswordView({
  status,
  onSubmit,
  labels,
}: {
  status: ForgotStatus;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  labels: Labels;
}) {
  const working = status === "working";
  const error = status !== "idle" && status !== "working" && status !== "sent" ? status : null;
  return (
    <form onSubmit={onSubmit} aria-busy={working}>
      <label>
        {labels.email}
        <input name="email" type="email" autoComplete="email" required aria-invalid={error === "invalidEmail"} />
      </label>
      <p role="alert">{error ? labels.error(error) : ""}</p>
      <p role="status">{status === "sent" ? labels.sent : ""}</p>
      <button type="submit" disabled={working}>
        {working ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}

/** "Forgot password?" request: resetPasswordForEmail with a link back to this locale's auth callback. */
export function ForgotPasswordForm() {
  const t = useTranslations("passwordReset");
  const locale = useLocale();
  const [status, setStatus] = useState<ForgotStatus>("idle");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    setStatus("working");
    setStatus(
      await runResetRequest(email, window.location.origin, locale, (e, options) =>
        createClient().auth.resetPasswordForEmail(e, options),
      ),
    );
  }

  return (
    <ForgotPasswordView
      status={status}
      onSubmit={(e) => void onSubmit(e)}
      labels={{
        email: t("forgot.email"),
        submit: t("forgot.submit"),
        submitting: t("forgot.submitting"),
        sent: t("forgot.sent"),
        error: (key) => t(`errors.${key}`),
      }}
    />
  );
}
