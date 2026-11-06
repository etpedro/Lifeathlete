import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Landing } from "@/components/landing/Landing";
import { routing } from "@/i18n/routing";
import { landingMetadata } from "@/lib/landing/metadata";

/** The public landing page is static: one HTML per locale, no cookies, headers or Supabase. */
export const dynamic = "force-static";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return landingMetadata(hasLocale(routing.locales, locale) ? locale : routing.defaultLocale);
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return <Landing />;
}
