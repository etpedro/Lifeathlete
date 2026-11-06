// In-memory stand-in for the parts of the Supabase query builder used by the data layer.
// Test-only: it implements just the calls the data modules make (and fails loudly otherwise).
import type { Db } from "@/lib/supabase/types";

export type Row = Record<string, unknown>;
type Op = "select" | "insert" | "update" | "upsert";
type DbError = { code: string; message: string };
type Response = { data: unknown; error: DbError | null; status: number };
/** A write as the data module sent it (for asserting exact payloads). */
export type Write = { table: string; op: Exclude<Op, "select">; payload: unknown; onConflict?: string };
type Filter = (row: Row) => boolean;

/** Embedded resource in a select string, e.g. `habit_templates_i18n(locale,title)`. */
export type Relation = { table: string; foreignKey: string };
/** Returns true when two rows collide on a unique constraint. */
export type UniqueConstraint = { table: string; collides: (a: Row, b: Row) => boolean };

export type FakeDbOptions = {
  userId: string | null;
  tables: Record<string, Row[]>;
  relations?: Record<string, Relation>;
  unique?: UniqueConstraint[];
  /** Column defaults applied to inserted rows, like SQL `default`. */
  defaults?: Record<string, Row>;
  now?: () => string;
};

export type FakeDb = {
  db: Db;
  tables: Record<string, Row[]>;
  /** The next `op` on `table` fails with `error` (one-shot). */
  failNext(table: string, op: Op, error?: DbError, status?: number): void;
  calls: { table: string; op: Op }[];
  writes: Write[];
};

const EMBED = /([a-z0-9_]+)\(([^)]*)\)/g;

export function createFakeDb(options: FakeDbOptions): FakeDb {
  const tables: Record<string, Row[]> = structuredClone(options.tables);
  const failures: { table: string; op: Op; error: DbError; status: number }[] = [];
  const calls: { table: string; op: Op }[] = [];
  const writes: Write[] = [];
  let seq = 0;

  function takeFailure(table: string, op: Op): { error: DbError; status: number } | null {
    const i = failures.findIndex((f) => f.table === table && f.op === op);
    if (i < 0) return null;
    return failures.splice(i, 1)[0];
  }

  function violates(table: string, candidate: Row, others: Row[]): boolean {
    return (options.unique ?? []).some(
      (u) => u.table === table && others.some((o) => o !== candidate && u.collides(o, candidate)),
    );
  }

  function embed(row: Row, columns: string): Row {
    const out: Row = { ...row };
    for (const [, name] of columns.matchAll(EMBED)) {
      const rel = options.relations?.[name];
      if (!rel) throw new Error(`fake-db: unknown relation ${name}`);
      out[name] = (tables[rel.table] ?? []).filter((r) => r[rel.foreignKey] === row.id).map((r) => ({ ...r }));
    }
    return out;
  }

  class Query implements PromiseLike<Response> {
    private op: Op = "select";
    private filters: Filter[] = [];
    private columns = "*";
    private payload: Row | Row[] = {};
    private conflict: string[] = [];

    constructor(private readonly table: string) {}

    select(columns = "*") {
      this.columns = columns;
      return this;
    }
    insert(rows: Row | Row[]) {
      this.op = "insert";
      this.payload = rows;
      return this;
    }
    upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
      this.op = "upsert";
      this.payload = rows;
      this.conflict = (opts?.onConflict ?? "").split(",").map((c) => c.trim()).filter(Boolean);
      if (this.conflict.length === 0) throw new Error("fake-db: upsert needs onConflict");
      return this;
    }
    update(patch: Row) {
      this.op = "update";
      this.payload = patch;
      return this;
    }
    eq(column: string, value: unknown) {
      this.filters.push((r) => r[column] === value);
      return this;
    }
    in(column: string, values: unknown[]) {
      this.filters.push((r) => values.includes(r[column]));
      return this;
    }
    is(column: string, value: null) {
      this.filters.push((r) => (r[column] ?? null) === value);
      return this;
    }
    order() {
      return this;
    }

    then<T1 = Response, T2 = never>(
      onfulfilled?: ((value: Response) => T1 | PromiseLike<T1>) | null,
      onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
    ): PromiseLike<T1 | T2> {
      return Promise.resolve()
        .then(() => this.run())
        .then(onfulfilled, onrejected);
    }

    private run(): Response {
      calls.push({ table: this.table, op: this.op });
      if (this.op !== "select") {
        writes.push({
          table: this.table,
          op: this.op,
          payload: structuredClone(this.payload),
          ...(this.op === "upsert" ? { onConflict: this.conflict.join(",") } : {}),
        });
      }
      const failure = takeFailure(this.table, this.op);
      if (failure) return { data: null, ...failure };
      return { status: this.op === "select" ? 200 : 201, ...this.exec() };
    }

    private exec(): { data: unknown; error: DbError | null } {
      const rows = (tables[this.table] ??= []);
      const matches = () => rows.filter((r) => this.filters.every((f) => f(r)));

      switch (this.op) {
        case "select":
          return { data: matches().map((r) => embed(r, this.columns)), error: null };
        case "update": {
          for (const r of matches()) Object.assign(r, this.payload);
          return { data: null, error: null };
        }
        case "insert": {
          const incoming = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r) => ({
            id: `fake-${++seq}`,
            created_at: options.now?.() ?? new Date().toISOString(),
            ...options.defaults?.[this.table],
            ...r,
          }));
          const all = [...rows];
          for (const r of incoming) {
            if (violates(this.table, r, all)) {
              return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
            }
            all.push(r);
          }
          rows.push(...incoming); // all-or-nothing, like a single INSERT statement
          return { data: null, error: null };
        }
        case "upsert": {
          for (const r of Array.isArray(this.payload) ? this.payload : [this.payload]) {
            const existing = rows.find((e) => this.conflict.every((c) => e[c] === r[c]));
            if (existing) Object.assign(existing, r);
            else rows.push({ ...options.defaults?.[this.table], ...r });
          }
          return { data: null, error: null };
        }
      }
    }
  }

  const db = {
    from: (table: string) => new Query(table),
    auth: {
      getUser: async () => ({
        data: { user: options.userId ? { id: options.userId } : null },
        error: options.userId ? null : { name: "AuthSessionMissingError", message: "Auth session missing!" },
      }),
    },
  } as unknown as Db;

  return {
    db,
    tables,
    calls,
    writes,
    failNext(table, op, error = { code: "XX000", message: "injected failure" }, status = 400) {
      failures.push({ table, op, error, status });
    },
  };
}
