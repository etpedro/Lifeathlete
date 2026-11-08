import { describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/lib/data/testing/fake-db";
import { getHealthBridge, registerHealthBridge, type HealthBridge } from "./bridge";
import { connectAndSync, metricDaysToSend, runHealthSync } from "./sync";

type Invoke = NonNullable<Parameters<typeof createFakeDb>[0]["invoke"]>;
const NOW = new Date("2026-11-08T23:30:00Z");

const okSync = (days: number) => ({
  data: {
    ok: true,
    status: "connected",
    lastSyncedAt: "2026-11-08T23:30:00Z",
    days,
    metricsReceived: ["steps"],
    habitsUpdated: 1,
    skippedManual: 0,
  },
  error: null,
});

type FakeBridge = HealthBridge & {
  readMetrics: ReturnType<typeof vi.fn>;
  requestPermission: ReturnType<typeof vi.fn>;
};

function fakeBridge(over: Partial<HealthBridge> = {}): FakeBridge {
  return {
    isAvailable: () => true,
    requestPermission: vi.fn(async (c: unknown) => c),
    readMetrics: vi.fn().mockResolvedValue([
      { date: "2026-11-08", metrics: { steps: 4000, sleep_hours: 7.256 } },
      { date: "2026-11-07", metrics: { steps: 9000.4 } },
    ]),
    ...over,
  } as never;
}

const dbWith = (invoke: Invoke) => createFakeDb({ userId: "u", tables: {}, invoke }).db;
const deps = (invoke: Invoke, bridge: HealthBridge, timezone = "UTC") => ({
  db: dbWith(invoke),
  bridge,
  now: NOW,
  timezone,
});

describe("getHealthBridge", () => {
  it("is null in the browser until a native shell registers one", () => {
    expect(getHealthBridge()).toBeNull();
    const bridge = fakeBridge();
    registerHealthBridge(bridge);
    expect(getHealthBridge()).toBe(bridge);
    registerHealthBridge(null);
    expect(getHealthBridge()).toBeNull();
  });
});

describe("metricDaysToSend", () => {
  const all = ["steps", "workout_minutes", "sleep_hours", "mindful_minutes"] as const;

  it("keeps valid consented metrics of the last 7 local days, rounded, newest first", () => {
    const days = metricDaysToSend(
      [
        { date: "2026-11-01", metrics: { steps: 10 } }, // today - 7: outside the 7-day window
        { date: "2026-11-02", metrics: { steps: 20, workout_minutes: 30.4 } },
        { date: "2026-11-08", metrics: { steps: 99.6, sleep_hours: 7.256, calories: 5 } }, // unknown key dropped
        { date: "2026-11-09", metrics: { steps: 5 } }, // future
        { date: "2026-11-05", metrics: { steps: -1, mindful_minutes: 10 } }, // negative dropped, the rest kept
        { date: "2026-11-04", metrics: { steps: Number.NaN } }, // nothing left -> day dropped
        { date: "2026-11-03", metrics: { steps: 100_001, sleep_hours: 25, workout_minutes: 1441 } },
        { date: "2026-11-06", metrics: { steps: "12" } },
        { date: "2026-02-30", metrics: { steps: 1 } },
        { date: "2026-11-07", metrics: null },
        { date: "2026-11-08", metrics: { steps: 1 } }, // duplicate: the first wins
        null,
      ],
      [...all],
      "2026-11-08",
    );
    expect(days).toEqual([
      { date: "2026-11-08", metrics: { steps: 100, sleep_hours: 7.26 } },
      { date: "2026-11-05", metrics: { mindful_minutes: 10 } },
      { date: "2026-11-02", metrics: { steps: 20, workout_minutes: 30 } },
    ]);
  });

  it("drops every metric that was not consented (data minimization)", () => {
    expect(
      metricDaysToSend(
        [
          { date: "2026-11-08", metrics: { steps: 100, sleep_hours: 7 } },
          { date: "2026-11-07", metrics: { sleep_hours: 6 } },
        ],
        ["steps"],
        "2026-11-08",
      ),
    ).toEqual([{ date: "2026-11-08", metrics: { steps: 100 } }]);
  });

  it("sends at most 7 days", () => {
    const raw = Array.from({ length: 7 }, (_, i) => ({ date: `2026-11-0${i + 2}`, metrics: { steps: i } }));
    expect(metricDaysToSend(raw, ["steps"], "2026-11-08")).toHaveLength(7);
  });
});

describe("runHealthSync", () => {
  it("reads the consented categories for the last 7 days and sends the v2 format", async () => {
    const invoke = vi.fn<Invoke>().mockResolvedValue(okSync(2));
    const bridge = fakeBridge();
    const out = await runHealthSync({ ...deps(invoke, bridge, "Europe/Lisbon"), categories: ["steps", "sleep_hours"] });
    expect(bridge.readMetrics).toHaveBeenCalledWith(7, ["steps", "sleep_hours"]);
    expect(invoke).toHaveBeenCalledWith("health-sync", {
      body: {
        action: "sync",
        source: "health_connect",
        days: [
          { date: "2026-11-08", metrics: { steps: 4000, sleep_hours: 7.26 } },
          { date: "2026-11-07", metrics: { steps: 9000 } },
        ],
      },
    });
    expect(out).toEqual({
      ok: true,
      result: {
        lastSyncedAt: "2026-11-08T23:30:00Z",
        days: 2,
        metricsReceived: ["steps"],
        habitsUpdated: 1,
        habitsIgnored: 0,
        skippedManual: 0,
      },
    });
  });

  it("reads nothing when no category is consented", async () => {
    const invoke = vi.fn<Invoke>();
    const bridge = fakeBridge();
    expect(await runHealthSync({ ...deps(invoke, bridge), categories: [] })).toEqual({ ok: true, result: null });
    expect(bridge.readMetrics).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("uses the profile timezone for today (invalid -> UTC)", async () => {
    const invoke = vi.fn<Invoke>().mockResolvedValue(okSync(1));
    const bridge = fakeBridge({
      readMetrics: vi.fn().mockResolvedValue([{ date: "2026-11-09", metrics: { steps: 1 } }]),
    });
    await runHealthSync({ ...deps(invoke, bridge, "Pacific/Kiritimati"), categories: ["steps"] });
    expect(invoke).toHaveBeenCalledTimes(1);
    const none = await runHealthSync({ ...deps(invoke, bridge, "Not/AZone"), categories: ["steps"] });
    expect(none).toEqual({ ok: true, result: null }); // 2026-11-09 is in the future in UTC
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when the bridge has no usable days", async () => {
    const invoke = vi.fn<Invoke>();
    const bridge = fakeBridge({ readMetrics: vi.fn().mockResolvedValue([]) });
    expect(await runHealthSync({ ...deps(invoke, bridge), categories: ["steps"] })).toEqual({ ok: true, result: null });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("maps a bridge failure or a non-array result to read_failed (nothing sent)", async () => {
    const invoke = vi.fn<Invoke>();
    for (const readMetrics of [vi.fn().mockRejectedValue(new Error("native secret")), vi.fn().mockResolvedValue(null)]) {
      expect(await runHealthSync({ ...deps(invoke, fakeBridge({ readMetrics })), categories: ["steps"] })).toEqual({
        ok: false,
        code: "read_failed",
      });
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it("maps backend errors to their codes", async () => {
    const invoke = vi.fn<Invoke>().mockResolvedValue({
      data: null,
      error: Object.assign(new Error("x"), {
        name: "FunctionsHttpError",
        context: new Response(JSON.stringify({ error: "consent_required" }), { status: 403 }),
      }),
    });
    expect(await runHealthSync({ ...deps(invoke, fakeBridge()), categories: ["steps"] })).toEqual({
      ok: false,
      code: "consent_required",
    });
  });

  it("maps a throwing invoke to network", async () => {
    const out = await runHealthSync({
      ...deps(() => {
        throw new Error("boom");
      }, fakeBridge()),
      categories: ["steps"],
    });
    expect(out).toEqual({ ok: false, code: "network" });
  });
});

describe("connectAndSync", () => {
  const connectOk = (categories: string[]) => ({ data: { ok: true, status: "connected", categories }, error: null });

  it("asks for the selected categories, records consent for the granted ones, then syncs them", async () => {
    const calls: string[] = [];
    const invoke = vi.fn<Invoke>(async (_name, opts) => {
      const body = opts?.body as { action: string; categories?: string[] };
      calls.push(body.action);
      return body.action === "connect" ? connectOk(body.categories ?? []) : okSync(2);
    });
    const bridge = fakeBridge({
      requestPermission: vi.fn(async () => {
        calls.push("permission");
        return ["sleep_hours" as const]; // the user granted only part of it on the phone
      }),
    });
    const out = await connectAndSync(deps(invoke, bridge), ["steps", "sleep_hours"]);
    expect(calls).toEqual(["permission", "connect", "sync"]);
    expect(bridge.requestPermission).toHaveBeenCalledWith(["steps", "sleep_hours"]);
    const connectBody = invoke.mock.calls[0][1]?.body as { consent: unknown; categories: unknown };
    expect(connectBody.consent).toBe(true);
    expect(connectBody.categories).toEqual(["sleep_hours"]);
    expect(bridge.readMetrics).toHaveBeenCalledWith(7, ["sleep_hours"]);
    expect((invoke.mock.calls[1][1]?.body as { days: unknown }).days).toEqual([
      { date: "2026-11-08", metrics: { sleep_hours: 7.26 } },
    ]);
    expect(out).toMatchObject({ connected: true, categories: ["sleep_hours"], sync: { ok: true } });
  });

  it("ignores granted categories that were not selected or are unknown", async () => {
    const invoke = vi.fn<Invoke>(async (_n, opts) => {
      const body = opts?.body as { action: string; categories?: string[] };
      return body.action === "connect" ? connectOk(body.categories ?? []) : okSync(1);
    });
    const bridge = fakeBridge({ requestPermission: vi.fn().mockResolvedValue(["steps", "mindful_minutes", "calories"]) });
    const out = await connectAndSync(deps(invoke, bridge), ["steps"]);
    expect((invoke.mock.calls[0][1]?.body as { categories: unknown }).categories).toEqual(["steps"]);
    expect(out).toMatchObject({ connected: true, categories: ["steps"] });
  });

  it("nothing selected: no permission prompt, nothing recorded", async () => {
    const invoke = vi.fn<Invoke>();
    const bridge = fakeBridge();
    expect(await connectAndSync(deps(invoke, bridge), [])).toEqual({ connected: false, code: "permission_denied" });
    expect(bridge.requestPermission).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([
    ["nothing granted", vi.fn().mockResolvedValue([])],
    ["a boolean", vi.fn().mockResolvedValue(true)],
    ["a throwing prompt", vi.fn().mockRejectedValue(new Error("x"))],
  ])("stops on %s (permission_denied, no consent recorded)", async (_name, requestPermission) => {
    const invoke = vi.fn<Invoke>();
    expect(await connectAndSync(deps(invoke, fakeBridge({ requestPermission })), ["steps"])).toEqual({
      connected: false,
      code: "permission_denied",
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("reports a failed connect without syncing", async () => {
    const invoke = vi.fn<Invoke>().mockResolvedValue({
      data: null,
      error: Object.assign(new Error("x"), { name: "FunctionsFetchError", context: {} }),
    });
    expect(await connectAndSync(deps(invoke, fakeBridge()), ["steps"])).toEqual({ connected: false, code: "network" });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("stays connected when only the first sync fails", async () => {
    const invoke = vi.fn<Invoke>(async (_n, opts) =>
      (opts?.body as { action: string }).action === "connect"
        ? connectOk(["steps"])
        : { data: null, error: Object.assign(new Error("x"), { name: "FunctionsFetchError", context: {} }) },
    );
    expect(await connectAndSync(deps(invoke, fakeBridge()), ["steps"])).toEqual({
      connected: true,
      categories: ["steps"],
      sync: { ok: false, code: "network" },
    });
  });
});
