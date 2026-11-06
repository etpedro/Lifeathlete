import { describe, expect, it } from "vitest";
import {
  archiveHabit,
  createCustomHabit,
  HabitError,
  listManageableHabits,
  listPillars,
  MAX_TITLE_LENGTH,
  setHabitActive,
  updateHabitTarget,
} from "./habits";
import { createFakeDb, type Row } from "./testing/fake-db";
import { getToday } from "./today";

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
  target: 1,
  template_id: null,
  active: true,
  deleted_at: null,
  created_at: "2026-11-01T10:00:00Z",
  ...over,
});

const habits: Row[] = [
  habit({ id: "h-read", pillar_id: "p-reading", title: "Ler", kind: "value", target: 20, template_id: "t1" }),
  habit({ id: "h-walk", pillar_id: "p-exercise", title: "Caminhar", kind: "value", target: 30, created_at: "2026-11-02T10:00:00Z" }),
  habit({ id: "h-workout", pillar_id: "p-exercise", title: "Treino", created_at: "2026-11-01T09:00:00Z", template_id: "t2" }),
  habit({ id: "h-paused", pillar_id: "p-meditation", title: "Meditar", active: false }),
  habit({ id: "h-archived", pillar_id: "p-family", title: "Família", deleted_at: "2026-11-03T10:00:00Z" }),
];

const logs: Row[] = [
  { id: "l1", user_id: USER, user_habit_id: "h-walk", date: TODAY, value: 12, source: "manual" },
  { id: "l2", user_id: USER, user_habit_id: "h-walk", date: "2026-11-05", value: 30, source: "strava" },
  { id: "l3", user_id: USER, user_habit_id: "h-workout", date: TODAY, value: 1, source: "manual" },
  { id: "l4", user_id: USER, user_habit_id: "h-paused", date: TODAY, value: 1, source: "manual" },
];

function setup() {
  return createFakeDb({
    userId: USER,
    tables: { pillars, user_habits: habits, habit_logs: logs },
    defaults: { user_habits: { deleted_at: null } }, // SQL column default
  });
}

const row = (f: ReturnType<typeof setup>, id: string) => f.tables.user_habits.find((h) => h.id === id)!;
const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(HabitError);
    return (e as HabitError).code;
  }
  return "no error";
};

