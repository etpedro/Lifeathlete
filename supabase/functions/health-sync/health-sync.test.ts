import { describe, expect, it } from "vitest";
import {
  consentGiven,
  errorStatus,
  MAX_STEPS,
  parseRequest,
  planSync,
  recalculateUrl,
  syncResponse,
  todayFor,
  type ExistingLog,
  type LogRow,
  type StepHabit,
} from "./health-sync.ts";

const TODAY = "2026-11-08";

const sync = (days: unknown, extra: Record<string, unknown> = {}) => ({
  action: "sync",
  source: "health_connect",
  days,
  ...extra,
});

describe("parseRequest: envelope", () => {
  it.each([null, undefined, 42, "sync", [], true])("rejects a non-object body (%s)", (body) => {
    expect(parseRequest(body, TODAY)).toEqual({ ok: false, error: "invalid_request" });
  });

  it("rejects an unknown or missing action", () => {
    expect(parseRequest({ action: "delete_all", source: "health_connect" }, TODAY)).toEqual({
      ok: false,
      error: "invalid_request",
    });
    expect(parseRequest({ source: "health_connect" }, TODAY)).toEqual({ ok: false, error: "invalid_request" });
  });

  it("rejects another source as unsupported_source and a missing one as invalid_request", () => {
    for (const action of ["connect", "sync", "disconnect"]) {
      expect(parseRequest({ action, source: "apple_health", consent: true, consentVersion: "v1", days: [] }, TODAY))
        .toEqual({ ok: false, error: "unsupported_source" });
      expect(parseRequest({ action }, TODAY)).toEqual({ ok: false, error: "invalid_request" });
      expect(parseRequest({ action, source: 7 }, TODAY)).toEqual({ ok: false, error: "invalid_request" });
    }
  });

  it("ignores a user id in the body (the user only comes from the JWT)", () => {
    const res = parseRequest({ action: "disconnect", source: "health_connect", userId: "someone-else" }, TODAY);
    expect(res).toEqual({ ok: true, request: { action: "disconnect", source: "health_connect" } });
  });
});

describe("parseRequest: connect", () => {
  const connect = (extra: Record<string, unknown>) => ({ action: "connect", source: "health_connect", ...extra });

  it("accepts explicit consent with a consent version", () => {
    expect(parseRequest(connect({ consent: true, consentVersion: "2026-11" }), TODAY)).toEqual({
      ok: true,
      request: { action: "connect", source: "health_connect", consentVersion: "2026-11" },
    });
  });

  it.each([false, "true", 1, undefined, null])("requires consent to be exactly true (%s)", (consent) => {
    expect(parseRequest(connect({ consent, consentVersion: "v1" }), TODAY)).toEqual({
      ok: false,
      error: "invalid_request",
    });
  });

  it.each(["", "   ", "x".repeat(33), 3, undefined])("rejects a bad consentVersion (%s)", (consentVersion) => {
    expect(parseRequest(connect({ consent: true, consentVersion }), TODAY)).toEqual({
      ok: false,
      error: "invalid_request",
    });
  });

  it("accepts a 32-character consent version", () => {
    expect(parseRequest(connect({ consent: true, consentVersion: "x".repeat(32) }), TODAY).ok).toBe(true);
  });
});

