// Today states in the new layout: empty, loading, notices with retry, toast. The controller is stubbed.
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TodayData } from "@/lib/data/today";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";
import type { TodayNotice } from "./notices";

const state = vi.hoisted(() => ({
  data: null as TodayData | null,
  notice: null as TodayNotice | null,
  online: true,
  statsFailed: false,
}));

vi.mock("./useTodayController", () => ({
  useTodayController: () => ({
    online: state.online,
    today: "2026-11-06",
    date: "2026-11-06",
    data: state.data,
    pendingIds: new Set<string>(),
    stats: { xpTotal: 0, level: 1, currentStreak: 0, computedFor: null },
    statsFailed: state.statsFailed,
    feedback: null,
    dismissFeedback: () => {},
    notice: state.notice,
    retry: () => {},
    setValue: () => {},
    selectDay: () => {},
  }),
}));

import { TodayView } from "./TodayView";

function render(locale: "pt" | "en" = "pt") {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "pt" ? pt : en} timeZone="UTC">
      <TodayView userId="u" timezone="UTC" today="2026-11-06" initialData={null} initialStats={{ xpTotal: 0, level: 1, currentStreak: 0, computedFor: null }} />
    </NextIntlClientProvider>,
  );
}

const oneHabit: TodayData = {
  pillars: [{ pillarId: "p", slug: "exercise", habits: [{ id: "a", title: "Treino", kind: "check", target: 1, value: 0, source: "none" }] }],
};

afterEach(() => {
  state.data = null;
  state.notice = null;
  state.online = true;
  state.statsFailed = false;
});

describe("TodayView states", () => {
  it("empty state: message, friendly dragonfly, ring at 0 without NaN", () => {
    state.data = { pillars: [] };
    const html = render();
    expect(html).toContain(pt.today.empty);
    expect(html).toContain("data-variant=");
    expect(html).toContain(pt.today.emptyArt);
    expect(html).toContain('data-fraction="0"');
    expect(html).not.toMatch(/NaN|Infinity/);
    expect(render("en")).toContain(en.today.emptyArt);
  });

  it("loading state is busy and announces the loading text", () => {
    const html = render();
    expect(html).toMatch(/aria-busy="true"[^>]*>/);
    expect(html).toContain(pt.common.loading);
  });

  it("offline notice keeps role=status", () => {
    state.online = false;
    state.data = oneHabit;
    expect(render()).toMatch(new RegExp(`role="status"[^>]*>(<[^>]+>)*${pt.today.offline}`));
  });

  it("stats failure notice keeps role=status", () => {
    state.statsFailed = true;
    state.data = oneHabit;
    expect(render()).toMatch(new RegExp(`role="status"[^>]*>(<[^>]+>)*${pt.today.errors.stats}`));
  });

  it.each([
    ["fallback", pt.today.errors.fallback, "status"],
    ["fallbackStale", pt.today.errors.fallbackStale, "status"],
    ["load", pt.today.errors.load, "alert"],
  ] as const)("%s notice renders with its retry button in the new layout", (kind, text, role) => {
    state.notice = { kind };
    state.data = kind === "load" ? null : oneHabit;
    const html = render();
    expect(html).toContain(`role="${role}"`);
    expect(html).toContain(text);
    expect(html).toContain(`>${pt.common.errors.retry}</button>`);
    if (kind !== "load") expect(html).toContain("Treino"); // the fallback day itself is still listed
  });

  it("the remaining line stays a polite live region", () => {
    state.data = oneHabit;
    expect(render()).toMatch(/aria-live="polite"[^>]*>Dia completo: falta 1 hábito/);
  });
});