describe("createCustomHabit", () => {
  const input = { userId: USER, pillarId: "p-reading", title: "Escrever", kind: "value" as const, target: 3 };

  it("inserts an active, template-less habit owned by the user and returns its id", async () => {
    const f = setup();
    const { id } = await createCustomHabit(f.db, input);
    expect(row(f, id)).toMatchObject({
      user_id: USER,
      pillar_id: "p-reading",
      title: "Escrever",
      kind: "value",
      target: 3,
      template_id: null,
      active: true,
      deleted_at: null,
    });
  });

  it("trims the title; 80 chars ok, 81 rejected, empty / whitespace-only rejected", async () => {
    const f = setup();
    const { id } = await createCustomHabit(f.db, { ...input, title: "  Escrever  " });
    expect(row(f, id).title).toBe("Escrever");
    await createCustomHabit(f.db, { ...input, title: "a".repeat(MAX_TITLE_LENGTH) });
    expect(await codeOf(createCustomHabit(f.db, { ...input, title: "a".repeat(MAX_TITLE_LENGTH + 1) }))).toBe("invalid_title");
    expect(await codeOf(createCustomHabit(f.db, { ...input, title: "" }))).toBe("invalid_title");
    expect(await codeOf(createCustomHabit(f.db, { ...input, title: "   \t " }))).toBe("invalid_title");
    expect(await codeOf(createCustomHabit(f.db, { ...input, title: "  " + "a".repeat(81) + "  " }))).toBe("invalid_title");
    await createCustomHabit(f.db, { ...input, title: "  " + "a".repeat(80) + "  " }); // trimmed length counts
  });

  it("rejects an unknown kind", async () => {
    const f = setup();
    expect(await codeOf(createCustomHabit(f.db, { ...input, kind: "other" as never }))).toBe("invalid_kind");
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("rejects value target %s", async (target) => {
    const f = setup();
    const before = f.tables.user_habits.length;
    expect(await codeOf(createCustomHabit(f.db, { ...input, target }))).toBe("invalid_target");
    expect(f.tables.user_habits).toHaveLength(before);
  });

  it("accepts a fractional value target (0.5)", async () => {
    const f = setup();
    const { id } = await createCustomHabit(f.db, { ...input, target: 0.5 });
    expect(row(f, id).target).toBe(0.5);
  });

  it("stores target 1 for a check habit whatever was passed (even invalid numbers)", async () => {
    const f = setup();
    for (const target of [7, 0, -3, Number.NaN]) {
      const { id } = await createCustomHabit(f.db, { ...input, kind: "check", target });
      expect(row(f, id)).toMatchObject({ kind: "check", target: 1 });
    }
  });

  it("validates before touching the database", async () => {
    const f = setup();
    await codeOf(createCustomHabit(f.db, { ...input, title: "" }));
    expect(f.writes).toHaveLength(0);
  });

  it("surfaces backend failures as a typed save_failed error without leaking the raw message", async () => {
    const f = setup();
    f.failNext("user_habits", "insert", { code: "42501", message: "secret internal detail" });
    const err = await createCustomHabit(f.db, input).catch((e) => e);
    expect(err).toBeInstanceOf(HabitError);
    expect(err.code).toBe("save_failed");
    expect(err.message).not.toContain("secret");
  });

  it("the new habit shows up in getToday", async () => {
    const f = setup();
    const { id } = await createCustomHabit(f.db, input);
    const today = await getToday(f.db, TODAY);
    expect(today.pillars.flatMap((p) => p.habits.map((h) => h.id))).toContain(id);
  });
});

describe("updateHabitTarget", () => {
  it("updates a value habit's target (fractional ok)", async () => {
    const f = setup();
    await updateHabitTarget(f.db, "h-walk", 45);
    expect(row(f, "h-walk").target).toBe(45);
    await updateHabitTarget(f.db, "h-walk", 0.5);
    expect(row(f, "h-walk").target).toBe(0.5);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("rejects %s and leaves the target", async (target) => {
    const f = setup();
    expect(await codeOf(updateHabitTarget(f.db, "h-walk", target))).toBe("invalid_target");
    expect(row(f, "h-walk").target).toBe(30);
  });

  it("rejects a check habit (invalid_target) and keeps target 1", async () => {
    const f = setup();
    expect(await codeOf(updateHabitTarget(f.db, "h-workout", 5))).toBe("invalid_target");
    expect(row(f, "h-workout").target).toBe(1);
  });

  it("unknown or archived id -> not_found", async () => {
    const f = setup();
    expect(await codeOf(updateHabitTarget(f.db, "nope", 5))).toBe("not_found");
    expect(await codeOf(updateHabitTarget(f.db, "h-archived", 5))).toBe("not_found");
  });
});

describe("setHabitActive", () => {
  it("false hides the habit from getToday but keeps its logs; true shows it again", async () => {
    const f = setup();
    const ids = async () => (await getToday(f.db, TODAY)).pillars.flatMap((p) => p.habits.map((h) => h.id));
    expect(await ids()).toContain("h-walk");
    const logsBefore = f.tables.habit_logs.length;
    await setHabitActive(f.db, "h-walk", false);
    expect(row(f, "h-walk").active).toBe(false);
    expect(await ids()).not.toContain("h-walk");
    expect(f.tables.habit_logs).toHaveLength(logsBefore);
    await setHabitActive(f.db, "h-walk", true);
    expect(await ids()).toContain("h-walk");
  });

  it("works on a paused habit and does not touch deleted_at", async () => {
    const f = setup();
    await setHabitActive(f.db, "h-paused", true);
    expect(row(f, "h-paused")).toMatchObject({ active: true, deleted_at: null });
  });

  it("does not touch an archived habit: not_found", async () => {
    const f = setup();
    expect(await codeOf(setHabitActive(f.db, "h-archived", true))).toBe("not_found");
    expect(row(f, "h-archived").active).toBe(true); // unchanged fixture value
    expect(await codeOf(setHabitActive(f.db, "nope", false))).toBe("not_found");
  });
});

describe("archiveHabit", () => {
  it("soft-deletes: deleted_at = now, active = false, row kept", async () => {
    const f = setup();
    const before = Date.now();
    await archiveHabit(f.db, "h-walk");
    const r = row(f, "h-walk");
    expect(r.active).toBe(false);
    expect(typeof r.deleted_at).toBe("string");
    const at = Date.parse(r.deleted_at as string);
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });

  it("keeps every habit_logs row, and the habit disappears from getToday and listManageableHabits", async () => {
    const f = setup();
    const countFor = () => f.tables.habit_logs.filter((l) => l.user_habit_id === "h-walk").length;
    const total = f.tables.habit_logs.length;
    expect(countFor()).toBe(2);
    await archiveHabit(f.db, "h-walk");
    expect(countFor()).toBe(2);
    expect(f.tables.habit_logs).toHaveLength(total);
    expect(f.writes.every((w) => w.table === "user_habits")).toBe(true); // never wrote habit_logs
    const today = await getToday(f.db, TODAY);
    expect(today.pillars.flatMap((p) => p.habits.map((h) => h.id))).not.toContain("h-walk");
    const manage = await listManageableHabits(f.db);
    expect(manage.flatMap((p) => p.habits.map((h) => h.id))).not.toContain("h-walk");
  });

  it("archiving an unknown or already archived habit -> not_found (no write, original deleted_at kept)", async () => {
    const f = setup();
    expect(await codeOf(archiveHabit(f.db, "nope"))).toBe("not_found");
    expect(await codeOf(archiveHabit(f.db, "h-archived"))).toBe("not_found");
    expect(row(f, "h-archived").deleted_at).toBe("2026-11-03T10:00:00Z");
    expect(f.writes).toHaveLength(0);
    await archiveHabit(f.db, "h-walk");
    expect(await codeOf(archiveHabit(f.db, "h-walk"))).toBe("not_found");
  });
});

describe("listManageableHabits", () => {
  it("lists active and paused habits grouped by pillars.sort, omitting empty and archived-only pillars", async () => {
    const out = await listManageableHabits(setup().db);
    expect(out.map((p) => p.slug)).toEqual(["exercise", "meditation", "reading"]);
    expect(out.map((p) => p.pillarId)).toEqual(["p-exercise", "p-meditation", "p-reading"]);
  });

  it("maps fields, fromTemplate and active; orders habits by creation inside a pillar", async () => {
    const out = await listManageableHabits(setup().db);
    expect(out[0].habits).toEqual([
      { id: "h-workout", title: "Treino", kind: "check", target: 1, active: true, fromTemplate: true },
      { id: "h-walk", title: "Caminhar", kind: "value", target: 30, active: true, fromTemplate: false },
    ]);
    expect(out[1].habits[0]).toMatchObject({ id: "h-paused", active: false, fromTemplate: false });
  });

  it("coerces numeric strings and null targets safely", async () => {
    const f = createFakeDb({
      userId: USER,
      tables: {
        pillars,
        user_habits: [
          habit({ id: "a", pillar_id: "p-reading", title: "A", kind: "value", target: "2.5" }),
          habit({ id: "b", pillar_id: "p-reading", title: "B", kind: "value", target: null, created_at: "2026-11-02T00:00:00Z" }),
        ],
        habit_logs: [],
      },
    });
    const out = await listManageableHabits(f.db);
    expect(out[0].habits.map((h) => h.target)).toEqual([2.5, 0]);
  });
});

describe("listPillars", () => {
  it("returns every pillar ordered by sort", async () => {
    const out = await listPillars(setup().db);
    expect(out.map((p) => p.slug)).toEqual(["exercise", "meditation", "reading", "family"]);
    expect(out[0]).toEqual({ id: "p-exercise", slug: "exercise" });
  });
});
