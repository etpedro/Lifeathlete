import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataError } from "@/lib/data/errors";
import { LogValidationError } from "@/lib/data/today";
import { createFakeDb, type Row } from "@/lib/data/testing/fake-db";
import {
  createIndexedDbStore,
  createMemoryStore,
  enqueueLog,
  FLUSH_LOCK_NAME,
  flushQueue,
  isTransientError,
  listQueued,
  queueKey,
  type KeyValueStore,
  type LockFn,
  type QueueEntry,
} from "./queue";

const USER = "user-1";
const TODAY = "2026-11-06";

function setup(userId = USER) {
  return createFakeDb({
    userId,
    tables: { habit_logs: [] as Row[] },
    unique: [{ table: "habit_logs", collides: (a, b) => a.user_habit_id === b.user_habit_id && a.date === b.date }],
  });
}

const item = (userHabitId: string, value = 1, date = TODAY, userId = USER) => ({ userHabitId, userId, date, value });
const rowsOf = (rows: Row[]) => rows.map((r) => ({ habit: r.user_habit_id, date: r.date, value: r.value }));

describe("enqueueLog", () => {
  it("keys items by habit and date; a later value for the same habit/day replaces the earlier one", async () => {
    const store = createMemoryStore<QueueEntry>();
    await enqueueLog(item("h1", 1), store);
    await enqueueLog(item("h2", 5), store);
    await enqueueLog(item("h1", 0), store);
    await enqueueLog(item("h1", 1, "2026-11-05"), store);
    const queued = await listQueued(store);
    expect(queued).toHaveLength(3);
    expect(queued.find((q) => q.userHabitId === "h1" && q.date === TODAY)?.value).toBe(0);
    expect(queueKey("h1", TODAY)).toBe("h1:2026-11-06");
  });

  it("lists items in insertion order (a replaced item moves to the end)", async () => {
    const store = createMemoryStore<QueueEntry>();
    await enqueueLog(item("a"), store);
    await enqueueLog(item("b"), store);
    await enqueueLog(item("c"), store);
    await enqueueLog(item("a", 0), store);
    expect((await listQueued(store)).map((q) => q.userHabitId)).toEqual(["b", "c", "a"]);
  });
});

