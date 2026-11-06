import type { AccessState } from "@/lib/auth/access";
import type { Db } from "@/lib/supabase/types";
import { throwIfError } from "./errors";

/** Whether the caller is signed in and has finished onboarding (`profiles.onboarded_at`). */
export async function getAccessState(db: Db): Promise<AccessState> {
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { authenticated: false, onboarded: false };

  const { data, error } = await db.from("profiles").select("onboarded_at").eq("user_id", auth.user.id);
  throwIfError(error, "load profile");
  const row = ((data ?? []) as { onboarded_at: string | null }[])[0];
  return { authenticated: true, onboarded: Boolean(row?.onboarded_at) };
}
