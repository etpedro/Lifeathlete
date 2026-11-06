import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRecalcScheduler } from "./recalc";

const DELAY = 500;

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createRecalcScheduler", () => {
  it("collapses a burst of 5 requests into one call after the quiet period", async () => {
    const invoke = vi.fn(async () => {});
    const s = createRecalcScheduler(invoke, DELAY);
    const results = Array.from({ length: 5 }, () => s.request());
    await vi.advanceTimersByTimeAsync(DELAY - 1);
    expect(invoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all(results);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("is a trailing debounce: each request restarts the quiet period", async () => {
    const invoke = vi.fn(async () => {});
    const s = createRecalcScheduler(invoke, DELAY);
    void s.request();
    await vi.advanceTimersByTimeAsync(DELAY - 100);
    void s.request();
    await vi.advanceTimersByTimeAsync(DELAY - 100);
    expect(invoke).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("queues exactly one more run for requests made while a run is in flight, after it finishes", async () => {
    const runs: ReturnType<typeof deferred>[] = [];
    const invoke = vi.fn(() => {
      const d = deferred();
      runs.push(d);
      return d.promise;
    });
    const s = createRecalcScheduler(invoke, DELAY);

    const first = s.request();
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(invoke).toHaveBeenCalledTimes(1);

    const second = s.request();
    const third = s.request();
    expect(second).toBe(third);
    await vi.advanceTimersByTimeAsync(DELAY * 3);
    expect(invoke).toHaveBeenCalledTimes(1); // never overlaps the running one

    runs[0].resolve();
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(invoke).toHaveBeenCalledTimes(2);
    runs[1].resolve();
    await second;
    await vi.advanceTimersByTimeAsync(DELAY * 3);
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("rejects only the failing run; the next request works", async () => {
    const invoke = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);
    const s = createRecalcScheduler(invoke, DELAY);

    const failing = s.request();
    const settled = failing.catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(await settled).toBe("boom");

    const ok = s.request();
    await vi.advanceTimersByTimeAsync(DELAY);
    await expect(ok).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("survives an invoke that throws synchronously", async () => {
    const invoke = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => {
        throw new Error("sync");
      })
      .mockResolvedValueOnce(undefined);
    const s = createRecalcScheduler(invoke, DELAY);
    const failing = s.request().catch((e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(await failing).toBe("sync");
    const ok = s.request();
    await vi.advanceTimersByTimeAsync(DELAY);
    await expect(ok).resolves.toBeUndefined();
  });

  it("flush() runs a pending request right away and resolves when it is done", async () => {
    const invoke = vi.fn(async () => {});
    const s = createRecalcScheduler(invoke, DELAY);
    void s.request();
    await s.flush();
    expect(invoke).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("flush() with nothing pending resolves without calling invoke", async () => {
    const invoke = vi.fn(async () => {});
    await createRecalcScheduler(invoke, DELAY).flush();
    expect(invoke).not.toHaveBeenCalled();
  });
});
