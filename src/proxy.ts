import { createServerClient } from "@supabase/ssr";
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { proxyRedirect } from "./lib/auth/access";
import { getSupabaseEnv } from "./lib/supabase/env";

const handleI18nRouting = createMiddleware(routing);

type CookieToSet = { name: string; value: string; options: Parameters<NextResponse["cookies"]["set"]>[2] };

/**
 * 1. Refreshes the Supabase session (@supabase/ssr pattern). Refreshed cookies are
 *    written to the request, so next-intl forwards them to Server Components, and
 *    to whichever response is returned.
 * 2. Signed-out users on protected paths go to /{locale}/login.
 * 3. Otherwise next-intl handles locale routing. Onboarding redirects happen in the
 *    server layouts, not here.
 */
export default async function proxy(request: NextRequest) {
  const { url, anonKey } = getSupabaseEnv();
  const pendingCookies: CookieToSet[] = [];
  const pendingHeaders: Record<string, string> = {};

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        pendingCookies.push(...cookiesToSet);
        Object.assign(pendingHeaders, headers);
      },
    },
  });

  // Do not run code between createServerClient and getClaims (session refresh).
  const { data } = await supabase.auth.getClaims();

  const target = proxyRedirect(request.nextUrl.pathname, Boolean(data?.claims));
  const response = target ? NextResponse.redirect(new URL(target, request.url)) : handleI18nRouting(request);

  pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  Object.entries(pendingHeaders).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}

export const config = {
  matcher: ["/", "/(pt|en)/:path*"],
};
