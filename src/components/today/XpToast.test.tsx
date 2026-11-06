// Server-render tests of the feedback toast: what is announced (role="status" is a polite live region).
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";
import { XpToast } from "./XpToast";

const render = (locale: "pt" | "en", achievements: string[]) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "pt" ? pt : en} timeZone="UTC">
      <XpToast feedback={{ xpGained: 10, levelUp: null, streak: null, achievements }} onDismiss={() => {}} />
    </NextIntlClientProvider>,
  );

describe("XpToast", () => {
  it("announces an unlocked achievement by its localized title, politely", () => {
    const html = render("pt", ["Leitor assíduo"]);
    expect(html).toMatch(/^<div role="status"/);
    expect(html).toContain("+10 XP");
    expect(html).toContain(pt.today.toast.achievement.replace("{title}", "Leitor assíduo"));
    expect(render("en", ["Bookworm"])).toContain(en.today.toast.achievement.replace("{title}", "Bookworm"));
  });

  it("shows no achievement line without unlocks", () => {
    expect(render("pt", [])).not.toContain(pt.today.toast.achievement.split("{")[0]);
  });
});
