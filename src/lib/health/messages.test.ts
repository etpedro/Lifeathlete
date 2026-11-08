import { describe, expect, it } from "vitest";
import pt from "@/messages/pt.json";
import { healthErrorKey, safeTimeZone } from "./messages";
import type { HealthFlowCode } from "./sync";

const CODES: HealthFlowCode[] = [
  "consent_required",
  "invalid_request",
  "unauthorized",
  "unsupported_source",
  "sync_failed",
  "network",
  "permission_denied",
  "read_failed",
];

describe("healthErrorKey", () => {
  it("maps every code to existing localized copy (never a raw code)", () => {
    const errors = pt.profile.integrations.errors as Record<string, string>;
    for (const code of CODES) {
      const key = healthErrorKey(code);
      expect(key.startsWith("errors."), code).toBe(true);
      expect(errors[key.slice("errors.".length)], code).toBeTruthy();
    }
    expect(healthErrorKey("consent_required")).toBe("errors.consentRequired");
  });

  it("falls back to the generic sync error for an unknown code", () => {
    expect(healthErrorKey("weird" as HealthFlowCode)).toBe("errors.syncFailed");
  });
});

describe("safeTimeZone", () => {
  it("keeps a valid IANA zone and falls back to UTC otherwise", () => {
    expect(safeTimeZone("Europe/Lisbon")).toBe("Europe/Lisbon");
    expect(safeTimeZone("Not/AZone")).toBe("UTC");
    expect(safeTimeZone("")).toBe("UTC");
  });
});
