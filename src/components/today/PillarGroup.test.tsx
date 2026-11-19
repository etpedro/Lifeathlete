import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TodayHabit, TodayPillar } from "@/lib/data/today";
import en from "@/messages/en.json";
import { PillarGroup } from "./PillarGroup";

const h = (id: string, value: number): TodayHabit => ({ id, title: id, kind: "check", target: 1, value, source: "manual" });

function render(pillar: TodayPillar) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <PillarGroup pillar={pillar} pendingIds={new Set()} onSetValue={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("PillarGroup", () => {
  const pillar: TodayPillar = { pillarId: "p", slug: "exercise", habits: [h("a", 1), h("b", 0), h("c", 1)] };

  it("renders the pillar icon and sets --pillar from the slug", () => {
    const html = render(pillar);
    expect(html).toContain("<svg");
    expect(html).toContain('data-pillar-icon="exercise"');
    expect(html).toContain("--pillar:var(--pillar-exercise)");
  });

  it("keeps the collapse button, the done-of-total text and the list", () => {
    const html = render(pillar);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("aria-controls=");
    expect(html).toContain("2 of 3");
  });

  it("shows one decorative dot per habit, filled for the done ones", () => {
    const html = render(pillar);
    expect(html.match(/<i[ >]/g)).toHaveLength(3);
    expect(html.match(/data-done="true"/g)).toHaveLength(2 + 2); // 2 dots + 2 done rows
  });

  it("does not throw on an unknown slug and falls back to the primary color", () => {
    const html = render({ ...pillar, slug: "mystery" });
    expect(html).toContain("--pillar:var(--color-primary)");
    expect(html).toContain("<svg");
  });
});
