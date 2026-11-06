import { describe, expect, it } from "vitest";
import { completeOnboarding } from "./onboarding";
import { createFakeDb, type Row } from "./testing/fake-db";

const USER = "user-1";
const NOW = "2026-11-06T10:00:00.000Z";

const templates: Row[] = [
  { id: "t-walk", pillar_id: "p-exercise", slug: "walk-30", kind: "value", default_target: 30 },
  { id: "t-workout", pillar_id: "p-exercise", slug: "workout", kind: "check", default_target: null },
  { id: "t-meditate", pillar_id: "p-meditation", slug: "meditate-10", kind: "value", default_target: 10 },
  { id: "t-read", pillar_id: "p-reading", slug: "read", kind: "check", default_target: null },
];
const i18n: Row[] = [
  ["t-walk", "Caminhar 30 min", "Walk 30 min"],
  ["t-workout", "Treino do dia", "Daily workout"],
  ["t-meditate", "Meditar 10 min", "Meditate 10 min"],
  ["t-read", "Ler 20 páginas", "Read 20 pages"],
].flatMap(([id, pt, en]) => [
  { template_id: id, locale: "pt", title: pt },
  { template_id: id, locale: "en", title: en },
]);

function setup(userId: string | null = USER) {
  return createFakeDb({
    userId,
    now: () => NOW,
    tables: { habit_templates: templates, habit_templates_i18n: i18n, profiles: [], user_habits: [] },
    defaults: { profiles: { display_name: null, onboarded_at: null }, user_habits: { deleted_at: null, active: true } },
    relations: { habit_templates_i18n: { table: "habit_templates_i18n", foreignKey: "template_id" } },
    unique: [
      {
        table: "user_habits",
        collides: (a, b) =>
          a.user_id === b.user_id &&
          a.template_id != null &&
          a.template_id === b.template_id &&
          a.deleted_at == null &&
          b.deleted_at == null,
      },
    ],
  });
}

const three = ["t-walk", "t-workout", "t-meditate"];
const habitsOf = (rows: Row[]) =>
  rows
    .map(({ user_id, template_id, pillar_id, title, kind, target }) => ({ user_id, template_id, pillar_id, title, kind, target }))
    .sort((a, b) => String(a.template_id).localeCompare(String(b.template_id)));

