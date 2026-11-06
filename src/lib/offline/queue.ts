// Persistent offline queue for habit check-ins (spec §6 "Sem rede").
// Items are keyed by habit and day, so the last value wins and replaying is idempotent
// (the server upserts on the same (user_habit_id, date) key).
import { DataError } from "@/lib/data/errors";
import { LogValidationError, logHabit, type LogInput } from "@/lib/data/today";
import type { Db } from "@/lib/supabase/types";

export type QueuedLog = LogInput;
/** A queued log plus its insertion order. */
export type QueueEntry = QueuedLog & { seq: number };
export type FlushResult = { sent: number; dropped: number; kept: number };

/** The small key-value API the queue needs (IndexedDB in the browser, memory in tests). */
export interface KeyValueStore<V> {
  get(key: string): Promise<V | undefined>;
  set(key: string, value: V): Promise<void>;
  /** Atomically deletes `key` when it exists and `shouldDelete(current)` is true. */
  deleteIf(key: string, shouldDelete: (current: V) => boolean): Promise<void>;
  entries(): Promise<[string, V][]>;
}

export const queueKey = (userHabitId: string, date: string) => `${userHabitId}:${date}`;

export function createMemoryStore<V>(): KeyValueStore<V> {
  const map = new Map<string, V>();
  return {
    async get(key) {
      const value = map.get(key);
      return value === undefined ? undefined : structuredClone(value);
    },
    async set(key, value) {
      map.set(key, structuredClone(value));
    },
    async deleteIf(key, shouldDelete) {
      const current = map.get(key);
      if (current !== undefined && shouldDelete(current)) map.delete(key);
    },
    async entries() {
      return [...map.entries()].map(([k, v]) => [k, structuredClone(v)]);
    },
  };
}

const DB_NAME = "lifeathlete";
const STORE_NAME = "offline-logs";

/** IndexedDB-backed store: one object store, out-of-line string keys. */
export function createIndexedDbStore<V>(
  options: { factory?: IDBFactory; dbName?: string; storeName?: string } = {},
): KeyValueStore<V> {
  const { dbName = DB_NAME, storeName = STORE_NAME } = options;
  let opening: Promise<IDBDatabase> | null = null;

  function open(): Promise<IDBDatabase> {
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const factory = options.factory ?? globalThis.indexedDB;
      if (!factory) return reject(new Error("IndexedDB is not available"));
      const req = factory.open(dbName, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(storeName)) req.result.createObjectStore(storeName);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).catch((e: unknown) => {
      opening = null; // allow a later retry
      throw e;
    });
    return opening;
  }

  async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => () => T): Promise<T> {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(storeName, mode);
      const result = run(t.objectStore(storeName));
      t.oncomplete = () => resolve(result());
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error ?? new Error("IndexedDB transaction aborted"));
    });
  }

  return {
    get: (key) =>
      tx("readonly", (s) => {
        const req = s.get(key);
        return () => req.result as V | undefined;
      }),
    set: (key, value) =>
      tx("readwrite", (s) => {
        s.put(value, key);
        return () => undefined;
      }),
    // get + delete inside one readwrite transaction, so a concurrent set cannot slip in between.
    deleteIf: (key, shouldDelete) =>
      tx("readwrite", (s) => {
        const req = s.get(key);
        req.onsuccess = () => {
          if (req.result !== undefined && shouldDelete(req.result as V)) s.delete(key);
        };
        return () => undefined;
      }),
    entries: () =>
      tx("readonly", (s) => {
        const keys = s.getAllKeys();
        const values = s.getAll();
        return () => keys.result.map((k, i) => [String(k), values.result[i] as V] as [string, V]);
      }),
  };
}

let defaultStore: KeyValueStore<QueueEntry> | null = null;
/** The browser's persistent queue (created lazily, client-side only). */
export function defaultQueueStore(): KeyValueStore<QueueEntry> {
  defaultStore ??= createIndexedDbStore<QueueEntry>();
  return defaultStore;
}

let lastSeq = 0;
function nextSeq(): number {
  lastSeq = Math.max(Date.now(), lastSeq + 1);
  return lastSeq;
}

