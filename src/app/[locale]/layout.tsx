import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { APPLE_TOUCH_ICON, THEME_COLOR } from "../manifest";

export const metadata: Metadata = {
  title: "Lifeathlete",
  applicationName: "Lifeathlete",
  icons: { apple: APPLE_TOUCH_ICON },
  appleWebApp: { capable: true, title: "Lifeathlete", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: THEME_COLOR };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
