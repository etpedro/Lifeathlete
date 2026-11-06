import { HabitError, MAX_TITLE_LENGTH } from "@/lib/data/habits";
import type { HabitKind } from "@/lib/data/today";

/** Keys inside the `profile` message namespace. */
export type ProfileErrorKey =
  | "errors.invalidTitle"
  | "errors.invalidTarget"
  | "errors.invalidKind"
  | "errors.notFound"
  | "errors.pillarRequired"
  | "errors.save";

const CODE_KEYS = {
  invalid_title: "errors.invalidTitle",
  invalid_target: "errors.invalidTarget",
  invalid_kind: "errors.invalidKind",
  not_found: "errors.notFound",
  save_failed: "errors.save",
} as const satisfies Record<HabitError["code"], ProfileErrorKey>;

/** Localized-message key for any error thrown by a habit mutation. */
export function habitErrorMessageKey(error: unknown): ProfileErrorKey {
  return error instanceof HabitError ? CODE_KEYS[error.code] : "errors.save";
}

/** Parses a target typed by the user ("0,5" and "0.5" both work); NaN when it is not a finite number. */
export function parseTargetInput(text: string): number {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return Number.NaN;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : Number.NaN;
}

export type HabitFormInput = { pillarId: string; title: string; kind: HabitKind; targetText: string };
export type HabitFormErrors = { pillar?: ProfileErrorKey; title?: ProfileErrorKey; target?: ProfileErrorKey };
export type HabitFormResult =
  | { ok: true; value: { pillarId: string; title: string; kind: HabitKind; target: number } }
  | { ok: false; errors: HabitFormErrors };

/** Client-side mirror of the data layer's rules, so the form can show inline errors before sending. */
export function validateHabitForm(input: HabitFormInput): HabitFormResult {
  const errors: HabitFormErrors = {};
  const title = input.title.trim();
  if (!input.pillarId) errors.pillar = "errors.pillarRequired";
  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) errors.title = "errors.invalidTitle";
  const parsed = parseTargetInput(input.targetText);
  if (input.kind === "value" && !(parsed > 0)) errors.target = "errors.invalidTarget";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { pillarId: input.pillarId, title, kind: input.kind, target: input.kind === "check" ? 1 : parsed },
  };
}
