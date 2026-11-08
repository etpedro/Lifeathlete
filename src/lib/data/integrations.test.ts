import { describe, expect, it, vi } from "vitest";
import {
  connectHealth,
  disconnectHealth,
  getHealthConnection,
  HEALTH_CONSENT_VERSION,
  HealthError,
  syncHealth,
} from "./integrations";
import { DataError } from "./errors";
import { createFakeDb, type Row } from "./testing/fake-db";

const USER = "user-1";

type Invoke = NonNullable<Parameters<typeof createFakeDb>[0]["invoke"]>;

const setup = (connections: Row[] = [], invoke?: Invoke) =>
  createFakeDb({ userId: USER, tables: { provider_connections: connections }, invoke });

/** A FunctionsHttpError as supabase-js returns it: `context` is the Response. */
const httpError = (status: number, body: unknown) =>
  Object.assign(new Error("Edge Function returned a non-2xx status code"), {
    name: "FunctionsHttpError",
    context: new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  });

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(HealthError);
    expect((e as Error).message).not.toContain("secret");
    return (e as HealthError).code;
  }
  return "no error";
};

describe("getHealthConnection", () => {
  it("is 'none' when the user has no Health Connect row", async () => {
    const f = setup([{ user_id: USER, provider: "strava", status: "connected", last_synced_at: null }]);
    expect(await getHealthConnection(f.db)).toEqual({ status: "none", lastSyncedAt: null });
  });

  it("reads status and last sync of the health_connect row (granted columns only)", async () => {
    const f = setup([
      { user_id: USER, provider: "health_connect", status: "connected", last_synced_at: "2026-11-08T09:00:00Z" },
    ]);
    const select = vi.spyOn(Object.getPrototypeOf(f.db.from("provider_connections")), "select");
    expect(await getHealthConnection(f.db)).toEqual({ status: "connected", lastSyncedAt: "2026-11-08T09:00:00Z" });
    const cols = String(select.mock.calls.at(-1)?.[0]);
    expect(cols).not.toMatch(/token|consented_at|expires_at|\*/);
    select.mockRestore();
  });

  it("maps a disconnected (or unknown) status to 'disconnected'", async () => {
    for (const status of ["disconnected", "error"]) {
      const f = setup([{ user_id: USER, provider: "health_connect", status, last_synced_at: null }]);
      expect((await getHealthConnection(f.db)).status).toBe("disconnected");
    }
  });

  it("throws a DataError when the read fails", async () => {
    const f = setup();
    f.failNext("provider_connections", "select");
    await expect(getHealthConnection(f.db)).rejects.toBeInstanceOf(DataError);
  });
});

describe("connectHealth / syncHealth / disconnectHealth", () => {
  it("connect sends explicit consent with the consent version", async () => {
    const invoke = vi.fn<Invoke>().mockResolvedValue({ data: { ok: true, status: "connected" }, error: null });
    const f = setup([], invoke);
    expect(await connectHealth(f.db, HEALTH_CONSENT_VERSION)).toEqual({ status: "connected" });
    expect(invoke).toHaveBeenCalledWith("health-sync", {
      body: { action: "connect", source: "health_connect", consent: true, consentVersion: HEALTH_CONSENT_VERSION },
    });
    expect(HEALTH_CONSENT_VERSION.length).toBeLessThanOrEqual(32);
  });

  it("sync sends the days and returns the summary", async () => {
    const data = { ok: true, status: "connected", lastSyncedAt: "2026-11-08T10:00:00Z", days: 2, habitsUpdated: 1, skippedManual: 0 };
    const invoke = vi.fn<Invoke>().mockResolvedValue({ data, error: null });
    const f = setup([], invoke);
    const days = [{ date: "2026-11-08", steps: 1200 }, { date: "2026-11-07", steps: 9000 }];
    expect(await syncHealth(f.db, days)).toEqual({
      lastSyncedAt: "2026-11-08T10:00:00Z",
      days: 2,
      habitsUpdated: 1,
      skippedManual: 0,
    });
    expect(invoke).toHaveBeenCalledWith("health-sync", { body: { action: "sync", source: "health_connect", days } });
  });

  it("disconnect asks the function to disconnect", async () => {
    const invoke = vi.fn<Invoke>().mockResolvedValue({ data: { ok: true, status: "disconnected" }, error: null });
    const f = setup([], invoke);
    expect(await disconnectHealth(f.db)).toEqual({ status: "disconnected" });
    expect(invoke).toHaveBeenCalledWith("health-sync", { body: { action: "disconnect", source: "health_connect" } });
  });

  it.each([
    ["consent_required", 403],
    ["invalid_request", 400],
    ["unsupported_source", 400],
    ["unauthorized", 401],
    ["sync_failed", 500],
  ])("maps the backend error %s to a typed code", async (code, status) => {
    const f = setup([], async () => ({ data: null, error: httpError(status, { error: code }) }));
    expect(await codeOf(syncHealth(f.db, [{ date: "2026-11-08", steps: 1 }]))).toBe(code);
  });

  it("maps an unknown backend error to sync_failed and a bodiless 401 to unauthorized", async () => {
    const odd = setup([], async () => ({ data: null, error: httpError(500, { error: "secret internals" }) }));
    expect(await codeOf(disconnectHealth(odd.db))).toBe("sync_failed");
    const noBody = setup([], async () => ({
      data: null,
      error: Object.assign(new Error("x"), { name: "FunctionsHttpError", context: new Response("nope", { status: 401 }) }),
    }));
    expect(await codeOf(connectHealth(noBody.db, HEALTH_CONSENT_VERSION))).toBe("unauthorized");
  });

  it("maps a network failure to network (returned or thrown)", async () => {
    const fetchError = Object.assign(new Error("Failed to send a request"), { name: "FunctionsFetchError", context: {} });
    const returned = setup([], async () => ({ data: null, error: fetchError }));
    expect(await codeOf(syncHealth(returned.db, [{ date: "2026-11-08", steps: 1 }]))).toBe("network");
    const thrown = setup([], async () => Promise.reject(new TypeError("fetch failed")));
    expect(await codeOf(disconnectHealth(thrown.db))).toBe("network");
  });

  it("maps a relay error and a malformed success body to sync_failed", async () => {
    const relay = setup([], async () => ({ data: null, error: Object.assign(new Error("relay"), { name: "FunctionsRelayError" }) }));
    expect(await codeOf(disconnectHealth(relay.db))).toBe("sync_failed");
    const malformed = setup([], async () => ({ data: { nope: true }, error: null }));
    expect(await codeOf(syncHealth(malformed.db, [{ date: "2026-11-08", steps: 1 }]))).toBe("sync_failed");
  });
});
