import { describe, expect, it } from "vitest";
import { DataError } from "./errors";
import { createFakeDb, type Row } from "./testing/fake-db";
import { getHeaderStats, getToday, LogValidationError, logHabit, MANUAL_SOURCE, NO_LOG_SOURCE } from "./today";

const USER = "user-1";
const TODAY = "2026-11-06";

const pillars: Row[] = [
  { id: "p-reading", slug: "reading", sort: 9 },
  { id: "p-exercise", slug: "exercise", sort: 1 },
  { id: "p-meditation", slug: "meditation", sort: 7 },
  { id: "p-family", slug: "family", sort: 10 },
];

const habit = (over: Row): Row => ({
  user_id: USER,
  kind: "check",
  target: null,
  active: true,
  deleted_at: null,
  created_at: "2026-11-01T10:00:00Z",
  ...over,
});

const habits: Row[] = [
  habit({ id: "h-read", pillar_id: "p-reading", title: "Ler 20 min", kind: "value", target: 20 }),
  habit({ id: "h-walk", pillar_id: "p-exercise", title: "Caminhar", kind: "value", target: 30, created_at: "2026-11-02T10:00:00Z" }),
  habit({ id: "h-workout", pillar_id: "p-exercise", title: "Treino", created_at: "2026-11-01T09:00:00Z" }),
  habit({ id: "h-paused", pillar_id: "p-meditation", title: "Meditar", active: false }),
  habit({ id: "h-archived", pillar_id: "p-family", title: "Família", deleted_at: "2026-11-03T10:00:00Z" }),
  habit({ id: "h-free", pillar_id: "p-reading", title: "Ler livre", kind: "value", target: null, created_at: "2026-11-03T10:00:00Z" }),
];

const logs: Row[] = [
  { id: "l1", user_id: USER, user_habit_id: "h-walk", date: TODAY, value: 12, source: "strava" },
  { id: "l2", user_id: USER, user_habit_id: "h-workout", date: TODAY, value: 1, source: "manual" },
  { id: "l3", user_id: USER, user_habit_id: "h-archived", date: TODAY, value: 1, source: "manual" },
  { id: "l4", user_id: USER, user_habit_id: "h-paused", date: TODAY, value: 1, source: "manual" },
  { id: "l5", user_id: USER, user_habit_id: "h-read", date: "2026-11-05", value: 20, source: "manual" },
];

function setup(tables: Record<string, Row[]> = {}) {
  return createFakeDb({
    userId: USER,
    tables: { pillars, user_habits: habits, habit_logs: logs, user_stats: [], ...tables },
    unique: [{ table: "habit_logs", collides: (a, b) => a.user_habit_id === b.user_habit_id && a.date === b.date }],
  });
}

describe("getToday", () => {
  it("groups active habits by pillar, ordered by pillars.sort, omitting pillars without habits", async () => {
    const { pillars: out } = await getToday(setup().db, TODAY);
    expect(out.map((p) => p.slug)).toEqual(["exercise", "reading"]);
    expect(out.map((p) => p.pillarId)).toEqual(["p-exercise", "p-reading"]);
  });

  it("orders habits inside a pillar by creation time", async () => {
    const { pillars: out } = await getToday(setup().db, TODAY);
    expect(out[0].habits.map((h) => h.id)).toEqual(["h-workout", "h-walk"]);
    expect(out[1].habits.map((h) => h.id)).toEqual(["h-read", "h-free"]);
  });

  it("never shows inactive or archived habits, nor their logs", async () => {
    const { pillars: out } = await getToday(setup().db, TODAY);
    const ids = out.flatMap((p) => p.habits.map((h) => h.id));
    expect(ids).not.toContain("h-paused");
    expect(ids).not.toContain("h-archived");
    expect(out.map((p) => p.slug)).not.toContain("family");
    expect(out.map((p) => p.slug)).not.toContain("meditation");
  });

  it("maps that day's log value and source, with defaults when there is no log", async () => {
    const { pillars: out } = await getToday(setup().db, TODAY);
    expect(out[0].habits).toEqual([
      { id: "h-workout", title: "Treino", kind: "check", target: 1, value: 1, source: "manual" },
      { id: "h-walk", title: "Caminhar", kind: "value", target: 30, value: 12, source: "strava" },
    ]);
    // h-read has a log on another day only
    expect(out[1].habits[0]).toEqual({ id: "h-read", title: "Ler 20 min", kind: "value", target: 20, value: 0, source: NO_LOG_SOURCE });
  });

  it("uses target 0 for a value habit without a target", async () => {
    const { pillars: out } = await getToday(setup().db, TODAY);
    expect(out[1].habits[1]).toMatchObject({ id: "h-free", target: 0, value: 0 });
  });

  it("reads another day when asked (backfill)", async () => {
    const { pillars: out } = await getToday(setup().db, "2026-11-05");
    expect(out[1].habits[0]).toMatchObject({ id: "h-read", value: 20, source: "manual" });
    expect(out[0].habits[1]).toMatchObject({ id: "h-walk", value: 0, source: NO_LOG_SOURCE });
  });

  it("returns no pillars for a user with zero active habits", async () => {
    expect(await getToday(setup({ user_habits: [] }).db, TODAY)).toEqual({ pillars: [] });
  });

  it("rejects a malformed date", async () => {
    await expect(getToday(setup().db, "2026-11-6")).rejects.toMatchObject({ code: "invalid_date" });
  });

  it("throws a DataError when a query fails", async () => {
    const fake = setup();
    fake.failNext("user_habits", "select");
    await expect(getToday(fake.db, TODAY)).rejects.toBeInstanceOf(DataError);
  });
});

