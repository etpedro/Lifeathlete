// The hero follows the selected day: the controller is stubbed so the view renders as if "Ontem" was picked.
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TodayData } from "@/lib/data/today";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";

const state = vi.hoisted(() => ({ date: "2026-11-06", data: null as TodayData | null }));

vi.mock("./useTodayController", () => ({
  useTodayController: () => ({
    online: true,
    today: "2026-11-06",
    date: state.date,
    data: state.data,
    pendingIds: new Set<string>(),
    stats: { xpTotal: 0, level: 1, currentStreak: 0, computedFor: null },
    statsFailed: false,
    feedback: null,
    dismissFeedback: () => {},
    notice: null,
    retry: () => {},
    setValue: () => {},
    selectDay: () => {},
  }),
}));

import { TodayView } from "./TodayView";

const h = (id: string, value: number) => ({
  id,
  title: id,
  kind: "check" as const,
  target: 1,
  value,
  source: "manual" as const,
});

function render(locale: "pt" | "en" = "pt") {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "pt" ? pt : en} timeZone="UTC">
      <TodayView userId="u" timezone="UTC" today="2026-11-06" initialData={null} initialStats={{ xpTotal: 0, level: 1, currentStreak: 0, computedFor: null }} />
    </NextIntlClientProvider>,
  );
}

describe("TodayView hero follows the selected day", () => {
  const data: TodayData = { pillars: [{ pillarId: "p", slug: "exercise", habits: [h("a", 1), h("b", 0), h("c", 1)] }] };

  it("uses today's done/total and legend for today", () => {
    state.date = "2026-11-06";
    state.data = data;
    const html = render();
    expect(html).toContain('aria-label="2 de 3 hábitos feitos"');
    expect(html).toContain("de 3 hoje");
  });

  it("uses yesterday's counts and legend after selecting Ontem", () => {
    state.date = "2026-11-05";
    state.data = { pillars: [{ pillarId: "p", slug: "exercise", habits: [h("a", 1), h("b", 0), h("c", 0), h("d", 0)] }] };
    const html = render();
    expect(html).toContain('aria-label="1 de 4 hábitos feitos"');
    expect(html).toContain("de 4 ontem");
    expect(render("en")).toContain("of 4 yesterday");
  });

  it("shows 2 days ago", () => {
    state.date = "2026-11-04";
    state.data = data;
    expect(render()).toContain("de 3 há 2 dias");
  });

  it("renders an empty hero (no NaN) while the day loads", () => {
    state.date = "2026-11-05";
    state.data = null;
    const html = render();
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(html).toContain("0 de 0 hábitos feitos");
  });
});
