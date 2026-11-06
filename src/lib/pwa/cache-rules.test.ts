import { describe, expect, it } from "vitest";
import { routing } from "@/i18n/routing";
import {
  LOCALES,
  OFFLINE_OPT_IN_HEADER,
  OFFLINE_OPT_IN_VALUE,
  PAGES_MAX_AGE_MS,
  PRECACHE_URLS,
  PWA_START_URL,
  SHELL_CACHE,
  STATIC_CACHE,
  classifyRequest,
  isCacheableResponse,
  isExpired,
  isOfflinePagePath,
  isPwaLaunch,
  offlineFallbackPath,
  pageCacheKey,
  rootHojePaths,
  shouldWipeOnNavigation,
  type ResponseFacts,
} from "./cache-rules";

const ORIGIN = "https://app.lifeathlete.test";
const get = (path: string, over: Partial<Parameters<typeof classifyRequest>[0]> = {}) =>
  classifyRequest({ method: "GET", url: new URL(path, ORIGIN).href, origin: ORIGIN, mode: "no-cors", ...over });
const nav = (path: string, over: Partial<Parameters<typeof classifyRequest>[0]> = {}) =>
  get(path, { mode: "navigate", accept: "text/html", ...over });

describe("classifyRequest", () => {
  it("static build assets, icons, the manifest and the offline pages are 'static'", () => {
    expect(get("/_next/static/chunks/app-123.js")).toBe("static");
    expect(get("/_next/static/css/a.css")).toBe("static");
    expect(get("/icons/icon-192.png")).toBe("static");
    expect(get("/manifest.webmanifest")).toBe("static");
    expect(get("/offline/pt.html")).toBe("static");
  });

  it("same-origin page navigations are 'navigation' (NetworkFirst)", () => {
    expect(nav("/pt/today")).toBe("navigation");
    expect(nav("/en/today")).toBe("navigation");
    expect(nav("/pt/wheel")).toBe("navigation");
    expect(nav("/")).toBe("navigation");
  });

  it.each([
    "/auth/callback",
    "/pt/auth/callback?code=abc",
    "/en/auth/callback",
    "/pt/login",
    "/en/login?error=oauth",
    "/pt/onboarding",
    "/en/onboarding/step",
  ])("never handles the auth/onboarding path %s", (path) => {
    expect(nav(path)).toBe("never");
    expect(get(path)).toBe("never");
  });

  it("never handles non-GET requests", () => {
    expect(nav("/pt/today", { method: "POST" })).toBe("never");
    expect(get("/_next/static/chunks/a.js", { method: "PUT" })).toBe("never");
    expect(get("/_next/static/chunks/a.js", { method: "HEAD" })).toBe("never");
  });

  it("never handles cross-origin requests (Supabase REST/auth/functions, CDNs)", () => {
    expect(get("https://xyz.supabase.co/rest/v1/habits?select=*")).toBe("never");
    expect(get("https://xyz.supabase.co/auth/v1/token")).toBe("never");
    expect(get("https://xyz.supabase.co/functions/v1/weekly-summary")).toBe("never");
    expect(get("https://xyz.supabase.co/_next/static/chunks/a.js")).toBe("never");
    expect(nav("https://evil.test/pt/today")).toBe("never");
  });

  it("never handles RSC/data fetches, the worker itself, or other same-origin requests", () => {
    expect(get("/pt/today?_rsc=abc", { mode: "cors" })).toBe("never");
    expect(get("/pt/today", { mode: "cors" })).toBe("never");
    expect(get("/sw.js")).toBe("never");
    expect(get("/_next/image?url=x")).toBe("never");
    expect(get("/api/anything")).toBe("never");
  });

  it("rejects unparsable URLs", () => {
    expect(classifyRequest({ method: "GET", url: "::nope::", origin: ORIGIN, mode: "navigate" })).toBe("never");
  });
});

describe("isOfflinePagePath", () => {
  it("only the Hoje screen of each locale may be kept for offline", () => {
    expect(isOfflinePagePath("/pt/today")).toBe(true);
    expect(isOfflinePagePath("/en/today")).toBe(true);
    expect(isOfflinePagePath("/en/today/")).toBe(true);
    expect(isOfflinePagePath("/pt/wheel")).toBe(false);
    expect(isOfflinePagePath("/pt/profile")).toBe(false);
    expect(isOfflinePagePath("/fr/today")).toBe(false);
    expect(isOfflinePagePath("/pt/login")).toBe(false);
  });
});

