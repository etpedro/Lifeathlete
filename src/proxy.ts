import { createServerClient } from "@supabase/ssr";
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { PATHNAME_HEADER, proxyRedirect } from "./lib/auth/access";
import { OFFLINE_OPT_IN_HEADER, OFFLINE_OPT_IN_VALUE, isOfflinePagePath } from "./lib/pwa/cache-rules";
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
 * 4. The request path is forwarded to the layouts (stored-locale redirect).
 * 5. The Hoje screen is marked as the only page the service worker may keep for offline use.
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
  // Forwarded to the server layouts (next-intl copies the request headers) so the
  // stored-locale redirect keeps the page; always overwritten, never taken from the client.
  request.headers.set(PATHNAME_HEADER, request.nextUrl.pathname);
  const response = target ? NextResponse.redirect(new URL(target, request.url)) : handleI18nRouting(request);

  pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  Object.entries(pendingHeaders).forEach(([key, value]) => response.headers.set(key, value));
  // Only when the session did not change on this request (no refreshed auth cookies).
  if (!target && pendingCookies.length === 0 && isOfflinePagePath(request.nextUrl.pathname)) {
    response.headers.set(OFFLINE_OPT_IN_HEADER, OFFLINE_OPT_IN_VALUE);
  }
  return response;
}

export const config = {
  matcher: ["/", "/(pt|en)/:path*"],
};
