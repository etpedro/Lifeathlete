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
  set(key: string, value: V): Promise<void>;
  /** Atomically deletes `key` when it exists and `shouldDelete(current)` is true. */
  deleteIf(key: string, shouldDelete: (current: V) => boolean): Promise<void>;
  entries(): Promise<[string, V][]>;
}

export const queueKey = (userHabitId: string, date: string) => `${userHabitId}:${date}`;

export function createMemoryStore<V>(): KeyValueStore<V> {
  const map = new Map<string, V>();
  return {
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
    seq: nextSeq(),
  };
  await store.set(queueKey(item.userHabitId, item.date), entry);
}

/** Queued items in insertion order. */
export async function listQueued(store: KeyValueStore<QueueEntry> = defaultQueueStore()): Promise<QueueEntry[]> {
  return (await store.entries()).map(([, v]) => v).sort((a, b) => a.seq - b.seq);
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

/** Per store: the end of the pass chain, and a pass that is queued but not started yet. */
type FlushSlot = { tail: Promise<unknown>; waiting: Promise<FlushResult> | null };
const slots = new WeakMap<KeyValueStore<QueueEntry>, FlushSlot>();

/**
 * Replays the queue in insertion order through logHabit. Success removes the item;
 * a transient failure keeps it and ends the pass; a permanent failure drops it and
 * counts it in `dropped` so the UI can tell the user. An item is only removed if it
 * was not replaced while being sent.
 *
 * Passes never overlap (no double send): calls made before a pass starts share it,
 * and calls made while a pass runs share ONE follow-up pass, so an item queued
 * during a pass is not left behind.
 */
export function flushQueue(
  db: Db,
  today: string,
  store: KeyValueStore<QueueEntry> = defaultQueueStore(),
): Promise<FlushResult> {
  let slot = slots.get(store);
  if (!slot) slots.set(store, (slot = { tail: Promise.resolve(), waiting: null }));
  if (slot.waiting) return slot.waiting;
  const s = slot;
  const pass = s.tail.then(() => {
    s.waiting = null; // started: later calls queue the next pass
    return runFlush(db, today, store);
  });
  s.waiting = pass;
  s.tail = pass.catch(() => undefined);
  return pass;
}

async function runFlush(db: Db, today: string, store: KeyValueStore<QueueEntry>): Promise<FlushResult> {
  const items = await listQueued(store);
  if (items.length === 0) return { sent: 0, dropped: 0, kept: 0 };
  let sent = 0;
  let dropped = 0;
  for (const entry of items) {
    const sameEntry = (current: QueueEntry) => current.seq === entry.seq;
    try {
      await logHabit(db, entry, today);
      sent += 1;
    } catch (error) {
      if (isTransientError(error)) break;
      dropped += 1;
    }
    await store.deleteIf(queueKey(entry.userHabitId, entry.date), sameEntry);
  }
  const kept = (await store.entries()).length;
  return { sent, dropped, kept };
}
