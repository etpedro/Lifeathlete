import { describe, expect, it } from "vitest";
import { loadOnboardingCatalog } from "./catalog";
import { createFakeDb } from "./testing/fake-db";

function setup() {
  return createFakeDb({
    userId: "u",
    tables: {
      pillars: [
        { id: "p-read", slug: "reading", sort: 9 },
        { id: "p-ex", slug: "exercise", sort: 1 },
      ],
      habit_templates: [
        { id: "t2", pillar_id: "p-ex", sort: 2 },
        { id: "t1", pillar_id: "p-ex", sort: 1 },
        { id: "t3", pillar_id: "p-read", sort: 1 },
      ],
      habit_templates_i18n: [
        { template_id: "t1", locale: "pt", title: "Caminhar" },
        { template_id: "t1", locale: "en", title: "Walk" },
        { template_id: "t2", locale: "pt", title: "Treino" },
        { template_id: "t2", locale: "en", title: "Workout" },
        { template_id: "t3", locale: "pt", title: "Ler" },
      ],
    },
    relations: { habit_templates_i18n: { table: "habit_templates_i18n", foreignKey: "template_id" } },
  });
}

describe("loadOnboardingCatalog", () => {
  it("groups templates by pillar, both ordered by sort, with titles in both locales", async () => {
    const catalog = await loadOnboardingCatalog(setup().db);
    expect(catalog).toEqual([
      {
        id: "p-ex",
        slug: "exercise",
        templates: [
          { id: "t1", title: { pt: "Caminhar", en: "Walk" } },
          { id: "t2", title: { pt: "Treino", en: "Workout" } },
        ],
      },
      // a missing translation falls back to the other locale
      { id: "p-read", slug: "reading", templates: [{ id: "t3", title: { pt: "Ler", en: "Ler" } }] },
    ]);
  });

  it("throws when the catalog cannot be read", async () => {
    const fake = setup();
    fake.failNext("pillars", "select");
    await expect(loadOnboardingCatalog(fake.db)).rejects.toThrow(/pillars/);
  });
});
