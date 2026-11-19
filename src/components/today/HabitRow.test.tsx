import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TodayHabit } from "@/lib/data/today";
import en from "@/messages/en.json";
import { HabitRow } from "./HabitRow";

function render(habit: TodayHabit, pending = false) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <HabitRow habit={habit} pending={pending} onSetValue={() => {}} />
    </NextIntlClientProvider>,
  );
}

const check = (value: number): TodayHabit => ({ id: "a", title: "Stretch", kind: "check", target: 1, value, source: "manual" });
const val = (value: number, source = "manual"): TodayHabit => ({ id: "b", title: "Steps", kind: "value", target: 100, value, source });

describe("HabitRow", () => {
  it("check habit keeps aria-pressed and shows a filled check marker when done", () => {
    const done = render(check(1));
    expect(done).toContain('aria-pressed="true"');
    expect(done).toContain('data-done="true"');
    expect(done).toContain("Done");
    const todo = render(check(0));
    expect(todo).toContain('aria-pressed="false"');
    expect(todo).not.toContain('data-done="true"');
    expect(todo).toContain("To do");
  });

  it("done value habit shows the done marker, text, provider and a progress bar", () => {
    const html = render(val(100, "strava"));
    expect(html).toContain('data-done="true"');
    expect(html).toContain("Done");
    expect(html).toContain("via ");
    expect(html).toContain("<progress");
    expect(html).toContain('aria-label="Log value: Steps"');
    expect(html).toContain('aria-expanded="false"');
  });

  it("keeps the pending marker", () => {
    expect(render(val(10), true)).toContain("Waiting to sync");
  });
});
