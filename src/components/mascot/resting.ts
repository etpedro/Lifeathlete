import { dayNumber } from "../../../supabase/functions/_shared/engine/streaks.ts";

/** Days without activity after which the dragonfly rests (controller ruling T). */
export const REST_AFTER_DAYS = 3;

/**
 * Whether the mascot rests: `today` is at least 3 calendar days after `lastActiveDate`.
 * A new user (null), a future date or a malformed date never rest.
 */
export function isResting(lastActiveDate: string | null, today: string): boolean {
  if (lastActiveDate === null) return false;
  try {
    return dayNumber(today) - dayNumber(lastActiveDate) >= REST_AFTER_DAYS;
  } catch {
    return false;
  }
}
