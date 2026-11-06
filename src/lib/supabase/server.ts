import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./env";
import type { Db } from "./types";

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 * Create one per request. Reading cookies first also opts the caller into dynamic rendering.
 */
export async function createClient(): Promise<Db> {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. The proxy
          // refreshes the session on every request, so this can be ignored.
        }
      },
    },
  });
}
