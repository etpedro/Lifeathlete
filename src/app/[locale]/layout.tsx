import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { routing } from "@/i18n/routing";
import { APPLE_TOUCH_ICON, THEME_COLOR, THEME_COLOR_LIGHT } from "../manifest";
import "@/styles/tokens.css";
import "@/styles/base.css";

export const metadata: Metadata = {
  title: "Lifeathlete",
  applicationName: "Lifeathlete",
  icons: { apple: APPLE_TOUCH_ICON },
  appleWebApp: { capable: true, title: "Lifeathlete", statusBarStyle: "default" },
};

/** Dark by default; the light entry matches the light token variant (src/styles/tokens.css). */
export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR },
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR_LIGHT },
  ],
};

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
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
