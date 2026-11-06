import type { Db } from "@/lib/supabase/types";

/** Quiet period before a requested recalculation runs (rapid taps collapse into one call). */
export const RECALC_DELAY_MS = 800;

export type RecalcScheduler = {
  /** Asks for a recalculation; resolves (or rejects) when the run that covers this request ends. */
  request(): Promise<void>;
  /** Runs a pending request now (after any in-flight run) and waits for it; resolves at once if idle. */
  flush(): Promise<void>;
};

type Batch = { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void };

function newBatch(): Batch {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Trailing debounce with a single in-flight run (ruling M): requests made within `delayMs`
 * of each other share one `invoke`; runs never overlap, and requests made while a run is
 * in flight are served by exactly one more run after it, so the final state always
 * reflects the last write. A failure rejects that run's requests only.
 */
export function createRecalcScheduler(invoke: () => Promise<void>, delayMs: number): RecalcScheduler {
  let pending: Batch | null = null; // requested, not started yet
  let due = false; // the pending batch's quiet period has elapsed
  let running = false;
  let current: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;

  function startIfReady(): void {
    if (!pending || !due || running) return;
    const batch = pending;
    pending = null;
    due = false;
    running = true;
    current = Promise.resolve()
      .then(invoke) // also turns a synchronous throw into a rejection
      .then(batch.resolve, batch.reject)
      .finally(() => {
        running = false;
        startIfReady();
      });
  }

  return {
    request() {
      pending ??= newBatch();
      due = false;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        due = true;
        startIfReady();
      }, delayMs);
      return pending.promise;
    },
    flush() {
      if (!pending) return running ? current : Promise.resolve();
      clearTimeout(timer);
      timer = undefined;
      due = true;
      const { promise } = pending;
      startIfReady();
      return promise;
    },
  };
}

/** `invoke` for the scheduler: calls the `recalculate` Edge Function (the user comes from the JWT). */
export function recalculateVia(db: Db): () => Promise<void> {
  return async () => {
    const { error } = await db.functions.invoke("recalculate", { method: "POST" });
    if (error) throw error;
  };
}

/** Bounded retry of a failed recalculation: 3 tries, waiting 1s then 2s (spec §6 "intervalos crescentes"). */
export const RECALC_RETRY = { attempts: 3, baseDelayMs: 1000 } as const;

/**
 * `fn` with bounded exponential backoff: up to `attempts` tries, waiting
 * baseDelayMs * 2^(n-1) after the n-th failure; rejects with the last error.
 */
export function withRetry(
  fn: () => Promise<void>,
  { attempts, baseDelayMs }: { attempts: number; baseDelayMs: number },
): () => Promise<void> {
  return async () => {
    for (let n = 1; ; n++) {
      try {
        return await fn();
      } catch (error) {
        if (n >= attempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** (n - 1)));
      }
    }
  };
}

/** The shared debounced recalculation (with retry) for UI controllers (Today, habit management). */
export function createDefaultRecalcScheduler(db: Db): RecalcScheduler {
  return createRecalcScheduler(withRetry(recalculateVia(db), RECALC_RETRY), RECALC_DELAY_MS);
}
