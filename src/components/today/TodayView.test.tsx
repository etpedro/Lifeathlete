// Server-render smoke tests of the Today screen (no DOM needed): what the first paint shows.
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TodayData, TodayHabit } from "@/lib/data/today";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";
import { TodayView } from "./TodayView";

const STATS = { xpTotal: 140, level: 2, currentStreak: 3, computedFor: "2026-11-06" };

function render(data: TodayData | null, locale: "pt" | "en" = "pt") {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "pt" ? pt : en} timeZone="UTC">
      <TodayView userId="u1" timezone="Europe/Lisbon" today="2026-11-06" initialData={data} initialStats={STATS} />
    </NextIntlClientProvider>,
  );
}

const habit = (over: Partial<TodayHabit>): TodayHabit => ({
  id: "h",
  title: "Hábito",
  kind: "check",
  target: 1,
  value: 0,
  source: "none",
  ...over,
});

describe("TodayView (first paint)", () => {
  it("shows an empty state from i18n for a user with zero active habits", () => {
    const html = render({ pillars: [] });
    expect(html).toContain(pt.today.empty);
    expect(render({ pillars: [] }, "en")).toContain(en.today.empty);
  });

  it("renders value habits with target 0 or above target without NaN/Infinity (progress clamped)", () => {
    const html = render({
      pillars: [
        {
          pillarId: "p1",
          slug: "reading",
          habits: [
            habit({ id: "a", title: "Sem meta", kind: "value", target: 0, value: 3 }),
            habit({ id: "b", title: "Acima", kind: "value", target: 10, value: 25 }),
            habit({ id: "c", title: "Zero", kind: "value", target: 0, value: 0 }),
          ],
        },
      ],
    });
    expect(html).not.toMatch(/NaN|Infinity/);
    const values = [...html.matchAll(/<progress[^>]*value="([^"]+)"/g)].map((m) => Number(m[1]));
    expect(values).toEqual([100, 100, 0]);
  });

  it("groups by pillar with header stats, day strip, check state and the remaining counter", () => {
    const html = render({
      pillars: [
        {
          pillarId: "p1",
          slug: "exercise",
          habits: [
            habit({ id: "w", title: "Treino do dia", value: 1, source: "manual" }),
            habit({ id: "s", title: "Caminhar", kind: "value", target: 30, value: 12, source: "strava" }),
          ],
        },
      ],
    });
    expect(html).toContain(pt.pillars.exercise.name);
    expect(html).toContain("Nível 2");
    expect(html).toContain("140 XP");
    expect(html).toContain("3 dias seguidos");
    expect(html).toContain(pt.today.days.yesterday);
    expect(html).toContain(pt.today.days.twoDaysAgo);
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*Treino do dia/);
    expect(html).toContain("via Strava");
    expect(html).toContain("Dia completo: falta 1 hábito");
    expect(html).toContain('aria-expanded="true"');
  });

  it("shows a loading state while the day has not loaded (no crash)", () => {
    expect(render(null)).toContain(pt.common.loading);
  });
});
