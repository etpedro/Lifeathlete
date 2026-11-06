"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { runSignOut, type SignOutStatus } from "@/lib/auth/sign-out";
import { clearUserCaches } from "@/lib/pwa/client";
import { createClient } from "@/lib/supabase/client";
import styles from "./profile.module.css";

/** Presentational part: the button plus an alert region for errors. All copy arrives via `t`. */
export function SignOutButtonView({
  status,
  onSignOut,
  t,
}: {
  status: SignOutStatus;
  onSignOut: () => void;
  t: (key: "button" | "working" | "failed") => string;
}) {
  const working = status === "working";
  return (
    <div className={styles.field}>
      <button type="button" className={`${styles.button} ${styles.danger}`} onClick={onSignOut} aria-busy={working} disabled={working}>
        {working ? t("working") : t("button")}
      </button>
      <p role="alert" className={styles.error}>
        {status === "error" ? t("failed") : ""}
      </p>
    </div>
  );
}

/**
 * Signs out, clears this user's pages from the service worker caches (shared-device privacy),
 * then does a full navigation to the login page so no in-memory app state survives.
 */
export function SignOutButton({ locale }: { locale: string }) {
  const t = useTranslations("profile.signOut");
  const [status, setStatus] = useState<SignOutStatus>("idle");

  async function onSignOut() {
    setStatus("working");
    const result = await runSignOut({
      signOut: () => createClient().auth.signOut(),
      clearCaches: () => clearUserCaches(),
      // A full page load (not router.push) so no in-memory app state of this user survives.
      navigate: () => window.location.assign(new URL(`/${locale}/login`, window.location.origin)),
    });
    if (result === "error") setStatus("error");
  }

  return <SignOutButtonView status={status} onSignOut={() => void onSignOut()} t={(k) => t(k)} />;
}