describe("flushQueue", () => {
  it("replays items in order through logHabit and removes them", async () => {
    const fake = setup();
    const store = createMemoryStore<QueueEntry>();
    await enqueueLog(item("h1", 1), store);
    await enqueueLog(item("h2", 7, "2026-11-05"), store);
    expect(await flushQueue(fake.db, TODAY, USER, store)).toEqual({ sent: 2, dropped: 0, kept: 0 });
    expect(fake.writes.map((w) => (w.payload as Row).user_habit_id)).toEqual(["h1", "h2"]);
    expect(fake.writes.every((w) => (w.payload as Row).source === "manual")).toBe(true);
    expect(rowsOf(fake.tables.habit_logs)).toEqual([
      { habit: "h1", date: TODAY, value: 1 },
      { habit: "h2", date: "2026-11-05", value: 7 },
    ]);
    expect(await listQueued(store)).toEqual([]);
  });

  it("sends only the last value for a habit/day that was changed several times offline", async () => {
    const fake = setup();
    const store = createMemoryStore<QueueEntry>();
    await enqueueLog(item("h1", 1), store);
    await enqueueLog(item("h1", 0), store);
    await enqueueLog(item("h1", 1), store);
    expect(await flushQueue(fake.db, TODAY, USER, store)).toEqual({ sent: 1, dropped: 0, kept: 0 });
    expect(rowsOf(fake.tables.habit_logs)).toEqual([{ habit: "h1", date: TODAY, value: 1 }]);
  });

  it("keeps the item and stops the pass on a transient failure (network / 5xx / 429)", async () => {
    for (const status of [0, 500, 503, 429]) {
      const fake = setup();
      const store = createMemoryStore<QueueEntry>();
      await enqueueLog(item("h1"), store);
      await enqueueLog(item("h2"), store);
      fake.failNext("habit_logs", "upsert", { code: "", message: "TypeError: Failed to fetch" }, status);
      expect(await flushQueue(fake.db, TODAY, USER, store), `status ${status}`).toEqual({ sent: 0, dropped: 0, kept: 2 });
      expect(fake.writes).toHaveLength(1); // stopped after the first failure
      // next pass succeeds
      expect(await flushQueue(fake.db, TODAY, USER, store)).toEqual({ sent: 2, dropped: 0, kept: 0 });
    }
  });

  it("drops (and counts) an item that fell out of the backfill window while offline", async () => {
    const fake = setup();
    const store = createMemoryStore<QueueEntry>();
    await enqueueLog(item("old", 1, "2026-11-03"), store);
    await enqueueLog(item("h1", 1), store);
    expect(await flushQueue(fake.db, TODAY, USER, store)).toEqual({ sent: 1, dropped: 1, kept: 0 });
    expect(rowsOf(fake.tables.habit_logs)).toEqual([{ habit: "h1", date: TODAY, value: 1 }]);
    expect(await listQueued(store)).toEqual([]);
  });

  it("drops (and counts) an item rejected by RLS / a 4xx, and continues with the rest", async () => {
    const fake = setup();
    const store = createMemoryStore<QueueEntry>();
    await enqueueLog(item("h-other"), store);
    await enqueueLog(item("h1"), store);
    fake.failNext("habit_logs", "upsert", { code: "42501", message: "row-level security" }, 403);
    expect(await flushQueue(fake.db, TODAY, USER, store)).toEqual({ sent: 1, dropped: 1, kept: 0 });
  });

  it("replaying the same item twice (crash after send, before removal) leaves exactly one row", async () => {
    const fake = setup();
    const memory = createMemoryStore<QueueEntry>();
    let crashOnce = true;
    const crashing: KeyValueStore<QueueEntry> = {
      ...memory,
      async deleteIf(key, pred) {
        if (crashOnce) {
          crashOnce = false; // the app died before the item was removed
          return;
        }
        return memory.deleteIf(key, pred);
      },
    };
    await enqueueLog(item("h1", 1), crashing);
    expect(await flushQueue(fake.db, TODAY, USER, crashing)).toMatchObject({ sent: 1, kept: 1 });
    expect(await flushQueue(fake.db, TODAY, USER, crashing)).toEqual({ sent: 1, dropped: 0, kept: 0 });
    expect(fake.writes).toHaveLength(2); // sent twice...
    expect(rowsOf(fake.tables.habit_logs)).toEqual([{ habit: "h1", date: TODAY, value: 1 }]); // ...one row, one value
  });

  it("concurrent flushes do not send an item twice", async () => {
    const fake = setup();
    const store = createMemoryStore<QueueEntry>();
    await enqueueLog(item("h1"), store);
    await enqueueLog(item("h2"), store);
    const [a, b] = await Promise.all([flushQueue(fake.db, TODAY, USER, store), flushQueue(fake.db, TODAY, USER, store)]);
    expect(fake.writes).toHaveLength(2);
    expect(a).toEqual({ sent: 2, dropped: 0, kept: 0 });
    expect(b).toEqual(a);
  });

  it("a flush requested while a pass is running gets one more pass afterwards (no item left behind)", async () => {
    const fake = setup();
    const memory = createMemoryStore<QueueEntry>();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let sendStarted!: () => void;
    const started = new Promise<void>((r) => (sendStarted = r));
    let first = true;
    const gated: KeyValueStore<QueueEntry> = {
      ...memory,
      async deleteIf(key, pred) {
        if (first) {
          first = false;
          sendStarted();
          await gate; // pass 1 is "in flight" here, after sending h1
        }
        return memory.deleteIf(key, pred);
      },
    };
    await enqueueLog(item("h1"), gated);
    const p1 = flushQueue(fake.db, TODAY, USER, gated);
    await started;
    await enqueueLog(item("h2"), gated); // a tap while pass 1 runs
    const p2 = flushQueue(fake.db, TODAY, USER, gated);
    const p3 = flushQueue(fake.db, TODAY, USER, gated);
    expect(p3).toBe(p2); // requests during a pass share ONE follow-up pass
    release();
    expect(await p1).toEqual({ sent: 1, dropped: 0, kept: 1 });
    expect(await p2).toEqual({ sent: 1, dropped: 0, kept: 0 });
    expect(fake.writes.map((w) => (w.payload as Row).user_habit_id)).toEqual(["h1", "h2"]);
  });

  it("a value changed while its older version is being sent is kept for the next pass", async () => {
    const fake = setup();
    const memory = createMemoryStore<QueueEntry>();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let sent!: () => void;
    const afterSend = new Promise<void>((r) => (sent = r));
    let first = true;
    const gated: KeyValueStore<QueueEntry> = {
      ...memory,
      async deleteIf(key, pred) {
        if (first) {
          first = false;
          sent();
          await gate;
        }
        return memory.deleteIf(key, pred);
      },
    };
    await enqueueLog(item("h1", 1), gated);
    const flushing = flushQueue(fake.db, TODAY, USER, gated);
    await afterSend; // the tick (value 1) has been sent, not yet removed
    await enqueueLog(item("h1", 0), gated); // user un-ticks meanwhile
    release();
    expect(await flushing).toEqual({ sent: 1, dropped: 0, kept: 1 });
    expect(await flushQueue(fake.db, TODAY, USER, gated)).toEqual({ sent: 1, dropped: 0, kept: 0 });
    expect(rowsOf(fake.tables.habit_logs)).toEqual([{ habit: "h1", date: TODAY, value: 0 }]);
  });

  it("does nothing on an empty queue", async () => {
    const fake = setup();
    expect(await flushQueue(fake.db, TODAY, USER, createMemoryStore<QueueEntry>())).toEqual({ sent: 0, dropped: 0, kept: 0 });
    expect(fake.calls).toHaveLength(0);
  });
});

