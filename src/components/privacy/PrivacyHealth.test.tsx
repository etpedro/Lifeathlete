// Server-render test of the public health-privacy page content, both locales.
import { NextIntlClientProvider } from "next-intl";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";
import { PrivacyHealthView } from "./PrivacyHealthView";

const render = (locale: "pt" | "en") =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "pt" ? pt : en} timeZone="UTC">
      <PrivacyHealthView backHref={`/${locale}`} />
    </NextIntlClientProvider>,
  );
const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

describe("PrivacyHealthView", () => {
  for (const locale of ["pt", "en"] as const) {
    it(`renders one h1, every section and the back link (${locale})`, () => {
      const html = decode(render(locale));
      const m = (locale === "pt" ? pt : en).privacyHealth;
      expect(html.match(/<h1/g)).toHaveLength(1);
      expect(html).toContain(m.title);
      for (const key of ["intro", "reads", "stores", "kept", "unverified", "control"] as const) expect(html).toContain(m[key]);
      expect(html.match(/<h2/g)!.length).toBeGreaterThanOrEqual(5);
      expect(html).toContain(`href="/${locale}"`);
      expect(html).toContain(m.back);
    });
  }

  it("states the real behaviour: last 7 days, one number per day", () => {
    expect(en.privacyHealth.stores).toMatch(/7 days/);
    expect(pt.privacyHealth.stores).toMatch(/7 dias/);
  });

  it("uses tokens-only CSS with no backdrop-filter or clipping", () => {
    const css = readFileSync("src/components/privacy/privacy.module.css", "utf8");
    expect(css).not.toMatch(/backdrop-filter|overflow:\s*hidden/);
  });
});
