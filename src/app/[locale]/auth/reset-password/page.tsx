import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import ui from "@/components/ui/ui.module.css";
import { createClient } from "@/lib/supabase/server";

/**
 * Set a new password, reached from the reset email through /auth/callback (which turned
 * the link's code into a recovery session). Server side: the verified user; without a
 * session the link expired or was opened elsewhere. Reading cookies keeps the page dynamic.
 */
export default async function ResetPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const t = await getTranslations("passwordReset.update");
  return (
    <main className={ui.auth}>
      <h1>{t("title")}</h1>
      {user ? (
        <ResetPasswordForm />
      ) : (
        <>
          <p role="alert">{t("noSession")}</p>
          <p className={ui.links}>
            <Link href="/auth/forgot-password">{t("requestNew")}</Link>
          </p>
        </>
      )}
    </main>
  );
}
