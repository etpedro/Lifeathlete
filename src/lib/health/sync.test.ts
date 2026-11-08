import { describe, expect, it, vi } from "vitest";
import { createFakeDb } from "@/lib/data/testing/fake-db";
import { getHealthBridge, registerHealthBridge, type HealthBridge } from "./bridge";
import { connectAndSync, runHealthSync, stepDaysToSend } from "./sync";

type Invoke = NonNullable<Parameters<typeof createFakeDb>[0]["invoke"]>;
const NOW = new Date("2026-11-08T23:30:00Z");

const okSync = (days: number) => ({
  data: { ok: true, status: "connected", lastSyncedAt: "2026-11-08T23:30:00Z", days, habitsUpdated: 1, skippedManual: 0 },
  error: null,
});

function fakeBridge(over: Partial<HealthBridge> = {}): HealthBridge & { readSteps: ReturnType<typeof vi.fn> } {
  return {
    isAvailable: () => true,
    requestPermission: vi.fn().mockResolvedValue(true),
    readSteps: vi.fn().mockResolvedValue([
      { date: "2026-11-08", steps: 4000 },
      { date: "2026-11-07", steps: 9000.4 },
    ]),
    ...over,
  } as never;
}

const dbWith = (invoke: Invoke) => createFakeDb({ userId: "u", tables: {}, invoke }).db;

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

describe("stepDaysToSend", () => {
  it("keeps valid days of the last 7 local days, rounded, newest first, at most 7", () => {
    const days = stepDaysToSend(
      [
        { date: "2026-11-01", steps: 10 }, // today - 7: outside the 7-day window
        { date: "2026-11-02", steps: 20 },
        { date: "2026-11-08", steps: 99.6 },
        { date: "2026-11-09", steps: 5 }, // future
        { date: "2026-11-05", steps: -1 }, // negative
        { date: "2026-11-04", steps: Number.NaN },
        { date: "2026-11-03", steps: 100_001 }, // over the cap
        { date: "2026-02-30", steps: 1 },
        { date: "2026-11-08", steps: 1 }, // duplicate: the first wins
      ],
      "2026-11-08",
    );
    expect(days).toEqual([
      { date: "2026-11-08", steps: 100 },
      { date: "2026-11-02", steps: 20 },
    ]);
  });
});

