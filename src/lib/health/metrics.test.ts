import { describe, expect, it } from "vitest";
import * as server from "../../../supabase/functions/health-sync/health-sync.ts";
import { AUTO_METRICS, isAutoMetric, METRIC_LIMITS, SYNC_DAYS } from "./metrics";

describe("client metrics mirror", () => {
  it("has exactly the server's metrics, limits and days per sync (they must never differ)", () => {
    expect([...AUTO_METRICS]).toEqual([...server.AUTO_METRICS]);
    expect(METRIC_LIMITS).toEqual(server.METRIC_LIMITS);
    expect(SYNC_DAYS).toBe(server.MAX_DAYS);
  });

  it("recognizes metric keys exactly", () => {
    for (const m of AUTO_METRICS) expect(isAutoMetric(m)).toBe(true);
    for (const v of ["Steps", "calories", "", null, 1]) expect(isAutoMetric(v)).toBe(false);
  });
});