/** Queues a check-in; a later value for the same habit and day replaces the earlier one. */
export async function enqueueLog(item: QueuedLog, store: KeyValueStore<QueueEntry> = defaultQueueStore()): Promise<void> {
  const entry: QueueEntry = {
    userHabitId: item.userHabitId,
    userId: item.userId,
    date: item.date,
    value: item.value,
    ...(item.target === undefined ? {} : { target: item.target }),
    seq: nextSeq(),
  };
  await store.set(queueKey(item.userHabitId, item.date), entry);
}

/** Queued items in insertion order; only `userId`'s when given (the browser may be shared). */
export async function listQueued(
  store: KeyValueStore<QueueEntry> = defaultQueueStore(),
  userId?: string,
): Promise<QueueEntry[]> {
  return (await store.entries())
    .map(([, v]) => v)
    .filter((v) => userId === undefined || v.userId === userId)
    .sort((a, b) => a.seq - b.seq);
}

const RETRY_STATUSES = new Set([0, 401, 408, 429]);

/**
 * Whether a failed send is worth retrying later: network errors (fetch TypeError, no
 * response), 5xx, 429/408, and 401 (an expired session is refreshed before the next try).
 * Validation errors and other 4xx (RLS, constraint) are permanent.
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof LogValidationError) return false;
  if (error instanceof TypeError) return true;
  if (error instanceof DataError) {
    const { status } = error;
    return status === undefined || RETRY_STATUSES.has(status) || status >= 500;
  }
  return true; // unknown: keep the user's data and try again later
}

/** Name of the Web Lock that serializes flush passes across tabs (IndexedDB is shared by them). */
export const FLUSH_LOCK_NAME = "lifeathlete-offline-flush";

/** Runs `run` while holding the lock `name` (the shape of `navigator.locks.request`). */
export type LockFn = <T>(name: string, run: () => Promise<T>) => Promise<T>;

/** Web Locks when the browser has them; otherwise only the in-tab chain guards the passes. */
const defaultLock: LockFn = (name, run) => {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  return locks ? locks.request(name, run) : run();
};

/** Per store: the end of the pass chain, and a pass that is queued but not started yet. */
type FlushSlot = { tail: Promise<unknown>; waiting: Promise<FlushResult> | null };
const slots = new WeakMap<KeyValueStore<QueueEntry>, FlushSlot>();

/**
 * Replays `userId`'s queued items in insertion order through logHabit. Items of other
 * accounts (shared browser) are skipped: kept and not counted. Success removes the item;
 * a transient failure keeps it and ends the pass; a permanent failure drops it and counts
 * it in `dropped` so the UI can tell the user.
 *
 * No double send, no stale value: within a tab, calls made before a pass starts share it
 * and calls made while it runs share ONE follow-up pass; across tabs, each pass holds the
 * FLUSH_LOCK_NAME Web Lock; and each entry is re-read right before sending and skipped
 * if it was replaced since the snapshot (its newer value goes in a later pass). An item
 * is only removed if it was not replaced while being sent.
 */
export function flushQueue(
  db: Db,
  today: string,
  userId: string,
  store: KeyValueStore<QueueEntry> = defaultQueueStore(),
  lock: LockFn = defaultLock,
): Promise<FlushResult> {
  let slot = slots.get(store);
  if (!slot) slots.set(store, (slot = { tail: Promise.resolve(), waiting: null }));
  if (slot.waiting) return slot.waiting;
  const s = slot;
  const pass = s.tail.then(() => {
    s.waiting = null; // started: later calls queue the next pass
    return lock(FLUSH_LOCK_NAME, () => runFlush(db, today, userId, store));
  });
  s.waiting = pass;
  s.tail = pass.catch(() => undefined);
  return pass;
}

async function runFlush(db: Db, today: string, userId: string, store: KeyValueStore<QueueEntry>): Promise<FlushResult> {
  const items = await listQueued(store, userId);
  if (items.length === 0) return { sent: 0, dropped: 0, kept: 0 };
  let sent = 0;
  let dropped = 0;
  for (const entry of items) {
    const key = queueKey(entry.userHabitId, entry.date);
    const sameEntry = (current: QueueEntry) => current.seq === entry.seq;
    const current = await store.get(key);
    if (!current || !sameEntry(current)) continue; // replaced or sent by another tab since the snapshot
    try {
      await logHabit(db, entry, today);
      sent += 1;
    } catch (error) {
      if (isTransientError(error)) break;
      dropped += 1;
    }
    await store.deleteIf(key, sameEntry);
  }
  const kept = (await listQueued(store, userId)).length;
  return { sent, dropped, kept };
}
