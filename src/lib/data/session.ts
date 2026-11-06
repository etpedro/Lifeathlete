import type { AccessState } from "@/lib/auth/access";
import { routing } from "@/i18n/routing";
import type { Db } from "@/lib/supabase/types";
import { throwIfError } from "./errors";

/** Whether the caller is signed in and has finished onboarding (`profiles.onboarded_at`), and their stored locale. */
export async function getAccessState(db: Db): Promise<AccessState> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { authenticated: false, onboarded: false, locale: null };

  const { data, error } = await db.from("profiles").select("onboarded_at, locale").eq("user_id", auth.user.id);
  throwIfError(error, "load profile");
  const row = ((data ?? []) as { onboarded_at: string | null; locale?: string | null }[])[0];
  const locale = routing.locales.find((l) => l === row?.locale) ?? null;
  return { authenticated: true, onboarded: Boolean(row?.onboarded_at), locale };
}