describe("flushQueue on a shared browser (several accounts)", () => {
  const A = "user-a";
  const B = "user-b";

  it("skips (keeps, uncounted) another account's items; they sync when that account signs back in", async () => {
    const store = createMemoryStore<QueueEntry>();
    await enqueueLog(item("a1", 1, TODAY, A), store);
    await enqueueLog(item("a2", 4, TODAY, A), store);
    await enqueueLog(item("b1", 1, TODAY, B), store);

    const asB = setup(B);
    expect(await flushQueue(asB.db, TODAY, B, store)).toEqual({ sent: 1, dropped: 0, kept: 0 });
    expect(asB.writes.map((w) => (w.payload as Row).user_habit_id)).toEqual(["b1"]);
    expect((await listQueued(store, A)).map((q) => q.userHabitId)).toEqual(["a1", "a2"]); // untouched
    expect(await listQueued(store, B)).toEqual([]);

    const asA = setup(A);
    expect(await flushQueue(asA.db, TODAY, A, store)).toEqual({ sent: 2, dropped: 0, kept: 0 });
    expect(await listQueued(store)).toEqual([]);
  });
});

describe("flushQueue across tabs", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("re-reads each entry right before sending and skips it if a concurrent writer replaced it", async () => {
    const fake = setup();
    const memory = createMemoryStore<QueueEntry>();
    let replaceAfterSnapshot = true;
    const racing: KeyValueStore<QueueEntry> = {
      ...memory,
      async entries() {
        const snapshot = await memory.entries();
        if (replaceAfterSnapshot) {
          replaceAfterSnapshot = false;
          await enqueueLog(item("x", 0), memory); // another tab un-ticks X after our snapshot
        }
        return snapshot;
      },
    };
    await enqueueLog(item("x", 1), racing);
    expect(await flushQueue(fake.db, TODAY, USER, racing)).toEqual({ sent: 0, dropped: 0, kept: 1 });
    expect(fake.writes).toHaveLength(0); // the stale X=1 was never sent
    expect(await flushQueue(fake.db, TODAY, USER, racing)).toEqual({ sent: 1, dropped: 0, kept: 0 });
    expect(rowsOf(fake.tables.habit_logs)).toEqual([{ habit: "x", date: TODAY, value: 0 }]);
  });

  it("runs each pass inside the cross-tab lock", async () => {
    const fake = setup();
    const store = createMemoryStore<QueueEntry>();
    await enqueueLog(item("h1"), store);
    const names: string[] = [];
    const lock: LockFn = async (name, run) => {
      names.push(name);
      expect(fake.writes).toHaveLength(0); // nothing is sent before the lock is held
      return run();
    };
    expect(await flushQueue(fake.db, TODAY, USER, store, lock)).toEqual({ sent: 1, dropped: 0, kept: 0 });
    expect(names).toEqual([FLUSH_LOCK_NAME]);
    expect(FLUSH_LOCK_NAME).toBe("lifeathlete-offline-flush");
  });

  it("two tabs flushing the same IndexedDB at once never send an item twice nor a stale value", async () => {
    const fake = setup();
    const shared = createMemoryStore<QueueEntry>();
    const tab1: KeyValueStore<QueueEntry> = { ...shared }; // distinct objects: no shared in-tab guard
    const tab2: KeyValueStore<QueueEntry> = { ...shared };
    let tail: Promise<unknown> = Promise.resolve();
    const mutex: LockFn = (_name, run) => {
      const next = tail.then(run);
      tail = next.catch(() => undefined);
      return next;
    };
    await enqueueLog(item("x", 1), shared);
    await enqueueLog(item("y", 1), shared);
    const [r1, r2] = await Promise.all([
      flushQueue(fake.db, TODAY, USER, tab1, mutex),
      flushQueue(fake.db, TODAY, USER, tab2, mutex),
    ]);
    expect(r1.sent + r2.sent).toBe(2);
    expect(fake.writes).toHaveLength(2);
  });

  it("uses navigator.locks when available", async () => {
    const request = vi.fn((_name: string, run: () => Promise<unknown>) => run());
    vi.stubGlobal("navigator", { locks: { request } });
    const fake = setup();
    const store = createMemoryStore<QueueEntry>();
    await enqueueLog(item("h1"), store);
    expect(await flushQueue(fake.db, TODAY, USER, store)).toMatchObject({ sent: 1 });
    expect(request).toHaveBeenCalledWith(FLUSH_LOCK_NAME, expect.any(Function));
  });

  it("falls back to the in-tab guard without Web Locks", async () => {
    vi.stubGlobal("navigator", {});
    const fake = setup();
    const store = createMemoryStore<QueueEntry>();
    await enqueueLog(item("h1"), store);
    expect(await flushQueue(fake.db, TODAY, USER, store)).toMatchObject({ sent: 1 });
  });
});

