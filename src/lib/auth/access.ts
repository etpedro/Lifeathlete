// Pure redirect rules for authentication and onboarding. No framework imports, so
// they are unit-tested and shared by the proxy, the server layouts and the pages.
import { routing } from "@/i18n/routing";

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

function isPublic(rest: string): boolean {
  return PUBLIC_PREFIXES.some((p) => rest === p || rest.startsWith(`${p}/`));
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

/** Where the auth callback sends the user after exchanging the code. */
export function callbackRedirect(localeParam: string, ok: boolean): string {
  const locale = routing.locales.find((l) => l === localeParam) ?? routing.defaultLocale;
  return ok ? `/${locale}/today` : `/${locale}/login?error=oauth`;
}
