export type SupabaseEnv = { url: string; anonKey: string };

export function readSupabaseEnv(url: string | undefined, anonKey: string | undefined): SupabaseEnv {
  const missing = [
    !url?.trim() && "NEXT_PUBLIC_SUPABASE_URL",
    !anonKey?.trim() && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`Supabase is not configured: set ${missing.join(" and ")} (see .env.example).`);
  }
  return { url: url!.trim(), anonKey: anonKey!.trim() };
}

/**
 * Reads the Supabase env vars when a client is created (not at import time).
 * The variables are referenced literally so Next.js inlines them in the browser bundle.
 */
export function getSupabaseEnv(): SupabaseEnv {
  return readSupabaseEnv(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
