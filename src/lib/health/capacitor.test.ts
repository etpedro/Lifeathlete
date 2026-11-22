import { afterEach, describe, expect, it, vi } from "vitest";
import { getHealthBridge, registerHealthBridge, type HealthBridge } from "./bridge";
import {
  createCapacitorHealthBridge,
  deviceState,
  getNativeStatus,
  registerNativeHealthBridge,
  subscribeNativeStatus,
  type HealthConnectBridgePlugin,
} from "./capacitor";
import type { AutoMetric } from "./metrics";

type Day = { date: string; metrics: Partial<Record<AutoMetric, number>> };

function fakePlugin(over: Partial<HealthConnectBridgePlugin> = {}) {
  const plugin = {
    isAvailable: vi.fn(async () => ({ available: true, unavailableCategories: [] as AutoMetric[] })),
    checkPermissions: vi.fn(async () => ({ granted: [] as AutoMetric[] })),
    requestPermissions: vi.fn(async (o: { categories: AutoMetric[] }) => ({ granted: o.categories })),
    readMetrics: vi.fn(async () => ({ days: [] as Day[] })),
    ...over,
  };
  return plugin satisfies HealthConnectBridgePlugin;
}

afterEach(() => registerHealthBridge(null));

describe("registerNativeHealthBridge", () => {
  it("does nothing outside the native shell", async () => {
    const plugin = fakePlugin();
    expect(await registerNativeHealthBridge({ isNative: () => false, plugin })).toBe(false);
    expect(getHealthBridge()).toBeNull();
    expect(plugin.isAvailable).not.toHaveBeenCalled();
  });

  it("registers nothing when Health Connect is not available", async () => {
    const plugin = fakePlugin({ isAvailable: vi.fn(async () => ({ available: false, unavailableCategories: [] })) });
    expect(await registerNativeHealthBridge({ isNative: () => true, plugin })).toBe(false);
    expect(getHealthBridge()).toBeNull();
  });

  it("registers nothing when isAvailable rejects", async () => {
    const plugin = fakePlugin({ isAvailable: vi.fn(async () => Promise.reject(new Error("boom"))) });
    expect(await registerNativeHealthBridge({ isNative: () => true, plugin })).toBe(false);
    expect(getHealthBridge()).toBeNull();
  });

  it("registers a bridge that is available when Health Connect is", async () => {
    expect(await registerNativeHealthBridge({ isNative: () => true, plugin: fakePlugin() })).toBe(true);
    expect(getHealthBridge()?.isAvailable()).toBe(true);
  });
});

describe("createCapacitorHealthBridge", () => {
  it("requestPermission asks only for the available categories", async () => {
    const plugin = fakePlugin();
    const bridge = createCapacitorHealthBridge(plugin, ["mindful_minutes"]);
    expect(await bridge.requestPermission(["steps", "mindful_minutes"])).toEqual(["steps"]);
    expect(plugin.requestPermissions).toHaveBeenCalledWith({ categories: ["steps"] });
  });

  it("requestPermission does not call the plugin when nothing is available", async () => {
    const plugin = fakePlugin();
    const bridge = createCapacitorHealthBridge(plugin, ["mindful_minutes"]);
    expect(await bridge.requestPermission(["mindful_minutes"])).toEqual([]);
    expect(plugin.requestPermissions).not.toHaveBeenCalled();
  });

  it("readMetrics passes exactly the categories and days, and returns the days", async () => {
    const days: Day[] = [{ date: "2026-11-08", metrics: { steps: 1000, sleep_hours: 7.5 } }];
    const plugin = fakePlugin({ readMetrics: vi.fn(async () => ({ days })) });
    const bridge = createCapacitorHealthBridge(plugin, []);
    expect(await bridge.readMetrics(7, ["steps", "sleep_hours"])).toEqual(days);
    expect(plugin.readMetrics).toHaveBeenCalledWith({ days: 7, categories: ["steps", "sleep_hours"] });
  });

  it("readMetrics skips unavailable categories, and the plugin when none are left", async () => {
    const plugin = fakePlugin();
    const bridge = createCapacitorHealthBridge(plugin, ["sleep_hours"]);
    await bridge.readMetrics(7, ["steps", "sleep_hours"]);
    expect(plugin.readMetrics).toHaveBeenCalledWith({ days: 7, categories: ["steps"] });
    vi.mocked(plugin.readMetrics).mockClear();
    expect(await bridge.readMetrics(7, ["sleep_hours"])).toEqual([]);
    expect(plugin.readMetrics).not.toHaveBeenCalled();
  });

  it("drops junk coming from the plugin", async () => {
    const junk = [
      { date: "2026-11-08", metrics: { steps: 1234.6, sleep_hours: 7.456, bogus: 5, workout_minutes: -1, mindful_minutes: Number.NaN } },
      { date: "2026-11-07", metrics: { steps: "900" } },
      { date: "2026-11-06" },
      { date: "2026-11-05", metrics: { steps: 10, workout_minutes: 30 } },
      { date: "2026-11-08", metrics: { steps: 99 } },
      { date: "2026-11-04", metrics: {} },
    ] as unknown as Day[];
    const plugin = fakePlugin({ readMetrics: vi.fn(async () => ({ days: junk })) });
    const bridge = createCapacitorHealthBridge(plugin, []);
    const out = await bridge.readMetrics(7, ["steps", "sleep_hours", "workout_minutes"]);
    expect(out).toEqual([
      { date: "2026-11-08", metrics: { steps: 1235, sleep_hours: 7.46 } },
      { date: "2026-11-05", metrics: { steps: 10, workout_minutes: 30 } },
    ]);
  });

  it("drops metrics the caller did not ask for", async () => {
    const plugin = fakePlugin({
      readMetrics: vi.fn(async () => ({ days: [{ date: "2026-11-08", metrics: { steps: 5, sleep_hours: 8 } }] })),
    });
    const bridge = createCapacitorHealthBridge(plugin, []);
    expect(await bridge.readMetrics(7, ["steps"])).toEqual([{ date: "2026-11-08", metrics: { steps: 5 } }]);
  });

  it("propagates plugin rejections", async () => {
    const plugin = fakePlugin({
      requestPermissions: vi.fn(async () => Promise.reject(new Error("denied"))),
      readMetrics: vi.fn(async () => Promise.reject(new Error("read"))),
    });
    const bridge = createCapacitorHealthBridge(plugin, []);
    await expect(bridge.requestPermission(["steps"])).rejects.toThrow("denied");
    await expect(bridge.readMetrics(7, ["steps"])).rejects.toThrow("read");
  });
});

