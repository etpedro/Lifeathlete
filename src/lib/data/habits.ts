import type { Db } from "@/lib/supabase/types";
import type { HabitKind } from "./today";

export const MAX_TITLE_LENGTH = 80;

export type HabitErrorCode = "invalid_title" | "invalid_target" | "invalid_kind" | "not_found" | "save_failed";

/**
 * Error raised by habit management. `code` is stable (the UI maps it to localized copy);
 * messages are technical and never carry backend error text.
 */
export class HabitError extends Error {
  constructor(
    readonly code: HabitErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "HabitError";
  }
}

/** Trimmed title, 1..80 chars, else `invalid_title`. */
export function normalizeTitle(title: unknown): string {
  const trimmed = typeof title === "string" ? title.trim() : "";
  if (trimmed.length === 0 || trimmed.length > MAX_TITLE_LENGTH) {
    throw new HabitError("invalid_title", `Title must be 1-${MAX_TITLE_LENGTH} characters after trimming`);
  }
  return trimmed;
}

export function assertKind(kind: unknown): asserts kind is HabitKind {
  if (kind !== "check" && kind !== "value") throw new HabitError("invalid_kind", `Invalid kind: ${String(kind)}`);
}

/** A value habit's target: a finite number > 0, else `invalid_target`. */
export function assertValueTarget(target: unknown): asserts target is number {
  if (typeof target !== "number" || !Number.isFinite(target) || target <= 0) {
    throw new HabitError("invalid_target", `Target must be a finite number > 0: ${String(target)}`);
  }
}

/** The stored target: 1 for check habits (whatever was passed), the validated target for value habits. */
function storedTarget(kind: HabitKind, target: unknown): number {
  if (kind === "check") return 1;
  assertValueTarget(target);
  return target;
}

function failed(action: string, error: { message: string }): HabitError {
  return new HabitError("save_failed", `Could not ${action}`, { cause: error });
}

/** The non-deleted habit `id` (its kind), or `not_found`. RLS scopes the read to the caller. */
async function findLive(db: Db, id: string): Promise<{ id: string; kind: HabitKind }> {
  const { data, error } = await db.from("user_habits").select("id, kind").eq("id", id).is("deleted_at", null);
  if (error) throw failed("load habit", error);
  const row = ((data ?? []) as { id: string; kind: HabitKind }[])[0];
  if (!row) throw new HabitError("not_found", `Habit not found: ${id}`);
  return row;
}

async function updateLive(db: Db, id: string, patch: Record<string, unknown>, action: string): Promise<void> {
  const { error } = await db.from("user_habits").update(patch).eq("id", id).is("deleted_at", null);
  if (error) throw failed(action, error);
}

/**
 * Pauses (false) or resumes (true) a habit. Only non-deleted habits; unknown or archived
 * -> `not_found`. Logs are untouched. Callers schedule the recalculation.
 */
export async function setHabitActive(db: Db, id: string, active: boolean): Promise<void> {
  await findLive(db, id);
  await updateLive(db, id, { active }, "update habit");
}

/** Changes a value habit's target (> 0). A check habit -> `invalid_target`; unknown/archived -> `not_found`. */
export async function updateHabitTarget(db: Db, id: string, target: number): Promise<void> {
  const habit = await findLive(db, id);
  if (habit.kind !== "value") throw new HabitError("invalid_target", "Only value habits have an editable target");
  assertValueTarget(target);
  await updateLive(db, id, { target }, "update habit target");
}

export type CustomHabitInput = {
  userId: string;
  pillarId: string;
  title: string;
  kind: HabitKind;
  target: number;
};

/** Creates an active habit with no template (`template_id` null). Validates before writing. */
export async function createCustomHabit(db: Db, input: CustomHabitInput): Promise<{ id: string }> {
  const title = normalizeTitle(input.title);
  assertKind(input.kind);
  const target = storedTarget(input.kind, input.target);
  const { data, error } = await db
    .from("user_habits")
    .insert({
      user_id: input.userId,
      pillar_id: input.pillarId,
      template_id: null,
      title,
      kind: input.kind,
      target,
      active: true,
    })
    .select("id")
    .single();
  if (error || !data) throw failed("create habit", error ?? { message: "no row returned" });
  return { id: (data as { id: string }).id };
}

/**
 * Soft delete: `deleted_at` = now and `active` = false. `habit_logs` are never touched, so
 * history and streaks are preserved. Archiving an unknown or already archived habit is
 * `not_found` (not a silent no-op, so the UI can tell the habit is gone).
 */
export async function archiveHabit(db: Db, id: string): Promise<void> {
  await findLive(db, id);
  await updateLive(db, id, { deleted_at: new Date().toISOString(), active: false }, "archive habit");
}

export type ManageableHabit = {
  id: string;
  title: string;
  kind: HabitKind;
  target: number;
  active: boolean;
  fromTemplate: boolean;
};
export type ManageablePillar = { pillarId: string; slug: string; habits: ManageableHabit[] };

type PillarRow = { id: string; slug: string; sort: number };
type HabitRow = {
  id: string;
  pillar_id: string;
  template_id: string | null;
  title: string;
  kind: HabitKind;
  target: number | string | null;
  active: boolean;
  created_at: string;
};

function num(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** All non-deleted habits (active or paused) by pillar in `pillars.sort` order; empty pillars omitted. */
export async function listManageableHabits(db: Db): Promise<ManageablePillar[]> {
  const [pillarsRes, habitsRes] = await Promise.all([
    db.from("pillars").select("id, slug, sort").order("sort"),
    db
      .from("user_habits")
      .select("id, pillar_id, template_id, title, kind, target, active, created_at")
      .is("deleted_at", null)
      .order("created_at"),
  ]);
  if (pillarsRes.error) throw failed("load pillars", pillarsRes.error);
  if (habitsRes.error) throw failed("load habits", habitsRes.error);

  const habits = [...((habitsRes.data ?? []) as HabitRow[])].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
  return [...((pillarsRes.data ?? []) as PillarRow[])]
    .sort((a, b) => a.sort - b.sort)
    .map((p) => ({
      pillarId: p.id,
      slug: p.slug,
      habits: habits
        .filter((h) => h.pillar_id === p.id)
        .map((h) => ({
          id: h.id,
          title: h.title,
          kind: h.kind,
          target: h.kind === "check" ? 1 : num(h.target),
          active: h.active,
          fromTemplate: h.template_id !== null,
        })),
    }))
    .filter((p) => p.habits.length > 0);
}

export type PillarOption = { id: string; slug: string };

/** Every pillar in `sort` order (for the "add habit" pillar select). */
export async function listPillars(db: Db): Promise<PillarOption[]> {
  const { data, error } = await db.from("pillars").select("id, slug, sort").order("sort");
  if (error) throw failed("load pillars", error);
  return [...((data ?? []) as PillarRow[])].sort((a, b) => a.sort - b.sort).map((p) => ({ id: p.id, slug: p.slug }));
}
