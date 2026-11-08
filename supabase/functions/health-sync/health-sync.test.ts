import { describe, expect, it } from "vitest";
import {
  AUTO_METRICS,
  consentCovers,
  consentGiven,
  consentRecord,
  consentWithdrawal,
  CURRENT_CONSENT_VERSION,
  errorStatus,
  isConsentRequiredError,
  MAX_FILL_HABITS,
  METRIC_LIMITS,
  metricsOf,
  normalizeMetric,
  parseFilled,
  parseRequest,
  planSync,
  recalculateUrl,
  shouldRecalculate,
  statusResponse,
  syncResponse,
  todayFor,
  type Connection,
} from "./health-sync.ts";

const TODAY = "2026-11-08";

const sync = (days: unknown, extra: Record<string, unknown> = {}) => ({
  action: "sync",
  source: "health_connect",
  days,
  ...extra,
});
const day = (date: string, metrics: Record<string, unknown>) => ({ date, metrics });

describe("metrics", () => {
  it("are the four keys of the design, with their limits", () => {
    expect(AUTO_METRICS).toEqual(["steps", "workout_minutes", "sleep_hours", "mindful_minutes"]);
    expect(METRIC_LIMITS).toEqual({
      steps: { max: 100_000, decimals: 0 },
      workout_minutes: { max: 1440, decimals: 0 },
      sleep_hours: { max: 24, decimals: 2 },
      mindful_minutes: { max: 1440, decimals: 0 },
    });
  });

  it("normalizeMetric rounds integers and hours to 2 decimals", () => {
    expect(normalizeMetric("steps", 4321.6)).toBe(4322);
    expect(normalizeMetric("workout_minutes", 44.4)).toBe(44);
    expect(normalizeMetric("mindful_minutes", 0)).toBe(0);
    expect(normalizeMetric("sleep_hours", 7.256)).toBe(7.26);
    expect(normalizeMetric("sleep_hours", 7)).toBe(7);
    for (const m of AUTO_METRICS) expect(normalizeMetric(m, METRIC_LIMITS[m].max)).toBe(METRIC_LIMITS[m].max);
  });

  it.each([
    ["steps", 100_001],
    ["steps", 100_000.4],
    ["workout_minutes", 1441],
    ["mindful_minutes", 1440.2],
    ["sleep_hours", 24.001],
    ["steps", -1],
    ["sleep_hours", -0.01],
    ["steps", Number.NaN],
    ["steps", Number.POSITIVE_INFINITY],
    ["steps", "500"],
    ["steps", null],
    ["calories", 10],
  ])("normalizeMetric rejects %s = %s (never clamps)", (metric, value) => {
    expect(normalizeMetric(metric, value)).toBeNull();
  });
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
    for (const action of ["connect", "sync", "disconnect", "status"]) {
      for (const source of ["apple_health", "huawei_health"]) {
        expect(
          parseRequest(
            { action, source, consent: true, consentVersion: CURRENT_CONSENT_VERSION, categories: ["steps"], days: [] },
            TODAY,
          ),
        ).toEqual({ ok: false, error: "unsupported_source" });
      }
      expect(parseRequest({ action }, TODAY)).toEqual({ ok: false, error: "invalid_request" });
      expect(parseRequest({ action, source: 7 }, TODAY)).toEqual({ ok: false, error: "invalid_request" });
    }
  });

  it("ignores a user id in the body (the user only comes from the JWT)", () => {
    const res = parseRequest({ action: "disconnect", source: "health_connect", userId: "someone-else" }, TODAY);
    expect(res).toEqual({ ok: true, request: { action: "disconnect", source: "health_connect" } });
  });

  it("accepts the status action", () => {
    expect(parseRequest({ action: "status", source: "health_connect", userId: "x" }, TODAY)).toEqual({
      ok: true,
      request: { action: "status", source: "health_connect" },
    });
  });
});

