import { describe, expect, it } from "vitest";
import {
  consentGiven,
  consentRecord,
  consentWithdrawal,
  CURRENT_CONSENT_VERSION,
  errorStatus,
  MAX_DAYS,
  MAX_STEPS,
  MAX_STEPS_HABITS,
  parseApplied,
  parseRequest,
  planSync,
  recalculateUrl,
  shouldRecalculate,
  syncResponse,
  todayFor,
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
      expect(parseRequest({ action, source: "apple_health", consent: true, consentVersion: CURRENT_CONSENT_VERSION, days: [] }, TODAY))
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

  it("accepts explicit consent to the current consent text", () => {
    expect(parseRequest(connect({ consent: true, consentVersion: CURRENT_CONSENT_VERSION }), TODAY)).toEqual({
      ok: true,
      request: { action: "connect", source: "health_connect", consentVersion: CURRENT_CONSENT_VERSION },
    });
    expect(CURRENT_CONSENT_VERSION.length).toBeLessThanOrEqual(32);
  });

  it.each(["steps-2026-11", "v1", `${CURRENT_CONSENT_VERSION} `])(
    "rejects consent to another (stale) text version %s",
    (consentVersion) => {
      expect(parseRequest(connect({ consent: true, consentVersion }), TODAY)).toEqual({
        ok: false,
        error: "invalid_request",
      });
    },
  );

  it.each([false, "true", 1, undefined, null])("requires consent to be exactly true (%s)", (consent) => {
    expect(parseRequest(connect({ consent, consentVersion: CURRENT_CONSENT_VERSION }), TODAY)).toEqual({
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
  const at = "2026-11-08T10:00:00Z";
  it("needs a connected row with a consent timestamp for the current text", () => {
    expect(consentGiven({ status: "connected", consentedAt: at, consentVersion: CURRENT_CONSENT_VERSION })).toBe(true);
    expect(consentGiven(null)).toBe(false);
    expect(consentGiven({ status: "disconnected", consentedAt: at, consentVersion: CURRENT_CONSENT_VERSION })).toBe(false);
    expect(consentGiven({ status: "connected", consentedAt: null, consentVersion: CURRENT_CONSENT_VERSION })).toBe(false);
  });
  it("asks again when the consent was given to an older text", () => {
    expect(consentGiven({ status: "connected", consentedAt: at, consentVersion: "steps-2026-11" })).toBe(false);
    expect(consentGiven({ status: "connected", consentedAt: at, consentVersion: null })).toBe(false);
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
    const plan = planSync({ days, habits: [] });
    expect(plan.activityRows).toEqual([
      { provider: "health_connect", date: "2026-11-08", payload: { steps: 4000 } },
      { provider: "health_connect", date: "2026-11-07", payload: { steps: 9000 } },
    ]);
    expect(plan.logRows).toEqual([]);
    expect(plan.habitsIgnored).toBe(0);
  });

  it("shapes one log row per eligible habit and day with the habit's target snapshot", () => {
    const plan = planSync({ days, habits: [habit(), habit({ id: "h2", target: null })] });
    expect(plan.logRows).toEqual([
      { user_habit_id: "h-steps", date: "2026-11-08", value: 4000, target: 8000 },
      { user_habit_id: "h-steps", date: "2026-11-07", value: 9000, target: 8000 },
      { user_habit_id: "h2", date: "2026-11-08", value: 4000, target: null },
      { user_habit_id: "h2", date: "2026-11-07", value: 9000, target: null },
    ]);
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])("leaves the target snapshot null for target %s", (target) => {
    const plan = planSync({ days: days.slice(0, 1), habits: [habit({ target })] });
    expect(plan.logRows[0].target).toBeNull();
  });

  it.each([
    ["a habit without auto_source", habit({ autoSource: null })],
    ["a check habit", habit({ kind: "check" })],
    ["a paused habit", habit({ active: false })],
    ["an archived habit", habit({ deletedAt: "2026-11-01T00:00:00Z" })],
  ])("ignores %s", (_name, h) => {
    expect(planSync({ days, habits: [h] }).logRows).toEqual([]);
  });

  it(`handles at most ${MAX_STEPS_HABITS} habits (in the given order) and reports the rest as ignored`, () => {
    const many = Array.from({ length: MAX_STEPS_HABITS + 3 }, (_, i) => habit({ id: `h${i}` }));
    const plan = planSync({ days, habits: many });
    expect(new Set(plan.logRows.map((r) => r.user_habit_id)).size).toBe(MAX_STEPS_HABITS);
    expect(plan.logRows[0].user_habit_id).toBe("h0");
    expect(plan.logRows.length).toBeLessThanOrEqual(MAX_STEPS_HABITS * MAX_DAYS);
    expect(plan.habitsIgnored).toBe(3);
  });

  it("counts habits the database had beyond the loaded page (totalHabits)", () => {
    const plan = planSync({ days, habits: [habit()], totalHabits: 25 });
    expect(plan.habitsIgnored).toBe(24);
    expect(planSync({ days, habits: [habit()], totalHabits: null }).habitsIgnored).toBe(0);
  });

  it("is deterministic: the same payload gives the same rows (idempotent sync)", () => {
    expect(planSync({ days, habits: [habit()] })).toEqual(planSync({ days, habits: [habit()] }));
  });

  it("returns now as lastSyncedAt when given", () => {
    expect(planSync({ days, habits: [], now: "2026-11-08T10:00:00.000Z" }).lastSyncedAt).toBe("2026-11-08T10:00:00.000Z");
  });
});

describe("shouldRecalculate", () => {
  const now = "2026-11-08T10:00:00.000Z";
  it("forwards a recalculation unless the previous sync was less than 60 s ago", () => {
    expect(shouldRecalculate(null, now)).toBe(true);
    expect(shouldRecalculate("2026-11-08T09:58:59.000Z", now)).toBe(true);
    expect(shouldRecalculate("2026-11-08T09:59:00.000Z", now)).toBe(true); // exactly 60 s
    expect(shouldRecalculate("2026-11-08T09:59:30.000Z", now)).toBe(false);
    expect(shouldRecalculate("2026-11-08T10:00:00.000Z", now)).toBe(false);
  });
  it("recalculates when the previous time is unreadable or in the future (clock skew)", () => {
    expect(shouldRecalculate("garbage", now)).toBe(true);
    expect(shouldRecalculate("2026-11-08T10:05:00.000Z", now)).toBe(true);
  });
});

describe("consent record", () => {
  it("connect stores the accepted version, the time and clears a withdrawal", () => {
    expect(consentRecord(CURRENT_CONSENT_VERSION, "2026-11-08T10:00:00.000Z")).toEqual({
      status: "connected",
      consented_at: "2026-11-08T10:00:00.000Z",
      consent_version: CURRENT_CONSENT_VERSION,
      consent_withdrawn_at: null,
    });
  });
  it("disconnect records the withdrawal and keeps what was accepted", () => {
    const patch = consentWithdrawal("2026-11-08T11:00:00.000Z");
    expect(patch).toEqual({ status: "disconnected", consent_withdrawn_at: "2026-11-08T11:00:00.000Z" });
    expect(patch).not.toHaveProperty("consented_at");
    expect(patch).not.toHaveProperty("consent_version");
  });
});

describe("syncResponse", () => {
  it("summarizes a sync with the database's counts", () => {
    const plan = planSync({
      days: [{ date: TODAY, steps: 10 }],
      habits: [habit()],
      totalHabits: 21,
      now: "2026-11-08T10:00:00.000Z",
    });
    expect(syncResponse(plan, { written: 1, skippedManual: 0, habitsUpdated: 1 })).toEqual({
      ok: true,
      status: "connected",
      lastSyncedAt: "2026-11-08T10:00:00.000Z",
      days: 1,
      habitsUpdated: 1,
      habitsIgnored: 20,
      skippedManual: 0,
    });
  });
});

describe("parseApplied", () => {
  it("reads the apply_health_logs counts, zero for anything malformed", () => {
    expect(parseApplied({ written: 3, skippedManual: 1, habitsUpdated: 2 })).toEqual({
      written: 3,
      skippedManual: 1,
      habitsUpdated: 2,
    });
    expect(parseApplied(null)).toEqual({ written: 0, skippedManual: 0, habitsUpdated: 0 });
    expect(parseApplied({ written: "x" })).toEqual({ written: 0, skippedManual: 0, habitsUpdated: 0 });
  });
});
