import { renderToStaticMarkup } from "react-dom/server";

const esc = (text: string) => text.replace(/'/g, "&#x27;");
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";
import { LanguageSwitchView } from "./LanguageSwitch";

const view = (locale: "pt" | "en", status: "idle" | "working" | "error", m = pt) =>
  renderToStaticMarkup(
    <LanguageSwitchView
      locale={locale}
      status={status}
      onChoose={() => {}}
      labels={{ ...m.profile.language, language: (l) => m.common.languages[l] }}
    />,
  );

describe("LanguageSwitchView", () => {
  it("a labelled group with one radio per locale, the current one checked, each labelled in its own language", () => {
    const html = view("en", "idle");
    expect(html).toContain(`<legend>${pt.profile.language.title}</legend>`);
    expect(html).toMatch(/<input type="radio"[^>]*lang="en"[^>]*checked=""[^>]*value="en"/);
    expect(html).not.toMatch(/checked=""[^>]*value="pt"/);
    expect(html).toContain("Português");
    expect(html).toContain("English");
  });

  it("is disabled and busy while saving; shows the localized error (never backend text) on failure", () => {
    expect(view("pt", "working")).toMatch(/<fieldset[^>]*aria-busy="true"[^>]*disabled=""/);
    expect(view("pt", "working")).toContain(pt.profile.language.working);
    expect(view("pt", "error")).toContain(pt.profile.language.failed);
    expect(view("en", "error", en)).toContain(esc(en.profile.language.failed));
    expect(view("pt", "idle")).not.toContain(pt.profile.language.failed);
  });
});
