import type { Metadata } from "next";
import type { Locale } from "@/lib/auth/access";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";

/** The committed share image (scripts/generate-og-image.mjs). */
export const OG_IMAGE = { url: "/landing/og.png", width: 1200, height: 630 } as const;
const OG_LOCALES: Record<Locale, string> = { pt: "pt_PT", en: "en_GB" };

/** The public origin: NEXT_PUBLIC_SITE_URL, else Vercel's production URL, else unknown. */
export function siteUrlFromEnv(env: Record<string, string | undefined> = process.env): string | undefined {
  if (env.NEXT_PUBLIC_SITE_URL) return env.NEXT_PUBLIC_SITE_URL;
  return env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined;
}

/**
 * Metadata of the landing page in `locale`. With a known site URL it becomes the
 * metadataBase and every URL is absolute. Without one, URLs stay relative and the share
 * image is left out: Next would otherwise make it absolute on "http://localhost:3000",
 * which is wrong in production (and social platforms need an absolute og:image anyway).
 */
export function landingMetadata(locale: Locale, siteUrl: string | undefined = siteUrlFromEnv()): Metadata {
  const m = (locale === "en" ? en : pt).landing.meta;
  const base = siteUrl ? new URL(siteUrl) : undefined;
  const others = (Object.keys(OG_LOCALES) as Locale[]).filter((l) => l !== locale);
  return {
    ...(base ? { metadataBase: base } : {}),
    title: m.title,
    description: m.description,
    alternates: {
      canonical: `/${locale}`,
      languages: { pt: "/pt", en: "/en", "x-default": "/pt" },
    },
    openGraph: {
      type: "website",
      siteName: pt.common.appName,
      title: m.title,
      description: m.description,
      url: `/${locale}`,
      locale: OG_LOCALES[locale],
      alternateLocale: others.map((l) => OG_LOCALES[l]),
      ...(base ? { images: [{ ...OG_IMAGE, alt: m.ogAlt }] } : {}),
    },
    twitter: {
      card: base ? "summary_large_image" : "summary",
      title: m.title,
      description: m.description,
      ...(base ? { images: [{ url: OG_IMAGE.url, alt: m.ogAlt }] } : {}),
    },
  };
}
