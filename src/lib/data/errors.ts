import type { Db } from "@/lib/supabase/types";

/** Error raised by the data layer. Messages are technical; the UI shows a localized text. */
export class DataError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    /** HTTP status of the failed request when known (0 = the request never got a response). */
    readonly status?: number,
  ) {
    super(message);
    this.name = "DataError";
  }
}

export function throwIfError(
  error: { message: string; code?: string } | null | undefined,
  action: string,
  status?: number,
): void {
  if (error) throw new DataError(`Could not ${action}: ${error.message}`, error.code, status);
}

/** The signed-in user's id; throws when there is no session. */
export async function requireUserId(db: Db): Promise<string> {
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new DataError("Not signed in");
  return data.user.id;
}