describe("parseRequest: sync", () => {
  it("accepts 1..7 unique days in [today - 7, today] and rounds steps", () => {
    const res = parseRequest(
      sync([
        { date: "2026-11-08", steps: 4321.6 },
        { date: "2026-11-01", steps: 0 },
        { date: "2026-11-07", steps: MAX_STEPS },
      ]),
      TODAY,
    );
    expect(res).toEqual({
      ok: true,
      request: {
        action: "sync",
        source: "health_connect",
        days: [
          { date: "2026-11-08", steps: 4322 },
          { date: "2026-11-01", steps: 0 },
          { date: "2026-11-07", steps: MAX_STEPS },
        ],
      },
    });
  });

  it("accepts exactly 7 days", () => {
    const days = Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-0${i + 2}`, steps: 100 }));
    expect(parseRequest(sync(days), TODAY).ok).toBe(true);
  });

  it.each([
    ["no days", []],
    ["8 days", Array.from({ length: 8 }, (_, i) => ({ date: `2026-11-0${i + 1}`, steps: 1 }))],
    ["not an array", { date: TODAY, steps: 1 }],
    ["duplicate dates", [{ date: TODAY, steps: 1 }, { date: TODAY, steps: 2 }]],
    ["a non-calendar date", [{ date: "2026-02-30", steps: 1 }]],
    ["a malformed date", [{ date: "8/11/2026", steps: 1 }]],
    ["a missing date", [{ steps: 1 }]],
    ["a future date", [{ date: "2026-11-09", steps: 1 }]],
    ["a date before today - 7", [{ date: "2026-10-31", steps: 1 }]],
    ["NaN steps", [{ date: TODAY, steps: Number.NaN }]],
    ["infinite steps", [{ date: TODAY, steps: Number.POSITIVE_INFINITY }]],
    ["negative steps", [{ date: TODAY, steps: -1 }]],
    ["steps over the cap", [{ date: TODAY, steps: MAX_STEPS + 1 }]],
    ["steps as a string", [{ date: TODAY, steps: "500" }]],
    ["a null entry", [null]],
  ])("rejects %s as invalid_request (nothing is clamped)", (_name, days) => {
    expect(parseRequest(sync(days), TODAY)).toEqual({ ok: false, error: "invalid_request" });
  });

  it("rejects the whole batch when one entry is bad", () => {
    expect(
      parseRequest(sync([{ date: TODAY, steps: 10 }, { date: "2026-11-07", steps: -5 }]), TODAY),
    ).toEqual({ ok: false, error: "invalid_request" });
  });

  it("uses the given today for the window (month boundary)", () => {
    expect(parseRequest(sync([{ date: "2026-02-22", steps: 1 }]), "2026-03-01").ok).toBe(true);
    expect(parseRequest(sync([{ date: "2026-02-21", steps: 1 }]), "2026-03-01").ok).toBe(false);
  });
});

describe("todayFor", () => {
  it("is the local date in the profile timezone", () => {
    expect(todayFor("2026-11-08T23:30:00Z", "Pacific/Kiritimati")).toBe("2026-11-09");
    expect(todayFor("2026-11-08T23:30:00Z", "Europe/Lisbon")).toBe("2026-11-08");
  });

  it.each(["Not/AZone", "", null, undefined])("falls back to UTC for an invalid or missing timezone (%s)", (tz) => {
    expect(todayFor("2026-11-08T23:30:00Z", tz)).toBe("2026-11-08");
  });
});

describe("consentGiven", () => {
  it("needs a connected row with a consent timestamp", () => {
    expect(consentGiven({ status: "connected", consentedAt: "2026-11-08T10:00:00Z" })).toBe(true);
    expect(consentGiven(null)).toBe(false);
    expect(consentGiven({ status: "disconnected", consentedAt: "2026-11-08T10:00:00Z" })).toBe(false);
    expect(consentGiven({ status: "connected", consentedAt: null })).toBe(false);
  });
});

describe("errorStatus", () => {
  it("maps each error code to its HTTP status", () => {
    expect(errorStatus("unauthorized")).toBe(401);
    expect(errorStatus("invalid_request")).toBe(400);
    expect(errorStatus("unsupported_source")).toBe(400);
    expect(errorStatus("consent_required")).toBe(403);
    expect(errorStatus("sync_failed")).toBe(500);
  });
});

describe("recalculateUrl", () => {
  it("points at the recalculate function of the same project", () => {
    expect(recalculateUrl("https://ref.supabase.co")).toBe("https://ref.supabase.co/functions/v1/recalculate");
    expect(recalculateUrl("https://ref.supabase.co/")).toBe("https://ref.supabase.co/functions/v1/recalculate");
  });
});

const habit = (over: Partial<StepHabit> = {}): StepHabit => ({
  id: "h-steps",
  kind: "value",
  target: 8000,
  active: true,
  deletedAt: null,
  autoSource: "steps",
  ...over,
});

describe("planSync", () => {
  const days = [
    { date: "2026-11-08", steps: 4000 },
    { date: "2026-11-07", steps: 9000 },
  ];

  it("writes one provider_activity row per day", () => {
    const plan = planSync({ days, habits: [], existingLogs: [] });
    expect(plan.activityRows).toEqual([
      { provider: "health_connect", date: "2026-11-08", payload: { steps: 4000 } },
      { provider: "health_connect", date: "2026-11-07", payload: { steps: 9000 } },
    ]);
    expect(plan.logRows).toEqual([]);
    expect(plan.skippedManual).toBe(0);
  });

  it("fills every eligible steps habit with the day's steps and the habit's target snapshot", () => {
    const plan = planSync({ days, habits: [habit(), habit({ id: "h2", target: null })], existingLogs: [] });
    expect(plan.logRows).toEqual([
      { user_habit_id: "h-steps", date: "2026-11-08", value: 4000, source: "health_connect", target: 8000, replace: false },
      { user_habit_id: "h-steps", date: "2026-11-07", value: 9000, source: "health_connect", target: 8000, replace: false },
      { user_habit_id: "h2", date: "2026-11-08", value: 4000, source: "health_connect", target: null, replace: false },
      { user_habit_id: "h2", date: "2026-11-07", value: 9000, source: "health_connect", target: null, replace: false },
    ]);
    expect(plan.habitsUpdated).toBe(2);
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])("leaves the target snapshot null for target %s", (target) => {
    const plan = planSync({ days: days.slice(0, 1), habits: [habit({ target })], existingLogs: [] });
    expect(plan.logRows[0].target).toBeNull();
  });

  it.each([
    ["a habit without auto_source", habit({ autoSource: null })],
    ["a check habit", habit({ kind: "check" })],
    ["a paused habit", habit({ active: false })],
    ["an archived habit", habit({ deletedAt: "2026-11-01T00:00:00Z" })],
  ])("ignores %s", (_name, h) => {
    const plan = planSync({ days, habits: [h], existingLogs: [] });
    expect(plan.logRows).toEqual([]);
    expect(plan.habitsUpdated).toBe(0);
  });

  it("never overwrites a manual log and counts the skipped days", () => {
    const existingLogs: ExistingLog[] = [{ habitId: "h-steps", date: "2026-11-08", source: "manual" }];
    const plan = planSync({ days, habits: [habit()], existingLogs });
    expect(plan.logRows.map((r) => r.date)).toEqual(["2026-11-07"]);
    expect(plan.skippedManual).toBe(1);
    expect(plan.activityRows).toHaveLength(2); // the raw steps are still recorded
  });

  it("replaces an existing automatic log (steps grow during the day)", () => {
    const existingLogs: ExistingLog[] = [
      { habitId: "h-steps", date: "2026-11-08", source: "health_connect" },
      { habitId: "h-steps", date: "2026-11-07", source: "strava" },
    ];
    const plan = planSync({ days, habits: [habit()], existingLogs });
    expect(plan.logRows.map((r) => [r.date, r.value, r.replace])).toEqual([
      ["2026-11-08", 4000, true],
      ["2026-11-07", 9000, true],
    ]);
    expect(plan.skippedManual).toBe(0);
  });

  it("matches existing logs by habit and date (other habits' manual logs do not block)", () => {
    const existingLogs: ExistingLog[] = [{ habitId: "other", date: "2026-11-08", source: "manual" }];
    const plan = planSync({ days, habits: [habit()], existingLogs });
    expect(plan.logRows).toHaveLength(2);
    expect(plan.skippedManual).toBe(0);
  });

  it("habitsUpdated counts habits that got at least one row", () => {
    const existingLogs: ExistingLog[] = [
      { habitId: "h2", date: "2026-11-08", source: "manual" },
      { habitId: "h2", date: "2026-11-07", source: "manual" },
    ];
    const plan = planSync({ days, habits: [habit(), habit({ id: "h2" })], existingLogs });
    expect(plan.habitsUpdated).toBe(1);
    expect(plan.skippedManual).toBe(2);
  });

  it("is idempotent: applying the same payload twice gives the same final rows", () => {
    type Stored = Omit<LogRow, "replace">;
    const store = new Map<string, Stored>([
      ["h-steps|2026-11-08", { user_habit_id: "h-steps", date: "2026-11-08", value: 1, source: "manual", target: 8000 }],
    ]);
    const apply = () => {
      const existingLogs = [...store.values()].map((r) => ({ habitId: r.user_habit_id, date: r.date, source: r.source }));
      const plan = planSync({ days, habits: [habit()], existingLogs });
      for (const { replace, ...row } of plan.logRows) {
        const key = `${row.user_habit_id}|${row.date}`;
        const current = store.get(key);
        if (replace ? current && current.source !== "manual" : !current) store.set(key, row);
      }
      return structuredClone([...store.entries()]);
    };
    const first = apply();
    expect(apply()).toEqual(first);
    expect(store.get("h-steps|2026-11-08")?.source).toBe("manual");
    expect(store.get("h-steps|2026-11-07")?.value).toBe(9000);
  });

  it("returns now as lastSyncedAt when given", () => {
    expect(planSync({ days, habits: [], existingLogs: [], now: "2026-11-08T10:00:00.000Z" }).lastSyncedAt).toBe(
      "2026-11-08T10:00:00.000Z",
    );
  });
});

describe("syncResponse", () => {
  it("summarizes a sync for the client", () => {
    const plan = planSync({
      days: [{ date: TODAY, steps: 10 }],
      habits: [habit()],
      existingLogs: [],
      now: "2026-11-08T10:00:00.000Z",
    });
    expect(syncResponse(plan)).toEqual({
      ok: true,
      status: "connected",
      lastSyncedAt: "2026-11-08T10:00:00.000Z",
      days: 1,
      habitsUpdated: 1,
      skippedManual: 0,
    });
  });
});
