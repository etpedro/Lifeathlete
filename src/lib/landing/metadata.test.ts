import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readPngSize } from "@/lib/pwa/png";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";
import { OG_IMAGE, landingMetadata, siteUrlFromEnv } from "./metadata";

describe("landingMetadata", () => {
  it.each([
    ["pt", pt, "pt_PT", "en_GB"],
    ["en", en, "en_GB", "pt_PT"],
  ] as const)("%s: localized title, description, Open Graph and language alternates", (locale, m, ogLocale, other) => {
    const meta = landingMetadata(locale, undefined);
    expect(meta.title).toBe(m.landing.meta.title);
    expect(meta.description).toBe(m.landing.meta.description);
    expect(meta.openGraph).toMatchObject({
      title: m.landing.meta.title,
      description: m.landing.meta.description,
      locale: ogLocale,
      alternateLocale: [other],
      url: `/${locale}`,
    });
    expect(meta.alternates).toEqual({ canonical: `/${locale}`, languages: { pt: "/pt", en: "/en", "x-default": "/pt" } });
  });

  it("without a site URL: relative URLs only, no metadataBase and no share image", () => {
    const meta = landingMetadata("pt", undefined);
    expect(meta.metadataBase).toBeUndefined();
    expect(JSON.stringify(meta)).not.toMatch(/https?:\/\//);
    expect(meta.openGraph).not.toHaveProperty("images");
    expect(meta.twitter).toMatchObject({ card: "summary" });
  });

  it("with a site URL: metadataBase and the 1200x630 share image", () => {
    const meta = landingMetadata("en", "https://lifeathlete.example");
    expect(String(meta.metadataBase)).toBe("https://lifeathlete.example/");
    expect(meta.openGraph).toMatchObject({ images: [{ url: "/landing/og.png", width: 1200, height: 630, alt: en.landing.meta.ogAlt }] });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", images: [{ url: "/landing/og.png", alt: en.landing.meta.ogAlt }] });
  });

  it("siteUrlFromEnv prefers NEXT_PUBLIC_SITE_URL, then Vercel's production URL", () => {
    expect(siteUrlFromEnv({})).toBeUndefined();
    expect(siteUrlFromEnv({ VERCEL_PROJECT_PRODUCTION_URL: "app.example" })).toBe("https://app.example");
    expect(siteUrlFromEnv({ NEXT_PUBLIC_SITE_URL: "https://x.example", VERCEL_PROJECT_PRODUCTION_URL: "app.example" })).toBe("https://x.example");
  });
});

describe("share image", () => {
  it("public/landing/og.png is a 1200x630 PNG", () => {
    const png = readFileSync(join(process.cwd(), "public", OG_IMAGE.url));
    expect(readPngSize(png)).toEqual({ width: 1200, height: 630 });
  });
});