describe("parseRequest: connect", () => {
  const connect = (extra: Record<string, unknown>) => ({
    action: "connect",
    source: "health_connect",
    consent: true,
    consentVersion: CURRENT_CONSENT_VERSION,
    categories: ["steps"],
    ...extra,
  });

  it("accepts explicit consent to the current text with the chosen categories (canonical order)", () => {
    expect(parseRequest(connect({ categories: ["sleep_hours", "steps"] }), TODAY)).toEqual({
      ok: true,
      request: {
        action: "connect",
        source: "health_connect",
        consentVersion: CURRENT_CONSENT_VERSION,
        categories: ["steps", "sleep_hours"],
      },
    });
    expect(parseRequest(connect({ categories: [...AUTO_METRICS] }), TODAY).ok).toBe(true);
    expect(CURRENT_CONSENT_VERSION).toBe("metrics-2026-11-v3");
    expect(CURRENT_CONSENT_VERSION.length).toBeLessThanOrEqual(32);
  });

  it.each(["steps-2026-11-v2", "steps-2026-11", "v1", `${CURRENT_CONSENT_VERSION} `])(
    "rejects consent to another (stale) text version %s",
    (consentVersion) => {
      expect(parseRequest(connect({ consentVersion }), TODAY)).toEqual({ ok: false, error: "invalid_request" });
    },
  );

  it.each([false, "true", 1, undefined, null])("requires consent to be exactly true (%s)", (consent) => {
    expect(parseRequest(connect({ consent }), TODAY)).toEqual({ ok: false, error: "invalid_request" });
  });

  it.each(["", "   ", "x".repeat(33), 3, undefined])("rejects a bad consentVersion (%s)", (consentVersion) => {
    expect(parseRequest(connect({ consentVersion }), TODAY)).toEqual({ ok: false, error: "invalid_request" });
  });

  it.each([
    ["missing", undefined],
    ["empty", []],
    ["not an array", "steps"],
    ["an unknown metric", ["steps", "calories"]],
    ["a duplicate", ["steps", "steps"]],
    ["a non-string", [1]],
    ["a wrong case", ["Steps"]],
  ])("rejects %s categories", (_name, categories) => {
    expect(parseRequest(connect({ categories }), TODAY)).toEqual({ ok: false, error: "invalid_request" });
  });
});