const ok = (over: Partial<ResponseFacts> = {}): ResponseFacts => ({
  status: 200,
  type: "basic",
  redirected: false,
  contentType: "text/html; charset=utf-8",
  cacheControl: "private, no-cache, no-store, max-age=0, must-revalidate",
  hasSetCookie: false,
  offlineOptIn: OFFLINE_OPT_IN_VALUE,
  ...over,
});
const asset = (over: Partial<ResponseFacts> = {}): ResponseFacts =>
  ok({ contentType: "application/javascript", cacheControl: "public, max-age=31536000, immutable", offlineOptIn: null, ...over });

describe("isCacheableResponse", () => {
  it("a 200 HTML page the server opted in for offline is cacheable", () => {
    expect(isCacheableResponse("navigation", ok())).toBe(true);
  });

  it("an HTML page without the server opt-in is not cached (only Hoje is kept)", () => {
    expect(isCacheableResponse("navigation", ok({ offlineOptIn: null }))).toBe(false);
    expect(isCacheableResponse("navigation", ok({ offlineOptIn: "yes please" }))).toBe(false);
  });

  it("navigation responses that are not HTML are not cached", () => {
    expect(isCacheableResponse("navigation", ok({ contentType: "application/json" }))).toBe(false);
    expect(isCacheableResponse("navigation", ok({ contentType: null }))).toBe(false);
  });

  it("static assets with 200 are cacheable; HTML or no-store static responses are not", () => {
    expect(isCacheableResponse("static", asset())).toBe(true);
    expect(isCacheableResponse("static", asset({ contentType: "image/png", cacheControl: null }))).toBe(true);
    expect(isCacheableResponse("static", asset({ contentType: "text/html" }))).toBe(false);
    expect(isCacheableResponse("static", asset({ cacheControl: "no-store" }))).toBe(false);
  });

  it.each([
    ["500", { status: 500 }],
    ["404", { status: 404 }],
    ["206 partial", { status: 206 }],
    ["a followed redirect", { redirected: true }],
    ["an opaque redirect", { type: "opaqueredirect", status: 0 }],
    ["an opaque cross-origin response", { type: "opaque", status: 0 }],
    ["a CORS response", { type: "cors" }],
    ["Set-Cookie (auth change)", { hasSetCookie: true }],
  ] as const)("never caches %s", (_name, over) => {
    expect(isCacheableResponse("navigation", ok(over as Partial<ResponseFacts>))).toBe(false);
    expect(isCacheableResponse("static", asset(over as Partial<ResponseFacts>))).toBe(false);
  });

  it("no-store HTML is only kept with the explicit server opt-in", () => {
    expect(isCacheableResponse("navigation", ok({ cacheControl: "no-store", offlineOptIn: null }))).toBe(false);
    expect(isCacheableResponse("navigation", ok({ cacheControl: "no-store" }))).toBe(true);
  });

  it("'never' requests are never cacheable", () => {
    expect(isCacheableResponse("never", ok())).toBe(false);
    expect(isCacheableResponse("never", asset())).toBe(false);
  });
});

describe("shouldWipeOnNavigation", () => {
  it("wipes the page cache when the session may be changing", () => {
    expect(shouldWipeOnNavigation("/pt/login", null)).toBe(true);
    expect(shouldWipeOnNavigation("/en/auth/callback", null)).toBe(true);
    expect(shouldWipeOnNavigation("/pt/onboarding", null)).toBe(true);
    expect(shouldWipeOnNavigation("/pt/today", { type: "opaqueredirect", redirected: false })).toBe(true);
    expect(shouldWipeOnNavigation("/pt/today", { type: "basic", redirected: true })).toBe(true);
  });
  it("keeps it on ordinary navigations", () => {
    expect(shouldWipeOnNavigation("/pt/today", { type: "basic", redirected: false })).toBe(false);
    expect(shouldWipeOnNavigation("/pt/wheel", null)).toBe(false);
  });
});

