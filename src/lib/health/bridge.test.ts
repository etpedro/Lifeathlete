import { afterEach, describe, expect, it, vi } from "vitest";
import { getHealthBridge, registerHealthBridge, subscribeHealthBridge, type HealthBridge } from "./bridge";

const fake = (): HealthBridge => ({
  isAvailable: () => true,
  requestPermission: async (c) => c,
  readMetrics: async () => [],
});

afterEach(() => registerHealthBridge(null));

describe("subscribeHealthBridge", () => {
  it("notifies once when a bridge registers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeHealthBridge(listener);
    const b = fake();
    registerHealthBridge(b);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getHealthBridge()).toBe(b);
    unsubscribe();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    subscribeHealthBridge(listener)();
    registerHealthBridge(fake());
    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies when the bridge is removed (null)", () => {
    registerHealthBridge(fake());
    const listener = vi.fn();
    const unsubscribe = subscribeHealthBridge(listener);
    registerHealthBridge(null);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getHealthBridge()).toBeNull();
    unsubscribe();
  });

  it("a throwing listener does not stop the others", () => {
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    const u1 = subscribeHealthBridge(bad);
    const u2 = subscribeHealthBridge(good);
    expect(() => registerHealthBridge(fake())).not.toThrow();
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
    u1();
    u2();
  });
});
