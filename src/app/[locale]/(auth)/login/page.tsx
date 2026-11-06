import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth/LoginForm";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { Link } from "@/i18n/navigation";
import { guardArea } from "@/lib/auth/guard";
import ui from "@/components/ui/ui.module.css";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await guardArea("login", (await params).locale);
  const { error } = await searchParams;
  const t = await getTranslations("onboarding.login");
  const tErrors = await getTranslations("common.errors");

  return (
    <main className={ui.auth}>
      <header className={ui.field}>
        <h1>{t("title")}</h1>
        <p className={ui.lead}>{t("subtitle")}</p>
      </header>
      {error === "oauth" && <p role="alert">{tErrors("oauth")}</p>}
      <LoginForm />
      <p className={ui.links}>
        <Link href="/auth/forgot-password">{t("forgot")}</Link>
      </p>
      <p className={ui.divider}>{t("or")}</p>
      <div className={ui.stack}>
        <OAuthButtons />
      </div>
    </main>
  );
}
