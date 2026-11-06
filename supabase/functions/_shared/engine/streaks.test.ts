import { describe, expect, it } from "vitest";
import { computeStreak } from "./streaks.ts";

// 2026-03-02 is a Monday; 2026-02-23 is a Monday; 2026-01-05 is a Monday.
describe("computeStreak", () => {
  it("empty input is 0/0", () => {
    expect(computeStreak([], "2026-03-06")).toEqual({ current: 0, best: 0 });
  });

  it("5 consecutive days ending today", () => {
    const d = ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06"];
    expect(computeStreak(d, "2026-03-06")).toEqual({ current: 5, best: 5 });
  });

  it("one missed day in an ISO week is forgiven and not counted", () => {
    // Mon, Tue, (Wed missed), Thu, Fri
    const d = ["2026-03-02", "2026-03-03", "2026-03-05", "2026-03-06"];
    expect(computeStreak(d, "2026-03-06")).toEqual({ current: 4, best: 4 });
  });

  it("two missed days in the same ISO week break the run", () => {
    // Mon active, Tue+Wed missed, Thu, Fri active
    const d = ["2026-03-02", "2026-03-05", "2026-03-06"];
    expect(computeStreak(d, "2026-03-06")).toEqual({ current: 2, best: 2 });
  });

  it("a gap crossing an ISO week boundary uses each week's own freeze", () => {
    // Sun 03-01 (week A) and Mon 03-02 (week B) missed: both forgiven
    const d = ["2026-02-27", "2026-02-28", "2026-03-03", "2026-03-04"];
    expect(computeStreak(d, "2026-03-04")).toEqual({ current: 4, best: 4 });
  });

  it("one forgiven day per week across two consecutive weeks", () => {
    // Thu 02-26 missed (week A), Tue 03-03 missed (week B)
    const d = [
      "2026-02-25", "2026-02-27", "2026-02-28", "2026-03-01",
      "2026-03-02", "2026-03-04", "2026-03-05",
    ];
    expect(computeStreak(d, "2026-03-05")).toEqual({ current: 7, best: 7 });
  });

  it("today inactive but yesterday active keeps the streak", () => {
    expect(computeStreak(["2026-03-04", "2026-03-05"], "2026-03-06")).toEqual({
      current: 2,
      best: 2,
    });
  });

  it("today inactive, yesterday missed: yesterday is forgiven", () => {
    const d = ["2026-03-02", "2026-03-03", "2026-03-04"];
    expect(computeStreak(d, "2026-03-06")).toEqual({ current: 3, best: 3 });
  });

  it("today inactive and two earlier misses in the week end the run", () => {
    expect(computeStreak(["2026-03-02"], "2026-03-05")).toEqual({ current: 0, best: 1 });
  });

  it("duplicates count once", () => {
    const d = ["2026-03-05", "2026-03-05", "2026-03-06", "2026-03-06", "2026-03-06"];
    expect(computeStreak(d, "2026-03-06")).toEqual({ current: 2, best: 2 });
  });

  it("future dates are ignored", () => {
    const d = ["2026-03-06", "2026-03-07", "2026-03-08"];
    expect(computeStreak(d, "2026-03-06")).toEqual({ current: 1, best: 1 });
    expect(computeStreak(["2026-03-07"], "2026-03-06")).toEqual({ current: 0, best: 0 });
  });

  it("days before the first active date are never misses", () => {
    expect(computeStreak(["2026-03-06"], "2026-03-06")).toEqual({ current: 1, best: 1 });
  });

  it("best keeps an older, longer run", () => {
    const d = [
      "2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09",
      "2026-03-06",
    ];
    expect(computeStreak(d, "2026-03-06")).toEqual({ current: 1, best: 5 });
  });

  it("crosses a month/year boundary", () => {
    const d = ["2025-12-30", "2025-12-31", "2026-01-01"];
    expect(computeStreak(d, "2026-01-01")).toEqual({ current: 3, best: 3 });
  });

  it("crosses a leap day", () => {
    const d = ["2028-02-28", "2028-02-29", "2028-03-01"];
    expect(computeStreak(d, "2028-03-01")).toEqual({ current: 3, best: 3 });
  });

  it("does not depend on input order", () => {
    const d = ["2026-03-06", "2026-03-04", "2026-03-05"];
    expect(computeStreak(d, "2026-03-06")).toEqual({ current: 3, best: 3 });
  });

  it("throws on malformed dates", () => {
    expect(() => computeStreak(["2026-3-6"], "2026-03-06")).toThrow(/date/i);
    expect(() => computeStreak([], "nope")).toThrow(/date/i);
    expect(() => computeStreak(["2026-02-30"], "2026-03-06")).toThrow(/date/i);
  });
});
