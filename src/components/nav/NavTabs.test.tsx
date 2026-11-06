import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";
import { NavTabs, isActiveTab } from "./NavTabs";

const render = (pathname: string, locale: "pt" | "en" = "pt") =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "pt" ? pt : en} timeZone="UTC">
      <NavTabs pathname={pathname} />
    </NextIntlClientProvider>,
  );

describe("NavTabs", () => {
  it("renders the four tabs with locale-aware links and labels", () => {
    const html = render("/today");
    for (const label of Object.values({ a: pt.common.nav.today, b: pt.common.nav.wheel, c: pt.common.nav.achievements, d: pt.common.nav.profile })) {
      expect(html).toContain(label);
    }
    for (const href of ["/pt/today", "/pt/wheel", "/pt/achievements", "/pt/profile"]) expect(html).toContain(`href="${href}"`);
    expect(render("/today", "en")).toContain('href="/en/wheel"');
    expect(html).toContain(`aria-label="${pt.common.nav.label}"`);
  });

  it("marks only the active tab with aria-current=page, including nested routes", () => {
    expect(render("/wheel").match(/aria-current="page"/g)).toHaveLength(1);
    expect(render("/wheel")).toMatch(/aria-current="page"[^>]*>[^<]*(<[^>]+>)*[^<]*Roda/);
    expect(render("/profile/habits")).toMatch(/href="\/pt\/profile"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/pt\/profile"/);
    expect(render("/somewhere-else")).not.toContain("aria-current");
  });

  it("isActiveTab matches whole segments only", () => {
    expect(isActiveTab("/today", "/today")).toBe(true);
    expect(isActiveTab("/profile/habits", "/profile")).toBe(true);
    expect(isActiveTab("/profiles", "/profile")).toBe(false);
  });
});
