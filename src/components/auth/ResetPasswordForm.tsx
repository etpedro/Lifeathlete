"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  runPasswordUpdate,
  type PasswordValidationKey,
  type UpdatePasswordErrorKey,
} from "@/lib/auth/password-reset";
import { createClient } from "@/lib/supabase/client";

export type ResetStatus = "idle" | "working" | "done" | PasswordValidationKey | UpdatePasswordErrorKey;
type ErrorKey = Exclude<ResetStatus, "idle" | "working" | "done">;
type Labels = {
  password: string;
  confirm: string;
  hint: string;
  submit: string;
  submitting: string;
  success: string;
  continue: string;
  requestNew: string;
  error: (key: ErrorKey) => string;
};

/** Time the success message stays before opening Today. */
export const SUCCESS_REDIRECT_MS = 1500;

/** Presentational part: new password + confirmation, validation and outcome messages. */
export function ResetPasswordView({
  status,
  onSubmit,
  labels,
}: {
  status: ResetStatus;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  labels: Labels;
}) {
  if (status === "done") {
    return (
      <div>
        <p role="status">{labels.success}</p>
        <Link href="/today">{labels.continue}</Link>
      </div>
    );
  }
  const working = status === "working";
  const error: ErrorKey | null = status === "idle" || working ? null : status;
  const passwordInvalid = error === "tooShort" || error === "tooLong" || error === "weak" || error === "same";
  return (
    <form onSubmit={onSubmit} aria-busy={working} noValidate>
      <label>
        {labels.password}
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
          required
          aria-describedby="new-password-hint"
          aria-invalid={passwordInvalid}
        />
      </label>
      <p id="new-password-hint">{labels.hint}</p>
      <label>
        {labels.confirm}
        <input name="confirm" type="password" autoComplete="new-password" required aria-invalid={error === "mismatch"} />
      </label>
      <p role="alert">{error ? labels.error(error) : ""}</p>
      {error === "expired" && <Link href="/auth/forgot-password">{labels.requestNew}</Link>}
      <button type="submit" disabled={working}>
        {working ? labels.submitting : labels.submit}
      </button>
    </form>
  );
}

/** Set-new-password form on the recovery session (updateUser), then Today. */
export function ResetPasswordForm() {
  const t = useTranslations("passwordReset");
  const router = useRouter();
  const [status, setStatus] = useState<ResetStatus>("idle");

  useEffect(() => {
    if (status !== "done") return;
    const id = setTimeout(() => router.replace("/today"), SUCCESS_REDIRECT_MS);
    return () => clearTimeout(id);
  }, [status, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus("working");
    setStatus(
      await runPasswordUpdate(String(form.get("password") ?? ""), String(form.get("confirm") ?? ""), (attrs) =>
        createClient().auth.updateUser(attrs),
      ),
    );
  }

  return (
    <ResetPasswordView
      status={status}
      onSubmit={(e) => void onSubmit(e)}
      labels={{
        password: t("update.password"),
        confirm: t("update.confirm"),
        hint: t("update.hint"),
        submit: t("update.submit"),
        submitting: t("update.submitting"),
        success: t("update.success"),
        continue: t("update.continue"),
        requestNew: t("update.requestNew"),
        error: (key) => t(`errors.${key}`),
      }}
    />
  );
}
