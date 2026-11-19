// Server-render tests of the onboarding steps (no DOM env): what the first paint shows.
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CatalogPillar } from "@/lib/onboarding/selection";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";
import { ChoosePillarsStep } from "./ChoosePillarsStep";
import { PillarChoice } from "./PillarChoice";
import { PillarsIntroStep } from "./PillarsIntroStep";
import { StepHeader } from "./StepHeader";
import { StepNav } from "./StepNav";

const render = (ui: ReactElement, locale: "pt" | "en" = "pt") =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "pt" ? pt : en} timeZone="UTC" onError={() => {}}>
      {ui}
    </NextIntlClientProvider>,
  );

const catalog: CatalogPillar[] = [
  { id: "p1", slug: "exercise", templates: [{ id: "t1", title: { pt: "Caminhar", en: "Walk" } }, { id: "t2", title: { pt: "Alongar", en: "Stretch" } }] },
  { id: "p2", slug: "reading", templates: [{ id: "t3", title: { pt: "Ler", en: "Read" } }] },
];
const noop = () => {};

describe("PillarChoice", () => {
  const choice = (selected: boolean, pillar = catalog[0]) =>
    render(
      <ul>
        <PillarChoice
          pillar={pillar}
          locale="pt"
          selection={{ pillars: selected ? [pillar.id] : [], unchecked: [] }}
          onTogglePillar={noop}
          onToggleHabit={noop}
        />
      </ul>,
    );

  it("is a colorful tile: pillar color custom property, icon, label and a real checkbox", () => {
    const html = choice(false);
    expect(html).toContain("--pillar:var(--pillar-exercise)");
    expect(html).toContain('data-pillar-icon="exercise"');
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).toContain(pt.pillars.exercise.name);
    expect(html).toMatch(/<input[^>]*type="checkbox"/);
    expect(html).not.toContain("checked");
  });

  it("selected: checked checkbox, a check mark that is not color alone, and the habit list", () => {
    const html = choice(true);
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked/);
    expect(html).toContain("data-check");
    expect(html).toContain("Caminhar");
    expect(html).toContain("Alongar");
  });

  it("unselected tiles hide the habits", () => {
    expect(choice(false)).not.toContain("Caminhar");
  });

  it("an unknown pillar slug does not throw and falls back to the primary color", () => {
    const html = choice(false, { id: "x", slug: "mystery", templates: [] });
    expect(html).toContain("--pillar:var(--color-primary)");
    expect(html).toContain('data-pillar-icon="mystery"');
  });
});

describe("ChoosePillarsStep", () => {
  const step = (pillars: string[], locale: "pt" | "en" = "pt") =>
    render(
      <ChoosePillarsStep catalog={catalog} failed={false} onRetry={noop} selection={{ pillars, unchecked: [] }} onChange={noop} />,
      locale,
    );

  it("keeps the selected-count text (habits across selected pillars)", () => {
    expect(step(["p1", "p2"])).toContain("3 hábitos escolhidos");
    expect(step(["p2"], "en")).toContain("1 habit selected");
    expect(step([])).toContain(pt.onboarding.choose.none);
  });

  it("renders one tile per catalog pillar", () => {
    expect(step([]).match(/data-pillar-icon=/g)).toHaveLength(2);
  });

  it("failed catalog keeps the alert and a retry button", () => {
    const html = render(<ChoosePillarsStep catalog={null} failed onRetry={noop} selection={{ pillars: [], unchecked: [] }} onChange={noop} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain(pt.common.errors.retry);
  });
});

describe("PillarsIntroStep", () => {
  it("lists every pillar with its icon", () => {
    const html = render(<PillarsIntroStep />);
    expect(html.match(/data-pillar-icon=/g)).toHaveLength(10);
    expect(html).toContain(pt.pillars.reading.name);
  });
});

describe("StepHeader", () => {
  it("shows a calm progress indicator: one dot per step, the current one marked, text kept", () => {
    const html = render(<StepHeader current={2} total={4} title="Pilares" />);
    expect(html.match(/data-step-dot/g)).toHaveLength(4);
    expect(html.match(/data-state="done"/g)).toHaveLength(1);
    expect(html.match(/data-state="current"/g)).toHaveLength(1);
    expect(html.match(/data-state="todo"/g)).toHaveLength(2);
    expect(html).toContain("<h1");
    expect(html).toContain("Pilares");
    expect(html).toContain("2");
  });
});

describe("StepNav", () => {
  it("back is a secondary button, next the filled primary; each carries one variant class", () => {
    const html = render(<StepNav onBack={noop} onNext={noop} />);
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(2);
    for (const b of buttons) expect((b.match(/class="([^"]*)"/)?.[1] ?? "").split(" ").filter(Boolean)).toHaveLength(1);
  });
});
