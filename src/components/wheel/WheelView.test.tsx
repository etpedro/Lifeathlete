import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Wheel } from "@/lib/data/stats";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";
import { WheelView } from "./WheelView";

function render(wheel: Wheel | null, locale: "pt" | "en" = "pt") {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "pt" ? pt : en} timeZone="UTC">
      <WheelView wheel={wheel} />
    </NextIntlClientProvider>,
  );
}

describe("WheelView", () => {
  it("shows the empty state without scores", () => {
    const html = render({ scores: {} });
    expect(html).toContain(pt.wheel.empty);
    expect(html).not.toContain("<svg");
  });

  it("shows an error message when the load failed", () => {
    expect(render(null)).toContain(pt.wheel.loadError);
  });

  it("calls out strongest and weakest with the weakest pillar's suggestion", () => {
    const html = render({ scores: { exercise: 90, nature: 10, reading: 50 }, strongest: "exercise", weakest: "nature" });
    expect(html).toContain(pt.wheel.strongest.title);
    expect(html).toContain(pt.wheel.weakest.title);
    expect(html).toContain(pt.wheel.suggestion.nature);
    expect(html).not.toContain(pt.wheel.suggestion.exercise);
    expect(render({ scores: { exercise: 90, nature: 10 }, strongest: "exercise", weakest: "nature" }, "en")).toContain(
      en.wheel.suggestion.nature,
    );
  });

  it("has no callouts when nothing stands out", () => {
    const html = render({ scores: { exercise: 40 } });
    expect(html).not.toContain(pt.wheel.strongest.title);
    expect(html).not.toContain(pt.wheel.weakest.title);
  });

  it("has a suggestion for every pillar in both languages", () => {
    for (const slug of Object.keys(pt.pillars)) {
      expect(pt.wheel.suggestion).toHaveProperty([slug]);
      expect(en.wheel.suggestion).toHaveProperty([slug]);
    }
  });
});