describe("isExpired", () => {
  const now = Date.UTC(2026, 10, 6, 12);
  it("entries older than 24h, without a timestamp or from the future are expired", () => {
    expect(isExpired(now - 1000, now)).toBe(false);
    expect(isExpired(now - PAGES_MAX_AGE_MS + 1, now)).toBe(false);
    expect(isExpired(now - PAGES_MAX_AGE_MS - 1, now)).toBe(true);
    expect(isExpired(null, now)).toBe(true);
    expect(isExpired(Number.NaN, now)).toBe(true);
    expect(isExpired(now + 10 * 60_000, now)).toBe(true);
  });
  it("the policy is 24h", () => {
    expect(PAGES_MAX_AGE_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("offlineFallbackPath", () => {
  it("uses the URL locale first, then the browser language, then pt", () => {
    expect(offlineFallbackPath("/en/wheel", "pt-PT")).toBe("/offline/en.html");
    expect(offlineFallbackPath("/pt/wheel", "en-US")).toBe("/offline/pt.html");
    expect(offlineFallbackPath("/", "en-GB")).toBe("/offline/en.html");
    expect(offlineFallbackPath("/", "de-DE")).toBe("/offline/pt.html");
    expect(offlineFallbackPath("/", undefined)).toBe("/offline/pt.html");
  });
});

describe("constants", () => {
  it("locales match the i18n routing and the opt-in header is lowercase", () => {
    expect([...LOCALES]).toEqual([...routing.locales]);
    expect(OFFLINE_OPT_IN_HEADER).toBe(OFFLINE_OPT_IN_HEADER.toLowerCase());
  });
});

describe("precache list", () => {
  it("includes every installability asset and lives in its own never-trimmed cache", () => {
    expect(PRECACHE_URLS).toEqual(
      expect.arrayContaining([
        "/offline/pt.html",
        "/offline/en.html",
        "/manifest.webmanifest",
        "/icons/icon-192.png",
        "/icons/icon-512.png",
        "/icons/icon-maskable-512.png",
        "/icons/apple-touch-icon.png",
      ]),
    );
    expect(SHELL_CACHE).not.toBe(STATIC_CACHE);
  });
});

describe("pageCacheKey", () => {
  it("drops query and hash so a query URL never creates a separate entry", () => {
    expect(pageCacheKey(`${ORIGIN}/pt/today`)).toBe(`${ORIGIN}/pt/today`);
    expect(pageCacheKey(`${ORIGIN}/pt/today?_rsc=abc`)).toBe(`${ORIGIN}/pt/today`);
    expect(pageCacheKey(`${ORIGIN}/pt/today?utm=x#top`)).toBe(`${ORIGIN}/pt/today`);
  });
});

describe("PWA launch URL", () => {
  it("is exactly / with source=pwa", () => {
    expect(PWA_START_URL).toBe("/?source=pwa");
    expect(isPwaLaunch("/", "?source=pwa")).toBe(true);
    expect(isPwaLaunch("/", "?x=1&source=pwa")).toBe(true);
    expect(isPwaLaunch("/", "")).toBe(false);
    expect(isPwaLaunch("/", "?source=web")).toBe(false);
    expect(isPwaLaunch("/pt", "?source=pwa")).toBe(false);
  });
});

describe("rootHojePaths", () => {
  const launch = `${ORIGIN}/?source=pwa`;
  it("uses Accept-Language, then navigator.language, then pt for the PWA launch", () => {
    expect(rootHojePaths(launch, "en-GB,en;q=0.9", "pt-PT")).toEqual(["/en/today", "/pt/today"]);
    expect(rootHojePaths(launch, "de-DE,en;q=0.5", undefined)).toEqual(["/en/today", "/pt/today"]);
    expect(rootHojePaths(launch, null, "en-US")).toEqual(["/en/today", "/pt/today"]);
    expect(rootHojePaths(launch, "de-DE", "fr-FR")).toEqual(["/pt/today", "/en/today"]);
    expect(rootHojePaths(launch, undefined, undefined)).toEqual(["/pt/today", "/en/today"]);
  });
  it("is empty for the landing page (/, /pt, /en) and any other URL", () => {
    for (const p of ["/", "/pt", "/en", "/pt/", "/?source=web", "/pt?source=pwa", "/pt/today", "/pt/wheel", "/fr", "/ptx", "/pt/login", "/offline/pt.html"]) {
      expect(rootHojePaths(`${ORIGIN}${p}`, "pt", "pt"), p).toEqual([]);
    }
    expect(rootHojePaths("not a url", "pt", "pt")).toEqual([]);
  });
});
