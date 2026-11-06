import { afterEach, describe, expect, it, vi } from "vitest";
import { backfillDates, reanchorDay, shiftDate, todayIn } from "./dates";

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

describe("reanchorDay (midnight passes with the app open)", () => {
  afterEach(() => vi.useRealTimers());

  it("moves the selection to the real today when the clock crosses local midnight (fake timers, Lisbon)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T23:50:00Z")); // 23:50 in Lisbon (UTC+0 in November)
    const opened = { today: todayIn("Europe/Lisbon"), selected: todayIn("Europe/Lisbon") };
    expect(opened).toEqual({ today: "2026-11-06", selected: "2026-11-06" });

    vi.advanceTimersByTime(20 * 60_000); // 00:10 local
    expect(reanchorDay(opened, todayIn("Europe/Lisbon"))).toEqual({
      today: "2026-11-07",
      selected: "2026-11-07",
      changed: true,
      reload: true,
    });
  });

  it("does nothing while the day has not changed", () => {
    expect(reanchorDay({ today: "2026-11-06", selected: "2026-11-05" }, "2026-11-06")).toEqual({
      today: "2026-11-06",
      selected: "2026-11-05",
      changed: false,
      reload: false,
    });
  });

  it("keeps a backfill day that is still inside the window", () => {
    expect(reanchorDay({ today: "2026-11-06", selected: "2026-11-05" }, "2026-11-07")).toEqual({
      today: "2026-11-07",
      selected: "2026-11-05",
      changed: true,
      reload: false,
    });
  });

  it("moves to today when the selected backfill day fell out of the window", () => {
    expect(reanchorDay({ today: "2026-11-06", selected: "2026-11-04" }, "2026-11-07")).toMatchObject({
      selected: "2026-11-07",
      reload: true,
    });
  });

  it("moves to today when the clock went back past the selected day", () => {
    expect(reanchorDay({ today: "2026-11-07", selected: "2026-11-07" }, "2026-11-06")).toMatchObject({
      today: "2026-11-06",
      selected: "2026-11-06",
      reload: true,
    });
  });
});
