import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";
import { KNOWN_PROVIDERS, providerOf } from "./source";

describe("providerOf", () => {
  it("is null for manual logs and days without a log", () => {
    expect(providerOf("manual")).toBeNull();
    expect(providerOf("none")).toBeNull();
  });
  it("returns a known provider's message key", () => {
    expect(providerOf("strava")).toBe("strava");
    expect(providerOf("google_fit")).toBe("google_fit");
  });
  it("names Health Connect (automatic data from the Android app)", () => {
    expect(providerOf("health_connect")).toBe("health_connect");
  });
  it("names Huawei Health (the later cloud adapter)", () => {
    expect(providerOf("huawei_health")).toBe("huawei_health");
  });
  it("every known provider has a label in both languages", () => {
    for (const key of [...KNOWN_PROVIDERS, "other"]) {
      expect(pt.today.providers[key as keyof typeof pt.today.providers], key).toBeTruthy();
      expect(en.today.providers[key as keyof typeof en.today.providers], key).toBeTruthy();
    }
    expect(pt.today.providers.huawei_health).toBe("Huawei Saúde");
    expect(en.today.providers.huawei_health).toBe("Huawei Health");
  });
  it("maps an unknown provider to 'other' (no raw ids in the UI)", () => {
    expect(providerOf("acme-sync")).toBe("other");
  });
});