describe("parseRequest: sync", () => {
  it("accepts 1..7 unique days in [today - 7, today] with per-metric rounding", () => {
    const res = parseRequest(
      sync([
        day("2026-11-08", { steps: 4321.6, sleep_hours: 7.256 }),
        day("2026-11-01", { workout_minutes: 0 }),
        day("2026-11-07", { mindful_minutes: 1440, steps: 100_000 }),
      ]),
      TODAY,
    );
    expect(res).toEqual({
      ok: true,
      request: {
        action: "sync",
        source: "health_connect",
        days: [
          { date: "2026-11-08", metrics: { steps: 4322, sleep_hours: 7.26 } },
          { date: "2026-11-01", metrics: { workout_minutes: 0 } },
          { date: "2026-11-07", metrics: { steps: 100_000, mindful_minutes: 1440 } },
        ],
      },
    });
  });

  it("still accepts the phase 1 (legacy) day format { date, steps }", () => {
    expect(parseRequest(sync([{ date: TODAY, steps: 4000.4 }, { date: "2026-11-07", steps: 0 }]), TODAY)).toEqual({
      ok: true,
      request: {
        action: "sync",
        source: "health_connect",
        days: [
          { date: TODAY, metrics: { steps: 4000 } },
          { date: "2026-11-07", metrics: { steps: 0 } },
        ],
      },
    });
    // both formats in one request are fine, as long as each day is one of them
    expect(parseRequest(sync([{ date: TODAY, steps: 1 }, day("2026-11-07", { sleep_hours: 8 })]), TODAY).ok).toBe(true);
  });

  it("accepts exactly 7 days", () => {
    const days = Array.from({ length: 7 }, (_, i) => day(`2026-11-0${i + 2}`, { steps: 100 }));
    expect(parseRequest(sync(days), TODAY).ok).toBe(true);
  });

  it.each([
    ["no days", []],
    ["8 days", Array.from({ length: 8 }, (_, i) => day(`2026-11-0${i + 1}`, { steps: 1 }))],
    ["not an array", day(TODAY, { steps: 1 })],
    ["duplicate dates", [day(TODAY, { steps: 1 }), day(TODAY, { sleep_hours: 2 })]],
    ["a non-calendar date", [day("2026-02-30", { steps: 1 })]],
    ["a malformed date", [day("8/11/2026", { steps: 1 })]],
    ["a missing date", [{ metrics: { steps: 1 } }]],
    ["a future date", [day("2026-11-09", { steps: 1 })]],
    ["a date before today - 7", [day("2026-10-31", { steps: 1 })]],
    ["empty metrics", [day(TODAY, {})]],
    ["metrics not an object", [{ date: TODAY, metrics: [1] }]],
    ["metrics null", [{ date: TODAY, metrics: null }]],
    ["an unknown metric key", [day(TODAY, { calories: 10 })]],
    ["an unknown key beside a known one", [day(TODAY, { steps: 10, calories: 10 })]],
    ["NaN", [day(TODAY, { steps: Number.NaN })]],
    ["infinity", [day(TODAY, { sleep_hours: Number.POSITIVE_INFINITY })]],
    ["a negative value", [day(TODAY, { workout_minutes: -1 })]],
    ["steps over the limit", [day(TODAY, { steps: 100_001 })]],
    ["workout over the limit", [day(TODAY, { workout_minutes: 1441 })]],
    ["mindful over the limit", [day(TODAY, { mindful_minutes: 1441 })]],
    ["sleep over the limit", [day(TODAY, { sleep_hours: 24.5 })]],
    ["a string value", [day(TODAY, { steps: "500" })]],
    ["a null value", [day(TODAY, { steps: null })]],
    ["legacy steps over the limit", [{ date: TODAY, steps: 100_001 }]],
    ["legacy steps as a string", [{ date: TODAY, steps: "5" }]],
    ["a day with both formats", [{ date: TODAY, steps: 1, metrics: { sleep_hours: 1 } }]],
    ["a day with neither format", [{ date: TODAY, sleep_hours: 7 }]],
    ["a null entry", [null]],
  ])("rejects %s as invalid_request (nothing is clamped)", (_name, days) => {
    expect(parseRequest(sync(days), TODAY)).toEqual({ ok: false, error: "invalid_request" });
  });

  it("rejects the whole batch when one entry is bad", () => {
    expect(parseRequest(sync([day(TODAY, { steps: 10 }), day("2026-11-07", { steps: -5 })]), TODAY)).toEqual({
      ok: false,
      error: "invalid_request",
    });
  });

  it("uses the given today for the window (month boundary)", () => {
    expect(parseRequest(sync([day("2026-02-22", { steps: 1 })]), "2026-03-01").ok).toBe(true);
    expect(parseRequest(sync([day("2026-02-21", { steps: 1 })]), "2026-03-01").ok).toBe(false);
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

const at = "2026-11-08T10:00:00Z";
const conn = (over: Partial<NonNullable<Connection>> = {}): Connection => ({
  status: "connected",
  consentedAt: at,
  consentVersion: CURRENT_CONSENT_VERSION,
  categories: ["steps", "sleep_hours"],
  lastSyncedAt: null,
  ...over,
});

describe("consentGiven / consentCovers", () => {
  it("needs a connected row with a consent timestamp for the current text", () => {
    expect(consentGiven(conn())).toBe(true);
    expect(consentGiven(null)).toBe(false);
    expect(consentGiven(conn({ status: "disconnected" }))).toBe(false);
    expect(consentGiven(conn({ consentedAt: null }))).toBe(false);
  });

  it("asks again when the consent was given to an older text (a v2 steps-only connection)", () => {
    expect(consentGiven(conn({ consentVersion: "steps-2026-11-v2", categories: ["steps"] }))).toBe(false);
    expect(consentCovers(conn({ consentVersion: "steps-2026-11-v2", categories: ["steps"] }), ["steps"])).toBe(false);
    expect(consentGiven(conn({ consentVersion: null }))).toBe(false);
  });

  it("covers a sync only when every metric sent was consented", () => {
    expect(consentCovers(conn(), ["steps"])).toBe(true);
    expect(consentCovers(conn(), ["steps", "sleep_hours"])).toBe(true);
    expect(consentCovers(conn(), ["steps", "workout_minutes"])).toBe(false);
    expect(consentCovers(conn({ categories: [] }), ["steps"])).toBe(false);
    expect(consentCovers(conn({ categories: null }), ["steps"])).toBe(false);
    expect(consentCovers(conn({ categories: "steps" }), ["steps"])).toBe(false);
    expect(consentCovers(conn({ status: "disconnected" }), ["steps"])).toBe(false);
    expect(consentCovers(null, ["steps"])).toBe(false);
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

describe("metricsOf", () => {
  it("lists the distinct metrics of the days in canonical order", () => {
    expect(
      metricsOf([
        { date: TODAY, metrics: { sleep_hours: 7, steps: 1 } },
        { date: "2026-11-07", metrics: { steps: 2, mindful_minutes: 3 } },
      ]),
    ).toEqual(["steps", "sleep_hours", "mindful_minutes"]);
  });
});

describe("planSync", () => {
  const days = [
    { date: "2026-11-08", metrics: { steps: 4000, sleep_hours: 7.5 } },
    { date: "2026-11-05", metrics: { workout_minutes: 30 } },
    { date: "2026-11-07", metrics: { steps: 9000 } },
  ];

  it("one upsert_provider_activity row per day, only the metrics sent (the database merges the rest)", () => {
    const plan = planSync({ days });
    expect(plan.activityRows).toEqual(days);
    // a day that only carries one metric is sent with that metric only, so the
    // database's JSON merge keeps the other metrics already stored for that day
    expect(plan.activityRows[1]).toEqual({ date: "2026-11-05", metrics: { workout_minutes: 30 } });
  });

  it("fills over the range [oldest, newest] day of the request", () => {
    const plan = planSync({ days });
    expect(plan.fillFrom).toBe("2026-11-05");
    expect(plan.fillTo).toBe("2026-11-08");
    const one = planSync({ days: [days[0]] });
    expect([one.fillFrom, one.fillTo]).toEqual(["2026-11-08", "2026-11-08"]);
  });

  it("reports the metrics received and now as lastSyncedAt", () => {
    const plan = planSync({ days, now: "2026-11-08T10:00:00.000Z" });
    expect(plan.metricsReceived).toEqual(["steps", "workout_minutes", "sleep_hours"]);
    expect(plan.lastSyncedAt).toBe("2026-11-08T10:00:00.000Z");
    expect(planSync({ days }).lastSyncedAt).toBeNull();
  });

  it("is deterministic: the same payload gives the same rows (idempotent sync)", () => {
    expect(planSync({ days })).toEqual(planSync({ days }));
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
  it("connect stores the accepted version, the categories (replaced), the time and clears a withdrawal", () => {
    expect(consentRecord(CURRENT_CONSENT_VERSION, ["steps", "mindful_minutes"], "2026-11-08T10:00:00.000Z")).toEqual({
      status: "connected",
      consented_at: "2026-11-08T10:00:00.000Z",
      consent_version: CURRENT_CONSENT_VERSION,
      consented_categories: ["steps", "mindful_minutes"],
      consent_withdrawn_at: null,
    });
  });
  it("disconnect records the withdrawal and keeps what was accepted", () => {
    const patch = consentWithdrawal("2026-11-08T11:00:00.000Z");
    expect(patch).toEqual({ status: "disconnected", consent_withdrawn_at: "2026-11-08T11:00:00.000Z" });
    expect(patch).not.toHaveProperty("consented_at");
    expect(patch).not.toHaveProperty("consent_version");
    expect(patch).not.toHaveProperty("consented_categories");
  });
});

describe("parseFilled", () => {
  it("reads the fill_habits_from_activity counts, zero for anything malformed", () => {
    expect(parseFilled({ written: 3, skippedManual: 1, habitsUpdated: 2, habitsIgnored: 4 })).toEqual({
      written: 3,
      skippedManual: 1,
      habitsUpdated: 2,
      habitsIgnored: 4,
    });
    const zero = { written: 0, skippedManual: 0, habitsUpdated: 0, habitsIgnored: 0 };
    expect(parseFilled(null)).toEqual(zero);
    expect(parseFilled({ written: "x", habitsIgnored: -1 })).toEqual(zero);
  });
  it("mirrors the SQL cap of 50 habits", () => {
    expect(MAX_FILL_HABITS).toBe(50);
  });
});

describe("syncResponse", () => {
  it("keeps every v1 field name and adds metricsReceived", () => {
    const plan = planSync({
      days: [{ date: TODAY, metrics: { steps: 10, sleep_hours: 6 } }],
      now: "2026-11-08T10:00:00.000Z",
    });
    expect(syncResponse(plan, { written: 1, skippedManual: 2, habitsUpdated: 1, habitsIgnored: 3 })).toEqual({
      ok: true,
      status: "connected",
      lastSyncedAt: "2026-11-08T10:00:00.000Z",
      days: 1,
      metricsReceived: ["steps", "sleep_hours"],
      habitsUpdated: 1,
      skippedManual: 2,
      habitsIgnored: 3,
    });
  });
});

describe("statusResponse", () => {
  it("reports a current connection with its categories", () => {
    expect(statusResponse(conn({ lastSyncedAt: "2026-11-08T09:00:00Z" }))).toEqual({
      ok: true,
      status: "connected",
      categories: ["steps", "sleep_hours"],
      consentCurrent: true,
      lastSyncedAt: "2026-11-08T09:00:00Z",
    });
  });

  it("a v2 (steps-only) connection is connected but its consent is not current", () => {
    expect(statusResponse(conn({ consentVersion: "steps-2026-11-v2", categories: ["steps"] }))).toMatchObject({
      status: "connected",
      categories: ["steps"],
      consentCurrent: false,
    });
  });

  it("no row is 'none'; a disconnected row keeps its last categories but no current consent", () => {
    expect(statusResponse(null)).toEqual({
      ok: true,
      status: "none",
      categories: [],
      consentCurrent: false,
      lastSyncedAt: null,
    });
    expect(statusResponse(conn({ status: "disconnected" }))).toMatchObject({
      status: "disconnected",
      categories: ["steps", "sleep_hours"],
      consentCurrent: false,
    });
  });

  it("drops unknown stored categories and never exposes anything else", () => {
    const res = statusResponse(conn({ categories: ["steps", "calories", 3] }));
    expect(res.categories).toEqual(["steps"]);
    expect(Object.keys(res).sort()).toEqual(["categories", "consentCurrent", "lastSyncedAt", "ok", "status"]);
  });
});

describe("isConsentRequiredError", () => {
  it("recognizes exactly the consent error raised by upsert_provider_activity (P0001 consent_required)", () => {
    expect(isConsentRequiredError({ code: "P0001", message: "consent_required", details: null, hint: null })).toBe(true);
  });

  it.each([
    ["another message with P0001", { code: "P0001", message: "something else" }],
    ["a validation error", { code: "22023", message: "upsert_provider_activity: invalid metric steps" }],
    ["the message with another code", { code: "42501", message: "consent_required" }],
    ["a permission error", { code: "42501", message: "permission denied for function upsert_provider_activity" }],
    ["a network error", new TypeError("fetch failed")],
    ["null", null],
    ["a string", "consent_required"],
  ])("anything else stays a sync failure: %s", (_name, err) => {
    expect(isConsentRequiredError(err)).toBe(false);
  });
});
