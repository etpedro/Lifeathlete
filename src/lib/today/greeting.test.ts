import { describe, expect, it } from "vitest";
import { hourIn } from "./dates";
import { greetingKey } from "./greeting";

describe("greetingKey", () => {
  it.each([
    [5, "morning"],
    [11, "morning"],
    [12, "afternoon"],
    [18, "afternoon"],
    [19, "evening"],
    [23, "evening"],
    [0, "evening"],
    [4, "evening"],
  ] as const)("hour %i is %s", (hour, key) => {
    expect(greetingKey(hour)).toBe(key);
  });
});

describe("hourIn", () => {
  const instant = new Date("2026-11-06T23:30:00Z");
  it("reads the hour in the given timezone", () => {
    expect(hourIn("UTC", instant)).toBe(23);
    expect(hourIn("Pacific/Auckland", instant)).toBe(12); // UTC+13 in November
  });
  it("returns 0 at midnight (not 24)", () => {
    expect(hourIn("UTC", new Date("2026-11-07T00:10:00Z"))).toBe(0);
  });
  it("falls back to UTC for an invalid timezone", () => {
    expect(hourIn("Not/AZone", instant)).toBe(23);
  });
});
