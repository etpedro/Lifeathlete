import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import { DayStrip } from "./DayStrip";

describe("DayStrip", () => {
  it("marks only the selected day as pressed and exposes the date", () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <DayStrip today="2026-11-06" selected="2026-11-05" onSelect={() => {}} />
      </NextIntlClientProvider>,
    );
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(2);
    expect(html).toContain('dateTime="2026-11-05"');
  });
});
