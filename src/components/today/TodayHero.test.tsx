import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";
import { TodayHero } from "./TodayHero";

const STATS = { xpTotal: 140, level: 2, currentStreak: 3, computedFor: "2026-11-06" };

function render(done: number, total: number, dayLabel = "hoje", locale: "pt" | "en" = "pt", stats = STATS) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "pt" ? pt : en} timeZone="UTC">
      <TodayHero stats={stats} done={done} total={total} dayLabel={dayLabel} />
    </NextIntlClientProvider>,
  );
}

describe("TodayHero", () => {
  it("shows level, tier name, XP into the level and the streak", () => {
    const html = render(4, 10);
    expect(html).toContain("Nível 2");
    expect(html).toContain(pt.achievements.tier["1"]);
    expect(html).toContain("40 / 283 XP"); // 140 XP: level 1 costs 100, so 40 into level 2 (cost 283)
    expect(html).toContain("3 dias seguidos");
  });
  it("labels the ring with done of total and shows the legend with the day label", () => {
    const html = render(4, 10, "hoje");
    expect(html).toContain('aria-label="4 de 10 hábitos feitos"');
    expect(html).toContain("de 10 hoje");
  });
  it("follows the day label passed in", () => {
    expect(render(2, 5, "ontem")).toContain("de 5 ontem");
    expect(render(2, 5, "há 2 dias")).toContain("de 5 há 2 dias");
  });
  it("renders the English strings", () => {
    const html = render(1, 3, "yesterday", "en");
    expect(html).toContain("1 of 3 habits done");
    expect(html).toContain("of 3 yesterday");
  });
  it("renders an empty hero for total 0 without NaN", () => {
    const html = render(0, 0);
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(html).toContain('data-fraction="0"');
  });
  it("clamps the ring when done exceeds total", () => {
    const html = render(12, 10);
    expect(html).toContain('data-fraction="1"');
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it("sets the XP bar from the level progress", () => {
    expect(render(0, 3)).toMatch(/width:\s*14(\.\d+)?%/);
  });
});