describe("logHabit", () => {
  const input = (over: Partial<{ userHabitId: string; date: string; value: number }> = {}) => ({
    userHabitId: "h-read",
    userId: USER,
    date: TODAY,
    value: 1,
    ...over,
  });

  it("upserts on (user_habit_id, date) with user_id, value and source 'manual' explicitly", async () => {
    const fake = setup();
    await logHabit(fake.db, input({ value: 15 }), TODAY);
    expect(fake.writes).toEqual([
      {
        table: "habit_logs",
        op: "upsert",
        onConflict: "user_habit_id,date",
        payload: { user_habit_id: "h-read", user_id: USER, date: TODAY, value: 15, source: MANUAL_SOURCE },
      },
    ]);
    expect(MANUAL_SOURCE).toBe("manual");
  });

  it("accepts today and up to backfillDays (2) days before today", async () => {
    const fake = setup();
    await logHabit(fake.db, input({ date: TODAY }), TODAY);
    await logHabit(fake.db, input({ date: "2026-11-05" }), TODAY);
    await logHabit(fake.db, input({ date: "2026-11-04" }), TODAY);
    expect(fake.writes).toHaveLength(3);
  });

  it("works across a month boundary", async () => {
    const fake = setup();
    await logHabit(fake.db, input({ date: "2026-10-30" }), "2026-11-01");
    await expect(logHabit(fake.db, input({ date: "2026-10-29" }), "2026-11-01")).rejects.toMatchObject({
      code: "outside_backfill",
    });
  });

  it.each([
    ["3 days ago", "2026-11-03", "outside_backfill"],
    ["tomorrow", "2026-11-07", "future_date"],
    ["malformed", "06/11/2026", "invalid_date"],
    ["impossible", "2026-02-30", "invalid_date"],
    ["empty", "", "invalid_date"],
  ])("rejects a date %s without writing", async (_label, date, code) => {
    const fake = setup();
    const err = await logHabit(fake.db, input({ date }), TODAY).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LogValidationError);
    expect(err).toMatchObject({ code });
    expect(fake.writes).toHaveLength(0);
  });

  it.each([
    ["negative", -1],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("rejects a %s value without writing", async (_label, value) => {
    const fake = setup();
    await expect(logHabit(fake.db, input({ value }), TODAY)).rejects.toMatchObject({ code: "invalid_value" });
    expect(fake.writes).toHaveLength(0);
  });

  it("rejects a malformed `today`", async () => {
    await expect(logHabit(setup().db, input(), "nope")).rejects.toMatchObject({ code: "invalid_date" });
  });

  it("un-ticks a check habit by writing value 0 through the same upsert", async () => {
    const fake = setup();
    await logHabit(fake.db, input({ userHabitId: "h-workout", value: 0 }), TODAY);
    expect(fake.writes[0]).toMatchObject({ op: "upsert", payload: { value: 0, source: "manual" } });
    const rows = fake.tables.habit_logs.filter((l) => l.user_habit_id === "h-workout" && l.date === TODAY);
    expect(rows).toEqual([expect.objectContaining({ value: 0 })]);
  });

  it("logging the same (habit, date) twice keeps one row with the last value", async () => {
    const fake = setup();
    await logHabit(fake.db, input({ value: 5 }), TODAY);
    await logHabit(fake.db, input({ value: 18 }), TODAY);
    const rows = fake.tables.habit_logs.filter((l) => l.user_habit_id === "h-read" && l.date === TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(18);
  });

  it("turns a provider-filled row into a manual one (manual value prevails)", async () => {
    const fake = setup();
    await logHabit(fake.db, input({ userHabitId: "h-walk", value: 30 }), TODAY);
    const rows = fake.tables.habit_logs.filter((l) => l.user_habit_id === "h-walk" && l.date === TODAY);
    expect(rows).toEqual([expect.objectContaining({ value: 30, source: "manual" })]);
  });

  it("throws a DataError carrying the PostgREST code and HTTP status on failure", async () => {
    const fake = setup();
    fake.failNext("habit_logs", "upsert", { code: "42501", message: "new row violates row-level security policy" }, 403);
    await expect(logHabit(fake.db, input(), TODAY)).rejects.toMatchObject({
      name: "DataError",
      code: "42501",
      status: 403,
    });
  });
});

describe("getHeaderStats", () => {
  it("defaults to 0 XP, level 1 and no streak when the user has no stats row", async () => {
    expect(await getHeaderStats(setup().db)).toEqual({ xpTotal: 0, level: 1, currentStreak: 0 });
  });

  it("reads xp_total, level and current_streak", async () => {
    const fake = setup({
      user_stats: [{ user_id: USER, xp_total: 140, level: 2, current_streak: 3, best_streak: 5 }],
    });
    expect(await getHeaderStats(fake.db)).toEqual({ xpTotal: 140, level: 2, currentStreak: 3 });
  });

  it("throws a DataError when the query fails", async () => {
    const fake = setup();
    fake.failNext("user_stats", "select");
    await expect(getHeaderStats(fake.db)).rejects.toBeInstanceOf(DataError);
  });
});
