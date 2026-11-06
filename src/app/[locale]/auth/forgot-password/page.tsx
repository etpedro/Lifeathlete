import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import ui from "@/components/ui/ui.module.css";

/** "Forgot password?" (public; under /auth so the proxy lets signed-out users in). */
export default async function ForgotPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const { error } = await searchParams;
  const t = await getTranslations("passwordReset.forgot");
  return (
    <main className={ui.auth}>
      <h1>{t("title")}</h1>
      {error === "expired" && <p role="alert">{t("expired")}</p>}
      <p className={ui.lead}>{t("intro")}</p>
      <ForgotPasswordForm />
      <p className={ui.links}>
        <Link href="/login">{t("back")}</Link>
      </p>
    </main>
  );
}
