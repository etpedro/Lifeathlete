import { describe, expect, it } from "vitest";
import { localDate } from "./dates.ts";

describe("localDate", () => {
  it("uses summer time after the March 2026 spring-forward (Lisbon)", () => {
    expect(localDate("2026-03-29T23:59:00Z", "Europe/Lisbon")).toBe("2026-03-30");
  });
  it("uses UTC+0 in winter (Lisbon)", () => {
    expect(localDate("2026-01-10T23:59:00Z", "Europe/Lisbon")).toBe("2026-01-10");
  });
  it("handles a negative offset (Sao Paulo)", () => {
    expect(localDate("2026-06-01T23:30:00Z", "America/Sao_Paulo")).toBe("2026-06-01");
    expect(localDate("2026-06-01T02:30:00Z", "America/Sao_Paulo")).toBe("2026-05-31");
  });
  it("spring-forward boundary day in Lisbon (clocks 01:00 UTC)", () => {
    expect(localDate("2026-03-29T00:59:00Z", "Europe/Lisbon")).toBe("2026-03-29");
    expect(localDate("2026-03-29T01:00:00Z", "Europe/Lisbon")).toBe("2026-03-29");
    expect(localDate("2026-03-28T23:59:00Z", "Europe/Lisbon")).toBe("2026-03-28");
  });
  it("fall-back boundary day in Lisbon (clocks 01:00 UTC)", () => {
    expect(localDate("2026-10-24T23:30:00Z", "Europe/Lisbon")).toBe("2026-10-25");
    expect(localDate("2026-10-25T00:30:00Z", "Europe/Lisbon")).toBe("2026-10-25");
    expect(localDate("2026-10-25T01:30:00Z", "Europe/Lisbon")).toBe("2026-10-25");
    expect(localDate("2026-10-25T23:59:00Z", "Europe/Lisbon")).toBe("2026-10-25");
    expect(localDate("2026-10-26T00:00:00Z", "Europe/Lisbon")).toBe("2026-10-26");
  });
  it("crosses a year boundary", () => {
    expect(localDate("2025-12-31T23:30:00Z", "Europe/Lisbon")).toBe("2025-12-31");
    expect(localDate("2025-12-31T23:30:00Z", "Asia/Tokyo")).toBe("2026-01-01");
  });
  it("throws a clear error on an invalid timezone", () => {
    expect(() => localDate("2026-01-10T12:00:00Z", "Mars/Olympus")).toThrow(/timezone/i);
  });
  it("throws a clear error on a malformed instant", () => {
    expect(() => localDate("not-a-date", "Europe/Lisbon")).toThrow(/instant/i);
    expect(() => localDate("", "Europe/Lisbon")).toThrow(/instant/i);
  });
});
