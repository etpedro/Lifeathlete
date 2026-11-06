// Server-render tests of the management components (no DOM env): what the first paint shows.
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ManageableHabit } from "@/lib/data/habits";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";
import { AddHabitForm } from "./AddHabitForm";
import { HabitItem } from "./HabitItem";

const render = (ui: ReactElement, locale: "pt" | "en" = "pt") =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "pt" ? pt : en} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );

const noop = async () => null;
const habit = (over: Partial<ManageableHabit> = {}): ManageableHabit => ({
  id: "h1",
  title: "Caminhar",
  kind: "value",
  target: 30,
  active: true,
  fromTemplate: false,
  ...over,
});
const item = (h: ManageableHabit, busy = false) => (
  <ul>
    <HabitItem habit={h} busy={busy} onSetActive={noop} onSaveTarget={noop} onArchive={noop} />
  </ul>
);

describe("HabitItem (first paint)", () => {
  it("archiving needs a confirmation step: only the archive button shows, not the confirm action", () => {
    const html = render(item(habit()));
    expect(html).toContain(pt.profile.habits.archive);
    expect(html).not.toContain(pt.profile.habits.archiveYes);
    expect(html).not.toContain("Arquivar “Caminhar”?");
  });

  it("exposes the active state as a labelled switch", () => {
    const on = render(item(habit()));
    expect(on).toContain('role="switch"');
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain('aria-label="Ativar Caminhar"');
    expect(render(item(habit({ active: false })))).toContain('aria-checked="false"');
  });

  it("shows a labelled target editor for value habits only", () => {
    const value = render(item(habit()));
    expect(value).toContain('aria-label="Meta de Caminhar"');
    expect(value).toContain('value="30"');
    expect(value).toContain(pt.profile.habits.saveTarget);
    const check = render(item(habit({ kind: "check", target: 1 })));
    expect(check).not.toContain(pt.profile.habits.saveTarget);
  });

  it("disables the actions while a mutation is in flight", () => {
    expect(render(item(habit(), true)).match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("renders in English too", () => {
    expect(render(item(habit()), "en")).toContain(en.profile.habits.archive);
  });
});

describe("AddHabitForm (first paint)", () => {
  const pillars = [
    { id: "p1", slug: "exercise" },
    { id: "p2", slug: "reading" },
  ];

  it("has labelled pillar select, title input and kind radios; no target until kind is value", () => {
    const html = render(<AddHabitForm pillars={pillars} busy={false} onCreate={noop} />);
    expect(html).toContain(pt.pillars.exercise.name);
    expect(html).toContain(pt.profile.add.titleLabel);
    expect(html.match(/type="radio"/g)).toHaveLength(2);
    expect(html).not.toContain(pt.profile.add.target);
    expect(html).not.toContain('role="alert"');
  });
});