describe("isTransientError", () => {
  it.each([
    ["fetch TypeError", new TypeError("Failed to fetch"), true],
    ["no response (status 0)", new DataError("x", "", 0), true],
    ["5xx", new DataError("x", "", 502), true],
    ["429", new DataError("x", "", 429), true],
    ["401 (expired session, refreshed on retry)", new DataError("x", "PGRST301", 401), true],
    ["403 RLS", new DataError("x", "42501", 403), false],
    ["400", new DataError("x", "23514", 400), false],
    ["409", new DataError("x", "23503", 409), false],
    ["validation", new LogValidationError("outside_backfill", "x"), false],
  ])("%s -> %s", (_label, err, transient) => {
    expect(isTransientError(err)).toBe(transient);
  });
});

describe("createIndexedDbStore", () => {
  it("persists, replaces by key, lists and conditionally deletes", async () => {
    const factory = new IDBFactory();
    const store = createIndexedDbStore<QueueEntry>({ factory });
    await enqueueLog(item("h1", 1), store);
    await enqueueLog(item("h1", 0), store);
    await enqueueLog(item("h2", 3), store);

    // a second handle on the same database sees the data (survives a reload)
    const reopened = createIndexedDbStore<QueueEntry>({ factory });
    const queued = await listQueued(reopened);
    expect(queued.map((q) => [q.userHabitId, q.value])).toEqual([
      ["h1", 0],
      ["h2", 3],
    ]);

    await reopened.deleteIf(queueKey("h2", TODAY), () => false);
    expect(await listQueued(store)).toHaveLength(2);
    await reopened.deleteIf(queueKey("h2", TODAY), () => true);
    expect((await listQueued(store)).map((q) => q.userHabitId)).toEqual(["h1"]);
  });

  it("works end to end with flushQueue", async () => {
    const fake = setup();
    const store = createIndexedDbStore<QueueEntry>({ factory: new IDBFactory() });
    await enqueueLog(item("h1", 1), store);
    expect(await flushQueue(fake.db, TODAY, USER, store)).toEqual({ sent: 1, dropped: 0, kept: 0 });
    expect(await listQueued(store)).toEqual([]);
  });
});
