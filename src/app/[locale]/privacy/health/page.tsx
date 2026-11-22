import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { PrivacyHealthView } from "@/components/privacy/PrivacyHealthView";
import { routing } from "@/i18n/routing";

/** Public page the Health Connect rationale opens (under /privacy so the proxy lets signed-out users in). */
export default async function PrivacyHealthPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return <PrivacyHealthView backHref={`/${locale}`} />;
}