describe("runHealthSync", () => {
  it("reads the last 7 days from the bridge and sends them for the profile's local today", async () => {
    const invoke = vi.fn<Invoke>().mockResolvedValue(okSync(2));
    const bridge = fakeBridge();
    const out = await runHealthSync({ db: dbWith(invoke), bridge, now: NOW, timezone: "Europe/Lisbon" });
    expect(bridge.readSteps).toHaveBeenCalledWith(7);
    expect(invoke).toHaveBeenCalledWith("health-sync", {
      body: {
        action: "sync",
        source: "health_connect",
        days: [
          { date: "2026-11-08", steps: 4000 },
          { date: "2026-11-07", steps: 9000 },
        ],
      },
    });
    expect(out).toEqual({
      ok: true,
      result: { lastSyncedAt: "2026-11-08T23:30:00Z", days: 2, habitsUpdated: 1, habitsIgnored: 0, skippedManual: 0 },
    });
  });

  it("uses the profile timezone for today (invalid -> UTC)", async () => {
    const invoke = vi.fn<Invoke>().mockResolvedValue(okSync(1));
    const bridge = fakeBridge({ readSteps: vi.fn().mockResolvedValue([{ date: "2026-11-09", steps: 1 }]) });
    await runHealthSync({ db: dbWith(invoke), bridge, now: NOW, timezone: "Pacific/Kiritimati" });
    expect(invoke).toHaveBeenCalledTimes(1);
    const none = await runHealthSync({ db: dbWith(invoke), bridge, now: NOW, timezone: "Not/AZone" });
    expect(none).toEqual({ ok: true, result: null }); // 2026-11-09 is in the future in UTC
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when the bridge has no usable days", async () => {
    const invoke = vi.fn<Invoke>();
    const bridge = fakeBridge({ readSteps: vi.fn().mockResolvedValue([]) });
    expect(await runHealthSync({ db: dbWith(invoke), bridge, now: NOW, timezone: "UTC" })).toEqual({ ok: true, result: null });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("maps a bridge failure to read_failed (nothing sent)", async () => {
    const invoke = vi.fn<Invoke>();
    const bridge = fakeBridge({ readSteps: vi.fn().mockRejectedValue(new Error("native secret")) });
    expect(await runHealthSync({ db: dbWith(invoke), bridge, now: NOW, timezone: "UTC" })).toEqual({
      ok: false,
      code: "read_failed",
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("maps a non-array bridge result to read_failed", async () => {
    const bridge = fakeBridge({ readSteps: vi.fn().mockResolvedValue(null) });
    expect(await runHealthSync({ db: dbWith(vi.fn<Invoke>()), bridge, now: NOW, timezone: "UTC" })).toEqual({
      ok: false,
      code: "read_failed",
    });
  });

  it("maps backend errors to their codes", async () => {
    const invoke = vi.fn<Invoke>().mockResolvedValue({
      data: null,
      error: Object.assign(new Error("x"), {
        name: "FunctionsHttpError",
        context: new Response(JSON.stringify({ error: "consent_required" }), { status: 403 }),
      }),
    });
    expect(await runHealthSync({ db: dbWith(invoke), bridge: fakeBridge(), now: NOW, timezone: "UTC" })).toEqual({
      ok: false,
      code: "consent_required",
    });
  });

  it("maps an unexpected throw to sync_failed", async () => {
    const db = dbWith(() => {
      throw new Error("boom");
    });
    expect((await runHealthSync({ db, bridge: fakeBridge(), now: NOW, timezone: "UTC" })).ok).toBe(false);
  });
});

describe("connectAndSync", () => {
  it("asks for permission, records consent, then runs the first sync", async () => {
    const calls: string[] = [];
    const invoke = vi.fn<Invoke>(async (_name, opts) => {
      const action = (opts?.body as { action: string }).action;
      calls.push(action);
      return action === "connect" ? { data: { ok: true, status: "connected" }, error: null } : okSync(2);
    });
    const bridge = fakeBridge({
      requestPermission: vi.fn(async () => {
        calls.push("permission");
        return true;
      }),
    });
    const out = await connectAndSync({ db: dbWith(invoke), bridge, now: NOW, timezone: "UTC" });
    expect(calls).toEqual(["permission", "connect", "sync"]);
    expect(out).toMatchObject({ connected: true, sync: { ok: true } });
    expect((invoke.mock.calls[0][1]?.body as { consent: unknown }).consent).toBe(true);
  });

  it("stops when the permission is refused (no consent recorded)", async () => {
    const invoke = vi.fn<Invoke>();
    const bridge = fakeBridge({ requestPermission: vi.fn().mockResolvedValue(false) });
    expect(await connectAndSync({ db: dbWith(invoke), bridge, now: NOW, timezone: "UTC" })).toEqual({
      connected: false,
      code: "permission_denied",
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("a throwing permission prompt is permission_denied too", async () => {
    const bridge = fakeBridge({ requestPermission: vi.fn().mockRejectedValue(new Error("x")) });
    expect(await connectAndSync({ db: dbWith(vi.fn<Invoke>()), bridge, now: NOW, timezone: "UTC" })).toEqual({
      connected: false,
      code: "permission_denied",
    });
  });

  it("reports a failed connect without syncing", async () => {
    const invoke = vi.fn<Invoke>().mockResolvedValue({
      data: null,
      error: Object.assign(new Error("x"), { name: "FunctionsFetchError", context: {} }),
    });
    expect(await connectAndSync({ db: dbWith(invoke), bridge: fakeBridge(), now: NOW, timezone: "UTC" })).toEqual({
      connected: false,
      code: "network",
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("stays connected when only the first sync fails", async () => {
    const invoke = vi.fn<Invoke>(async (_n, opts) =>
      (opts?.body as { action: string }).action === "connect"
        ? { data: { ok: true, status: "connected" }, error: null }
        : { data: null, error: Object.assign(new Error("x"), { name: "FunctionsFetchError", context: {} }) },
    );
    expect(await connectAndSync({ db: dbWith(invoke), bridge: fakeBridge(), now: NOW, timezone: "UTC" })).toEqual({
      connected: true,
      sync: { ok: false, code: "network" },
    });
  });
});
