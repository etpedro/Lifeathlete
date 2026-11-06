import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AchievementItem, ProfileStats } from "@/lib/data/stats";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";
import { AchievementsView } from "./AchievementsView";

const STATS: ProfileStats = {
  level: 7,
  tier: 2,
  xpIntoLevel: 120,
  xpForNext: 700,
  currentStreak: 1,
  bestStreak: 12,
  lastActiveDate: "2026-11-05",
  mascot: { stage: 2, variant: "normal" },
};
const medal = (over: Partial<AchievementItem>): AchievementItem => ({
  code: "c",
  title: "Medalha",
  description: "Desc",
  pillarSlug: null,
  xpReward: 0,
  unlockedAt: null,
  progress: null,
  ...over,
});

function render(props: Partial<Parameters<typeof AchievementsView>[0]>, locale: "pt" | "en" = "pt") {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "pt" ? pt : en} timeZone="UTC">
      <AchievementsView stats={STATS} medals={[]} resting={false} timeZone="Europe/Lisbon" {...props} />
    </NextIntlClientProvider>,
  );
}

describe("AchievementsView", () => {
  it("shows level, tier name, xp bar and both streaks", () => {
    const html = render({});
    expect(html).toContain("Nível 7");
    expect(html).toContain(pt.achievements.tier["2"]);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="120"');
    expect(html).toContain('aria-valuemax="700"');
    expect(html).toContain("12 dias");
    expect(html).toContain("1 dia");
    expect(render({}, "en")).toContain(en.achievements.tier["2"]);
  });

  it("shows the calm resting message only when resting", () => {
    expect(render({ resting: true })).toContain(pt.achievements.resting);
    expect(render({ resting: false })).not.toContain(pt.achievements.resting);
    expect(render({ resting: true }, "en")).toContain(en.achievements.resting);
  });

  it("renders unlocked (dated) and locked medals, with a bar only where progress exists", () => {
    const html = render({
      medals: [
        medal({ code: "a", title: "Aberta", unlockedAt: "2026-11-02T10:00:00Z" }),
        medal({ code: "b", title: "Fechada" }),
        medal({ code: "c", title: "Com barra", progress: { current: 40, target: 100 } }),
      ],
    });
    expect(html).toContain("2 de nov. de 2026");
    expect(html).toContain(pt.achievements.locked);
    expect(html.match(/data-unlocked="true"/g)).toHaveLength(1);
    expect(html.match(/data-unlocked="false"/g)).toHaveLength(2);
    // one bar for the level + exactly one for the medal with progress
    expect(html.match(/role="progressbar"/g)).toHaveLength(2);
    expect(html).toContain("40 de 100 dias");
  });

  it("shows an error message when data failed to load, keeping the page", () => {
    const html = render({ stats: null, medals: null });
    expect(html.match(/role="alert"/g)).toHaveLength(2);
  });
});
