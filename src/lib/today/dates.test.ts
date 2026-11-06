import { describe, expect, it } from "vitest";
import { backfillDates, shiftDate, todayIn } from "./dates";

describe("todayIn", () => {
  it("a 23:59 local tap in Lisbon on the spring-forward day belongs to that local date", () => {
    // 2026-03-29: clocks go 01:00 UTC -> WEST (UTC+1); 23:59 local = 22:59 UTC
    expect(todayIn("Europe/Lisbon", new Date("2026-03-29T22:59:00Z"))).toBe("2026-03-29");
    // one hour later in UTC terms is already the next local day
    expect(todayIn("Europe/Lisbon", new Date("2026-03-29T23:00:00Z"))).toBe("2026-03-30");
  });

  it("a 23:59 local tap in Lisbon on the fall-back day belongs to that local date", () => {
    // 2026-10-25: back to UTC+0, so 23:59 local = 23:59 UTC
    expect(todayIn("Europe/Lisbon", new Date("2026-10-25T23:59:00Z"))).toBe("2026-10-25");
    expect(todayIn("Europe/Lisbon", new Date("2026-10-26T00:00:00Z"))).toBe("2026-10-26");
  });

  it("differs from the UTC date when the zone is ahead", () => {
    expect(todayIn("Asia/Tokyo", new Date("2026-11-06T16:00:00Z"))).toBe("2026-11-07");
  });

  it("falls back to UTC for an invalid timezone instead of crashing", () => {
    expect(todayIn("Mars/Olympus", new Date("2026-11-06T23:30:00Z"))).toBe("2026-11-06");
  });
});

describe("shiftDate", () => {
  it("moves by whole days across month and year boundaries", () => {
    expect(shiftDate("2026-11-01", -1)).toBe("2026-10-31");
    expect(shiftDate("2026-01-01", -2)).toBe("2025-12-30");
    expect(shiftDate("2028-03-01", -1)).toBe("2028-02-29");
    expect(shiftDate("2026-11-06", 0)).toBe("2026-11-06");
  });

  it("throws on a malformed date", () => {
    expect(() => shiftDate("2026-13-01", -1)).toThrow(/date/i);
  });
});

describe("backfillDates", () => {
  it("lists today, yesterday and 2 days ago (ENGINE_CONFIG.backfillDays), newest first", () => {
    expect(backfillDates("2026-11-01")).toEqual([
      { date: "2026-11-01", daysAgo: 0 },
      { date: "2026-10-31", daysAgo: 1 },
      { date: "2026-10-30", daysAgo: 2 },
    ]);
  });
});