describe("native registration status", () => {
  const native = { isNative: () => true };
  it("is pending while the plugin is asked, then ready", async () => {
    let release!: (v: { available: boolean; unavailableCategories: AutoMetric[] }) => void;
    const plugin = fakePlugin({ isAvailable: () => new Promise((r) => (release = r)) });
    const seen: string[] = [];
    const off = subscribeNativeStatus(() => seen.push(getNativeStatus()));
    const done = registerNativeHealthBridge({ ...native, plugin });
    expect(getNativeStatus()).toBe("pending");
    release({ available: true, unavailableCategories: [] });
    await done;
    expect(getNativeStatus()).toBe("ready");
    expect(seen).toEqual(["pending", "ready"]);
    off();
  });

  it("ends unavailable when Health Connect is missing", async () => {
    const plugin = fakePlugin({ isAvailable: async () => ({ available: false, unavailableCategories: [] }) });
    await registerNativeHealthBridge({ ...native, plugin });
    expect(getNativeStatus()).toBe("unavailable");
  });

  it("ends unavailable when isAvailable rejects", async () => {
    const plugin = fakePlugin({ isAvailable: async () => Promise.reject(new Error("x")) });
    await registerNativeHealthBridge({ ...native, plugin });
    expect(getNativeStatus()).toBe("unavailable");
  });

  it("stays idle outside the native shell", async () => {
    await registerNativeHealthBridge({ isNative: () => false, plugin: fakePlugin() });
    expect(getNativeStatus()).toBe("idle");
  });
});

describe("deviceState", () => {
  const present: HealthBridge = { isAvailable: () => true, requestPermission: async () => [], readMetrics: async () => [] };
  const statuses = ["idle", "pending", "ready", "unavailable"] as const;
  it("server (bridge unknown) is pending", () => {
    expect(deviceState({ bridge: undefined, nativeShell: false, status: "idle" })).toBe("pending");
  });
  it("browser: bridge decides, never the install message", () => {
    for (const status of statuses) {
      expect(deviceState({ bridge: null, nativeShell: false, status })).toBe("none");
      expect(deviceState({ bridge: present, nativeShell: false, status })).toBe("present");
    }
  });
  it("native: a registered bridge is present whatever the status", () => {
    for (const status of statuses) expect(deviceState({ bridge: present, nativeShell: true, status })).toBe("present");
  });
  it("native without a bridge: pending until settled, install message only when unavailable", () => {
    expect(deviceState({ bridge: null, nativeShell: true, status: "idle" })).toBe("pending");
    expect(deviceState({ bridge: null, nativeShell: true, status: "pending" })).toBe("pending");
    expect(deviceState({ bridge: null, nativeShell: true, status: "ready" })).toBe("pending");
    expect(deviceState({ bridge: null, nativeShell: true, status: "unavailable" })).toBe("needsHealthConnect");
  });
});
