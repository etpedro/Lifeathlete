import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";
import type { Db } from "./types";

/** Supabase client for Client Components (session kept in cookies by @supabase/ssr). */
export function createClient(): Db {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
