import { describe, expect, it } from "vitest";
import { isResting } from "./resting";

describe("isResting", () => {
  it("is false for a brand-new user (no last active date)", () => {
    expect(isResting(null, "2026-11-06")).toBe(false);
  });
  it("is false at 0, 1 and 2 days", () => {
    expect(isResting("2026-11-06", "2026-11-06")).toBe(false);
    expect(isResting("2026-11-05", "2026-11-06")).toBe(false);
    expect(isResting("2026-11-04", "2026-11-06")).toBe(false);
  });
  it("is true from 3 days on", () => {
    expect(isResting("2026-11-03", "2026-11-06")).toBe(true);
    expect(isResting("2026-01-01", "2026-11-06")).toBe(true);
  });
  it("is false for a last-active date in the future (clock/timezone skew)", () => {
    expect(isResting("2026-11-09", "2026-11-06")).toBe(false);
  });
  it("counts across month and year boundaries", () => {
    expect(isResting("2026-10-29", "2026-11-01")).toBe(true); // 3 days
    expect(isResting("2026-10-30", "2026-11-01")).toBe(false); // 2 days
    expect(isResting("2025-12-30", "2026-01-02")).toBe(true); // 3 days
    expect(isResting("2025-12-31", "2026-01-02")).toBe(false); // 2 days
  });
  it("is false for malformed dates instead of throwing", () => {
    expect(isResting("garbage", "2026-11-06")).toBe(false);
  });
});
