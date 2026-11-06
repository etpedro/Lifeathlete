// Pure caching rules for the service worker (spec §2 "PWA", shared-device privacy).
// No imports: scripts/build-pwa.mjs inlines this module into public/sw.js, and a test
// guards the generated file against drift.
//
// Privacy model:
// - Only static assets (/_next/static, icons, manifest, offline pages) are cached cache-first.
// - Page navigations are NetworkFirst. Only the Hoje screen is ever stored, and only when the
//   server opted in with OFFLINE_OPT_IN_HEADER. Stored pages expire after 24h, at most 10 are
//   kept, and they are wiped on sign-out and whenever the session may be changing (login,
//   auth callback, onboarding, or a redirect away from an app page).
// - Non-GET, cross-origin (Supabase), auth/login/onboarding, RSC/data fetches, redirects,
//   errors and Set-Cookie responses are never cached.

export const CACHE_PREFIX = "lifeathlete-";
export const STATIC_CACHE = "lifeathlete-static-v1";
/** User pages (HTML). Wiped by clearUserCaches() on sign-out. */
export const PAGES_CACHE = "lifeathlete-pages-v1";
export const PAGES_MAX_ENTRIES = 10;
export const PAGES_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const STATIC_MAX_ENTRIES = 120;
export const NETWORK_TIMEOUT_MS = 3000;
/** Header the worker adds to stored pages with the time they were stored (ms). */
export const CACHED_AT_HEADER = "x-sw-cached-at";
/** Header set by the proxy on pages that may be kept for offline use (see isOfflinePagePath). */
export const OFFLINE_OPT_IN_HEADER = "x-lifeathlete-offline";
export const OFFLINE_OPT_IN_VALUE = "page";
export const CLEAR_USER_CACHES_MESSAGE = "CLEAR_USER_CACHES";
export const WARM_MESSAGE = "WARM";

export const LOCALES = ["pt", "en"] as const;
const DEFAULT_LOCALE = "pt";

export const OFFLINE_PAGES = LOCALES.map((l) => `/offline/${l}.html`);
export const PRECACHE_URLS = [
  ...OFFLINE_PAGES,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

export type RequestKind = "static" | "navigation" | "never";

export type RequestFacts = {
  method: string;
  url: string;
  /** The worker's own origin. */
  origin: string;
  /** Request.mode: "navigate" for page loads. */
  mode: string;
  accept?: string | null;
};

export type ResponseFacts = {
  status: number;
  /** Response.type: "basic" for same-origin, "opaqueredirect" for manual redirects. */
  type: string;
  redirected: boolean;
  contentType: string | null;
  cacheControl: string | null;
  hasSetCookie: boolean;
  /** Value of OFFLINE_OPT_IN_HEADER, if any. */
  offlineOptIn: string | null;
};

function localeOf(pathname: string): string | null {
  const first = pathname.split("/")[1] ?? "";
  return (LOCALES as readonly string[]).indexOf(first) >= 0 ? first : null;
}

/** Paths whose responses are never handled: auth flows, login and onboarding. */
export function isNeverCachedPath(pathname: string): boolean {
  const locale = localeOf(pathname);
  const rest = locale ? pathname.slice(locale.length + 1) || "/" : pathname;
  const under = (prefix: string) => rest === prefix || rest.indexOf(`${prefix}/`) === 0;
  if (under("/auth")) return true;
  return locale !== null && (under("/login") || under("/onboarding"));
}

/** The only pages that may be stored for offline use: the Hoje screen of each locale. */
export function isOfflinePagePath(pathname: string): boolean {
  const locale = localeOf(pathname);
  if (!locale) return false;
  const rest = pathname.slice(locale.length + 1).replace(/\/+$/, "");
  return rest === "/today";
}

function isStaticPath(pathname: string): boolean {
  return (
    pathname.indexOf("/_next/static/") === 0 ||
    pathname.indexOf("/icons/") === 0 ||
    pathname === "/manifest.webmanifest" ||
    OFFLINE_PAGES.indexOf(pathname) >= 0
  );
}

export function classifyRequest(req: RequestFacts): RequestKind {
  if (req.method.toUpperCase() !== "GET") return "never";
  let url: URL;
  try {
    url = new URL(req.url);
  } catch {
    return "never";
  }
  if (url.origin !== req.origin) return "never";
  if (isNeverCachedPath(url.pathname)) return "never";
  if (req.mode === "navigate") return "navigation";
  if (isStaticPath(url.pathname)) return "static";
  return "never";
}

export function isCacheableResponse(kind: RequestKind, res: ResponseFacts): boolean {
  if (kind === "never") return false;
  if (res.status !== 200 || res.type !== "basic" || res.redirected || res.hasSetCookie) return false;
  const contentType = (res.contentType ?? "").toLowerCase();
  const noStore = /(^|[\s,])no-store($|[\s,;])/i.test(res.cacheControl ?? "");
  if (kind === "static") return !noStore && contentType.indexOf("text/html") !== 0;
  // Navigation: Next marks dynamic pages no-store for HTTP caches. The worker keeps an HTML
  // page only when the app's own proxy explicitly opted it in (Hoje only).
  return contentType.indexOf("text/html") === 0 && res.offlineOptIn === OFFLINE_OPT_IN_VALUE;
}

/**
 * Whether a navigation means the signed-in user may be changing, so stored pages are wiped:
 * any login/auth/onboarding navigation, or a page that answered with a redirect.
 */
export function shouldWipeOnNavigation(
  pathname: string,
  response: { type: string; redirected: boolean } | null,
): boolean {
  if (isNeverCachedPath(pathname)) return true;
  return response !== null && (response.type === "opaqueredirect" || response.redirected);
}

/** Stored pages older than 24h (or with a missing/future timestamp) are not served. */
export function isExpired(cachedAt: number | null, now: number): boolean {
  if (cachedAt === null || !Number.isFinite(cachedAt)) return true;
  const age = now - cachedAt;
  return age > PAGES_MAX_AGE_MS || age < -60_000;
}

/** The localized offline page: URL locale first, then the browser language, then pt. */
export function offlineFallbackPath(pathname: string, language: string | undefined): string {
  const fromUrl = localeOf(pathname);
  const fromLanguage = (language ?? "").toLowerCase().split("-")[0];
  const locale = fromUrl ?? ((LOCALES as readonly string[]).indexOf(fromLanguage) >= 0 ? fromLanguage : DEFAULT_LOCALE);
  return `/offline/${locale}.html`;
}
