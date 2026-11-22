import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The repo has no DOM test library, so this guards the wiring as text: the screen must
// re-render when the native bridge registers after it mounted.
const src = readFileSync(join(__dirname, "HealthIntegration.tsx"), "utf8");

describe("HealthIntegration bridge subscription", () => {
  it("imports subscribeHealthBridge from the bridge module", () => {
    expect(src).toMatch(/import\s*\{[^}]*\bsubscribeHealthBridge\b[^}]*\}\s*from\s*"@\/lib\/health\/bridge"/);
  });

  it("passes it to useSyncExternalStore with the server snapshot undefined", () => {
    expect(src).toMatch(
      /useSyncExternalStore\(\s*subscribeHealthBridge\s*,\s*getHealthBridge\s*,\s*\(\)\s*=>\s*undefined\s*\)/,
    );
  });

  it("no longer uses a no-op subscribe", () => {
    expect(src).not.toMatch(/const subscribe = \(\) => \(\) => \{\}/);
  });
});