describe("completeOnboarding", () => {
  it("creates one user_habit per template with pillar/kind/target and the PT title", async () => {
    const fake = setup();
    await completeOnboarding(fake.db, { locale: "pt", timezone: "Europe/Lisbon", habitTemplateIds: three });

    expect(habitsOf(fake.tables.user_habits)).toEqual([
      { user_id: USER, template_id: "t-meditate", pillar_id: "p-meditation", title: "Meditar 10 min", kind: "value", target: 10 },
      { user_id: USER, template_id: "t-walk", pillar_id: "p-exercise", title: "Caminhar 30 min", kind: "value", target: 30 },
      { user_id: USER, template_id: "t-workout", pillar_id: "p-exercise", title: "Treino do dia", kind: "check", target: null },
    ]);
  });

  it("uses the EN title when the chosen locale is en", async () => {
    const fake = setup();
    await completeOnboarding(fake.db, { locale: "en", timezone: "UTC", habitTemplateIds: three });
    expect(fake.tables.user_habits.map((h) => h.title).sort()).toEqual(["Daily workout", "Meditate 10 min", "Walk 30 min"]);
  });

  it("upserts the profile with locale and timezone and sets onboarded_at", async () => {
    const fake = setup();
    await completeOnboarding(fake.db, { locale: "en", timezone: "America/New_York", habitTemplateIds: three });
    expect(fake.tables.profiles).toHaveLength(1);
    expect(fake.tables.profiles[0]).toMatchObject({
      user_id: USER,
      locale: "en",
      timezone: "America/New_York",
      display_name: null,
    });
    expect(typeof fake.tables.profiles[0].onboarded_at).toBe("string");
  });

  it("keeps an existing display_name", async () => {
    const fake = setup();
    fake.tables.profiles.push({ user_id: USER, locale: "pt", timezone: "UTC", display_name: "Ana", onboarded_at: null });
    await completeOnboarding(fake.db, { locale: "pt", timezone: "Europe/Lisbon", habitTemplateIds: [] });
    expect(fake.tables.profiles[0]).toMatchObject({ display_name: "Ana", timezone: "Europe/Lisbon" });
  });

  it("is idempotent: a second call does not duplicate habits", async () => {
    const fake = setup();
    const input = { locale: "pt" as const, timezone: "Europe/Lisbon", habitTemplateIds: three };
    await completeOnboarding(fake.db, input);
    await completeOnboarding(fake.db, input);
    expect(fake.tables.user_habits).toHaveLength(3);
    expect(fake.tables.profiles).toHaveLength(1);
  });

  it("adds only the missing habits when called again with more templates", async () => {
    const fake = setup();
    await completeOnboarding(fake.db, { locale: "pt", timezone: "UTC", habitTemplateIds: ["t-walk"] });
    await completeOnboarding(fake.db, { locale: "pt", timezone: "UTC", habitTemplateIds: [...three, "t-read"] });
    expect(fake.tables.user_habits.map((h) => h.template_id).sort()).toEqual(["t-meditate", "t-read", "t-walk", "t-workout"]);
  });

  it("ignores another user's and soft-deleted habits when checking for duplicates", async () => {
    const fake = setup();
    fake.tables.user_habits.push(
      { id: "x1", user_id: "someone-else", template_id: "t-walk", pillar_id: "p-exercise", title: "x", kind: "value", deleted_at: null },
      { id: "x2", user_id: USER, template_id: "t-workout", pillar_id: "p-exercise", title: "old", kind: "check", deleted_at: NOW },
    );
    await completeOnboarding(fake.db, { locale: "pt", timezone: "UTC", habitTemplateIds: ["t-walk", "t-workout"] });
    const mine = fake.tables.user_habits.filter((h) => h.user_id === USER && h.deleted_at == null);
    expect(mine.map((h) => h.template_id).sort()).toEqual(["t-walk", "t-workout"]);
  });

  it("does not set onboarded_at when creating habits fails, and a retry converges", async () => {
    const fake = setup();
    const input = { locale: "pt" as const, timezone: "Europe/Lisbon", habitTemplateIds: three };
    fake.failNext("user_habits", "insert");
    await expect(completeOnboarding(fake.db, input)).rejects.toThrow();
    expect(fake.tables.profiles[0]?.onboarded_at ?? null).toBeNull();
    expect(fake.tables.user_habits).toHaveLength(0);

    await completeOnboarding(fake.db, input);
    expect(fake.tables.user_habits).toHaveLength(3);
    expect(fake.tables.profiles[0].onboarded_at).toEqual(expect.any(String));
  });

  it("does not set onboarded_at when the profile upsert fails", async () => {
    const fake = setup();
    fake.failNext("profiles", "upsert");
    await expect(completeOnboarding(fake.db, { locale: "pt", timezone: "UTC", habitTemplateIds: three })).rejects.toThrow();
    expect(fake.tables.profiles).toHaveLength(0);
    expect(fake.tables.user_habits).toHaveLength(0);
  });

  it("recovers from a concurrent duplicate (23505) by re-reading existing habits", async () => {
    const fake = setup();
    fake.failNext("user_habits", "insert", { code: "23505", message: "duplicate key" });
    await completeOnboarding(fake.db, { locale: "pt", timezone: "UTC", habitTemplateIds: three });
    expect(fake.tables.user_habits).toHaveLength(3);
    expect(fake.tables.profiles[0].onboarded_at).toEqual(expect.any(String));
  });

  it("sets onboarded_at last", async () => {
    const fake = setup();
    await completeOnboarding(fake.db, { locale: "pt", timezone: "UTC", habitTemplateIds: three });
    const last = fake.calls.at(-1);
    expect(last).toEqual({ table: "profiles", op: "update" });
  });

  it("accepts an empty template list and still sets onboarded_at", async () => {
    const fake = setup();
    await completeOnboarding(fake.db, { locale: "pt", timezone: "UTC", habitTemplateIds: [] });
    expect(fake.tables.user_habits).toHaveLength(0);
    expect(fake.tables.profiles[0].onboarded_at).toEqual(expect.any(String));
  });

  it("collapses duplicate template ids in the input", async () => {
    const fake = setup();
    await completeOnboarding(fake.db, {
      locale: "pt",
      timezone: "UTC",
      habitTemplateIds: ["t-walk", "t-walk", "t-workout", "t-walk"],
    });
    expect(fake.tables.user_habits.map((h) => h.template_id).sort()).toEqual(["t-walk", "t-workout"]);
  });

  it("rejects an unknown locale", async () => {
    const fake = setup();
    await expect(
      completeOnboarding(fake.db, { locale: "fr" as "pt", timezone: "UTC", habitTemplateIds: three }),
    ).rejects.toThrow(/locale/i);
    expect(fake.calls).toHaveLength(0);
  });

  it.each(["", "   ", "Mars/Olympus_Mons", "not a zone"])("rejects the invalid timezone %j", async (timezone) => {
    const fake = setup();
    await expect(completeOnboarding(fake.db, { locale: "pt", timezone, habitTemplateIds: three })).rejects.toThrow(/timezone/i);
    expect(fake.calls).toHaveLength(0);
  });

  it("rejects template ids that do not exist, without setting onboarded_at", async () => {
    const fake = setup();
    await expect(
      completeOnboarding(fake.db, { locale: "pt", timezone: "UTC", habitTemplateIds: ["t-walk", "t-nope"] }),
    ).rejects.toThrow(/template/i);
    expect(fake.tables.user_habits).toHaveLength(0);
    expect(fake.tables.profiles[0]?.onboarded_at ?? null).toBeNull();
  });

  it("throws when there is no signed-in user", async () => {
    const fake = setup(null);
    await expect(completeOnboarding(fake.db, { locale: "pt", timezone: "UTC", habitTemplateIds: three })).rejects.toThrow(
      /signed in/i,
    );
  });
});
