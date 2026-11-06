import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth/LoginForm";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { Link } from "@/i18n/navigation";
import { guardArea } from "@/lib/auth/guard";

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
    <main>
      <h1>{t("title")}</h1>
      <p>{t("subtitle")}</p>
      {error === "oauth" && <p role="alert">{tErrors("oauth")}</p>}
      <LoginForm />
      <p>
        <Link href="/auth/forgot-password">{t("forgot")}</Link>
      </p>
      <p>{t("or")}</p>
      <OAuthButtons />
    </main>
  );
}
