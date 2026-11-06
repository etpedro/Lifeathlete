import { routing } from "@/i18n/routing";
import type { Db } from "@/lib/supabase/types";

export type ProfileLocale = (typeof routing.locales)[number];
export type ProfileErrorCode = "invalid_locale" | "not_found" | "save_failed";

/** Error raised by profile updates. `code` is stable (the UI maps it to localized copy); never backend text. */
export class ProfileError extends Error {
  constructor(
    readonly code: ProfileErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ProfileError";
  }
}

/** Stores the app language (`profiles.locale`) of `userId`; RLS limits the update to the caller. */
export async function setProfileLocale(db: Db, userId: string, locale: ProfileLocale): Promise<void> {
  if (!routing.locales.includes(locale)) throw new ProfileError("invalid_locale", `Unknown locale: ${String(locale)}`);
  const { data, error } = await db.from("profiles").update({ locale }).eq("user_id", userId).select("user_id");
  if (error) throw new ProfileError("save_failed", "Could not save the language", { cause: error });
  if (((data ?? []) as unknown[]).length === 0) throw new ProfileError("not_found", "Profile not found");
}
