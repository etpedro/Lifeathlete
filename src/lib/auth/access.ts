// Pure redirect rules for authentication and onboarding. No framework imports, so
// they are unit-tested and shared by the proxy, the server layouts and the pages.
import { routing } from "@/i18n/routing";
import { isPwaLaunch } from "@/lib/pwa/cache-rules";
import { RESET_NEXT } from "./password-reset";

export type Locale = (typeof routing.locales)[number];

/** Request header set by the proxy with the request path (read by the server guard). */
export const PATHNAME_HEADER = "x-lifeathlete-pathname";

/** Paths (after the locale) reachable without a session. */
const PUBLIC_PREFIXES = ["/login", "/auth"];

export function splitLocale(pathname: string): { locale: Locale; rest: string } | null {
  const match = /^\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!match) return null;
  const locale = routing.locales.find((l) => l === match[1]);
  if (!locale) return null;
  const rest = (match[2] ?? "/").replace(/\/+$/, "") || "/";
  return { locale, rest };
}

/** `/{locale}` itself is the public landing page; login and the auth flows are public too. */
function isPublic(rest: string): boolean {
  return rest === "/" || PUBLIC_PREFIXES.some((p) => rest === p || rest.startsWith(`${p}/`));
}

/**
 * Proxy rule: a signed-out user on a protected localized path goes to that locale's
 * login page. Returns the redirect path, or null to let the request through.
 */
export function proxyRedirect(pathname: string, authenticated: boolean): string | null {
  if (authenticated) return null;
  const parts = splitLocale(pathname);
  if (!parts || isPublic(parts.rest)) return null;
  return `/${parts.locale}/login`;
}

/** next-intl's locale cookie (routing.localeCookie is not customized). */
export const LOCALE_COOKIE = "NEXT_LOCALE";

/**
 * The preferred supported locale: the NEXT_LOCALE cookie (written by next-intl when a
 * localized page is visited), then the Accept-Language header by quality, then the
 * default. A simplified version of next-intl's own detection (its matcher is internal).
 */
export function preferredLocale(cookieLocale: string | null | undefined, acceptLanguage: string | null | undefined): Locale {
  const fromCookie = routing.locales.find((l) => l === cookieLocale);
  if (fromCookie) return fromCookie;
  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => /^\s*q=([\d.]+)\s*$/.exec(p)).find(Boolean);
      return { base: tag.trim().toLowerCase().split("-")[0], q: q ? Number(q[1]) : 1, index };
    })
    .filter((x) => x.base && Number.isFinite(x.q) && x.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { base } of ranked) {
    const match = routing.locales.find((l) => l === base);
    if (match) return match;
  }
  return routing.defaultLocale;
}

/**
 * Proxy rule for the installed app: the manifest start_url ("/?source=pwa") opens Today in
 * the preferred locale instead of the landing page (the guards then send signed-out users
 * to login). Any other request (including a plain "/") returns null.
 */
export function launchRedirect(
  pathname: string,
  search: string,
  cookieLocale: string | null | undefined,
  acceptLanguage: string | null | undefined,
): string | null {
  if (!isPwaLaunch(pathname, search)) return null;
  return `/${preferredLocale(cookieLocale, acceptLanguage)}/today`;
}

export type Area = "app" | "onboarding" | "login";
export type AccessState = {
  authenticated: boolean;
  onboarded: boolean;
  /** profiles.locale, the language chosen in onboarding or on Perfil (null: none/unknown). */
  locale?: Locale | null;
};

/**
 * Where a signed-in, onboarded user on `urlLocale` belongs when their stored locale
 * differs: the same page (from `pathname`, when it is a safe path of `urlLocale`) in the
 * stored locale, else its Today. Null when nothing is stored or the locales match (no loop).
 */
export function localeRedirect(pathname: string | null, urlLocale: Locale, stored: Locale | null | undefined): string | null {
  if (!stored || stored === urlLocale) return null;
  const parts = pathname ? splitLocale(pathname) : null;
  const safe = parts && parts.locale === urlLocale && parts.rest !== "/" && !parts.rest.startsWith("//");
  return `/${stored}${safe ? parts.rest : "/today"}`;
}

/**
 * Server-side rule for each area of the app. Returns the redirect path or null. Onboarded
 * users land in their stored locale (`pathname`, when known, keeps the page in the app area).
 */
export function pageRedirect(area: Area, locale: Locale, state: AccessState, pathname: string | null = null): string | null {
  const to = (path: string) => `/${locale}${path}`;
  if (!state.authenticated) return area === "login" ? null : to("/login");
  if (!state.onboarded) return area === "onboarding" ? null : to("/onboarding");
  if (area === "app") return localeRedirect(pathname, locale, state.locale);
  return `/${state.locale ?? locale}/today`;
}

/**
 * Where the auth callback sends the user after exchanging the code. A password-reset link
 * (`next` = RESET_NEXT) goes to the set-new-password page, or back to request a new link.
 * Any other `next` is ignored (no open redirect).
 */
export function callbackRedirect(localeParam: string, ok: boolean, next: string | null = null): string {
  const locale = routing.locales.find((l) => l === localeParam) ?? routing.defaultLocale;
  if (next === RESET_NEXT) return ok ? `/${locale}/auth/reset-password` : `/${locale}/auth/forgot-password?error=expired`;
  return ok ? `/${locale}/today` : `/${locale}/login?error=oauth`;
}
