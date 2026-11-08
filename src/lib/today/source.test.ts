import { describe, expect, it } from "vitest";
import { providerOf } from "./source";

describe("providerOf", () => {
  it("is null for manual logs and days without a log", () => {
    expect(providerOf("manual")).toBeNull();
    expect(providerOf("none")).toBeNull();
  });
  it("returns a known provider's message key", () => {
    expect(providerOf("strava")).toBe("strava");
    expect(providerOf("google_fit")).toBe("google_fit");
  });
  it("names Health Connect (automatic steps from the Android app)", () => {
    expect(providerOf("health_connect")).toBe("health_connect");
  });
  it("maps an unknown provider to 'other' (no raw ids in the UI)", () => {
    expect(providerOf("acme-sync")).toBe("other");
  });
});
