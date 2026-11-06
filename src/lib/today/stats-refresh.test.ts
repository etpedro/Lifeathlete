import { describe, expect, it, vi } from "vitest";
import type { RecalcScheduler } from "@/lib/data/recalc";
import type { HeaderStats } from "@/lib/data/today";
import { createStatsRefresher, isStale } from "./stats-refresh";

const TODAY = "2026-11-06";
const stats = (computedFor: string | null, xpTotal = 100): HeaderStats => ({
  xpTotal,
  level: 2,
  currentStreak: 10,
  computedFor,
});

function fakeScheduler(outcome: () => Promise<void> = async () => {}) {
  return {
    request: vi.fn(() => outcome()),
    flush: vi.fn(async () => {}),
  } satisfies RecalcScheduler;
}

function setup(initial: HeaderStats, opts: { scheduler?: ReturnType<typeof fakeScheduler>; next?: HeaderStats } = {}) {
  const scheduler = opts.scheduler ?? fakeScheduler();
  let current = initial;
  const onStats = vi.fn((s: HeaderStats) => {
    current = s;
  });
  const onFailed = vi.fn();
  const loadStats = vi.fn(async () => opts.next ?? stats(TODAY));
  const createScheduler = vi.fn(() => scheduler);
  const r = createStatsRefresher({ createScheduler, loadStats, current: () => current, onStats, onFailed });
  return { r, scheduler, onStats, onFailed, loadStats, createScheduler };
}

describe("isStale", () => {
  it("is stale when never computed or computed for an earlier local day", () => {
    expect(isStale(null, TODAY)).toBe(true);
    expect(isStale(undefined, TODAY)).toBe(true);
    expect(isStale("2026-11-01", TODAY)).toBe(true);
    expect(isStale(TODAY, TODAY)).toBe(false);
    expect(isStale("2026-11-07", TODAY)).toBe(false); // a later day (timezone edge) is fresh
  });
});

describe("createStatsRefresher", () => {
  it("stale stats (10-day streak computed 5 days ago) trigger a recalculation and a fresh read", async () => {
    const t = setup(stats("2026-11-01"), { next: { ...stats(TODAY), currentStreak: 0 } });
    t.r.ensureFresh(TODAY);
    await vi.waitFor(() => expect(t.onStats).toHaveBeenCalled());
    expect(t.scheduler.request).toHaveBeenCalledTimes(1);
    expect(t.onStats).toHaveBeenCalledWith({ ...stats(TODAY), currentStreak: 0 });
  });

  it("fresh stats do not trigger anything (no scheduler, no network)", async () => {
    const t = setup(stats(TODAY));
    t.r.ensureFresh(TODAY);
    await Promise.resolve();
    expect(t.createScheduler).not.toHaveBeenCalled();
    expect(t.loadStats).not.toHaveBeenCalled();
  });

  it("asks once per day while a stale request is in flight (focus events do not pile up)", async () => {
    let release!: () => void;
    const scheduler = fakeScheduler(() => new Promise<void>((res) => (release = res)));
    const t = setup(stats("2026-11-01"), { scheduler });
    t.r.ensureFresh(TODAY);
    t.r.ensureFresh(TODAY);
    expect(scheduler.request).toHaveBeenCalledTimes(1);
    release();
    await vi.waitFor(() => expect(t.onStats).toHaveBeenCalled());
    t.r.ensureFresh(TODAY); // now fresh
    expect(scheduler.request).toHaveBeenCalledTimes(1);
  });

  it("the day rolling over makes yesterday's stats stale", async () => {
    const t = setup(stats(TODAY), { next: stats("2026-11-07") });
    t.r.ensureFresh(TODAY);
    expect(t.createScheduler).not.toHaveBeenCalled();
    t.r.ensureFresh("2026-11-07");
    await vi.waitFor(() => expect(t.onStats).toHaveBeenCalled());
  });

  it("a recalculation that finally fails reports a non-blocking failure and can be asked again later", async () => {
    const scheduler = fakeScheduler(async () => {
      throw new Error("down");
    });
    const t = setup(stats("2026-11-01"), { scheduler });
    t.r.ensureFresh(TODAY);
    await vi.waitFor(() => expect(t.onFailed).toHaveBeenCalledTimes(1));
    expect(t.onStats).not.toHaveBeenCalled();
    t.r.ensureFresh(TODAY);
    await vi.waitFor(() => expect(t.onFailed).toHaveBeenCalledTimes(2));
  });

  it("afterWrite requests a debounced recalculation and then reads the stats; failures are reported", async () => {
    const t = setup(stats(TODAY));
    t.r.afterWrite();
    await vi.waitFor(() => expect(t.onStats).toHaveBeenCalledTimes(1));
    t.loadStats.mockRejectedValueOnce(new Error("read failed"));
    t.r.afterWrite();
    await vi.waitFor(() => expect(t.onFailed).toHaveBeenCalledTimes(1));
  });

  it("dispose (leaving Hoje) flushes a pending debounced recalculation and stops UI callbacks", async () => {
    const t = setup(stats(TODAY));
    t.r.afterWrite();
    await t.r.dispose();
    expect(t.scheduler.flush).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(t.onStats).not.toHaveBeenCalled();
  });

  it("dispose without any request does nothing (no scheduler created)", async () => {
    const t = setup(stats(TODAY));
    await t.r.dispose();
    expect(t.createScheduler).not.toHaveBeenCalled();
  });
});
