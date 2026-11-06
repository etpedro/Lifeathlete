import { describe, expect, it } from "vitest";
import { callbackRedirect, launchRedirect, localeRedirect, pageRedirect, preferredLocale, proxyRedirect, splitLocale } from "./access";

describe("splitLocale", () => {
  it.each([
    ["/pt/today", { locale: "pt", rest: "/today" }],
    ["/en", { locale: "en", rest: "/" }],
    ["/en/", { locale: "en", rest: "/" }],
    ["/pt/auth/callback", { locale: "pt", rest: "/auth/callback" }],
    ["/", null],
    ["/fr/today", null],
    ["/ptx/today", null],
  ])("%s", (pathname, expected) => {
    expect(splitLocale(pathname)).toEqual(expected);
  });
});

describe("proxyRedirect", () => {
  it("sends unauthenticated users on protected routes to the login page of the same locale", () => {
    expect(proxyRedirect("/pt/today", false)).toBe("/pt/login");
    expect(proxyRedirect("/en/onboarding", false)).toBe("/en/login");
    expect(proxyRedirect("/pt/wheel", false)).toBe("/pt/login");
    expect(proxyRedirect("/en/achievements", false)).toBe("/en/login");
    expect(proxyRedirect("/pt/profile/habits", false)).toBe("/pt/login");
  });

  it("lets unauthenticated users stay on the landing page /{locale}", () => {
    for (const path of ["/pt", "/en", "/pt/", "/en/"]) expect(proxyRedirect(path, false), path).toBeNull();
    expect(proxyRedirect("/pt", true)).toBeNull();
  });

  it("lets unauthenticated users reach login and the auth callback", () => {
    expect(proxyRedirect("/pt/login", false)).toBeNull();
    expect(proxyRedirect("/en/login/", false)).toBeNull();
    expect(proxyRedirect("/pt/auth/callback", false)).toBeNull();
  });

  it("does not treat look-alike paths as public", () => {
    expect(proxyRedirect("/pt/loginx", false)).toBe("/pt/login");
    expect(proxyRedirect("/pt/authx", false)).toBe("/pt/login");
  });

  it("never redirects authenticated users (the server layouts handle onboarding)", () => {
    expect(proxyRedirect("/pt/today", true)).toBeNull();
    expect(proxyRedirect("/pt/login", true)).toBeNull();
  });

  it("leaves paths without a locale to the i18n routing", () => {
    expect(proxyRedirect("/", false)).toBeNull();
    expect(proxyRedirect("/today", false)).toBeNull();
  });
});

describe("preferredLocale", () => {
  it("uses the NEXT_LOCALE cookie first", () => {
    expect(preferredLocale("en", "pt-PT")).toBe("en");
    expect(preferredLocale("pt", "en-US")).toBe("pt");
  });
  it("then Accept-Language by quality, ignoring unsupported tags", () => {
    expect(preferredLocale(undefined, "en-GB,en;q=0.9")).toBe("en");
    expect(preferredLocale(null, "de-DE,en;q=0.5,pt;q=0.8")).toBe("pt");
    expect(preferredLocale("fr", "fr-FR,en;q=0.4")).toBe("en");
    expect(preferredLocale(undefined, "pt;q=0,en;q=0.1")).toBe("en");
  });
  it("defaults to pt", () => {
    expect(preferredLocale(undefined, undefined)).toBe("pt");
    expect(preferredLocale(undefined, "de-DE,fr;q=0.9")).toBe("pt");
    expect(preferredLocale("", "")).toBe("pt");
  });
});

describe("launchRedirect (installed app start_url)", () => {
  it("sends /?source=pwa to Today in the preferred locale", () => {
    expect(launchRedirect("/", "?source=pwa", undefined, undefined)).toBe("/pt/today");
    expect(launchRedirect("/", "?source=pwa", undefined, "en-US,en;q=0.9")).toBe("/en/today");
    expect(launchRedirect("/", "?source=pwa", "en", "pt-PT")).toBe("/en/today");
    expect(launchRedirect("/", "?utm=x&source=pwa", "pt", "en")).toBe("/pt/today");
  });
  it("leaves a plain / (the landing), other sources and other paths alone", () => {
    expect(launchRedirect("/", "", undefined, "en")).toBeNull();
    expect(launchRedirect("/", "?source=web", undefined, "en")).toBeNull();
    expect(launchRedirect("/pt", "?source=pwa", undefined, "en")).toBeNull();
    expect(launchRedirect("/pt/today", "?source=pwa", undefined, "en")).toBeNull();
  });
});

describe("pageRedirect", () => {
  const anon = { authenticated: false, onboarded: false };
  const fresh = { authenticated: true, onboarded: false };
  const done = { authenticated: true, onboarded: true };

  it("app area: login when signed out, onboarding when not onboarded, else stay", () => {
    expect(pageRedirect("app", "pt", anon)).toBe("/pt/login");
    expect(pageRedirect("app", "en", fresh)).toBe("/en/onboarding");
    expect(pageRedirect("app", "pt", done)).toBeNull();
  });

  it("onboarding: login when signed out, today when already onboarded", () => {
    expect(pageRedirect("onboarding", "en", anon)).toBe("/en/login");
    expect(pageRedirect("onboarding", "pt", fresh)).toBeNull();
    expect(pageRedirect("onboarding", "pt", done)).toBe("/pt/today");
  });

  it("login: stay when signed out, onboarding or today when signed in", () => {
    expect(pageRedirect("login", "pt", anon)).toBeNull();
    expect(pageRedirect("login", "en", fresh)).toBe("/en/onboarding");
    expect(pageRedirect("login", "en", done)).toBe("/en/today");
  });
});

describe("stored locale (profiles.locale) after sign-in", () => {
  const en = { authenticated: true, onboarded: true, locale: "en" as const };
  const pt = { authenticated: true, onboarded: true, locale: "pt" as const };

  it("app area on another locale goes to the same page in the stored locale", () => {
    expect(pageRedirect("app", "pt", en, "/pt/profile/habits")).toBe("/en/profile/habits");
    expect(pageRedirect("app", "pt", en, "/pt/today")).toBe("/en/today");
    expect(pageRedirect("app", "pt", en)).toBe("/en/today"); // path unknown
  });

  it("never redirects when the URL already has the stored locale (no loop) or none is stored", () => {
    expect(pageRedirect("app", "en", en, "/en/today")).toBeNull();
    expect(pageRedirect("app", "pt", { authenticated: true, onboarded: true, locale: null }, "/pt/today")).toBeNull();
    expect(pageRedirect("app", "pt", { authenticated: true, onboarded: true }, "/pt/today")).toBeNull();
  });

  it("signed-in landing on login or onboarding goes to Today in the stored locale", () => {
    expect(pageRedirect("login", "pt", en)).toBe("/en/today");
    expect(pageRedirect("onboarding", "en", pt)).toBe("/pt/today");
  });

  it("onboarding is never moved to the stored locale while not onboarded (the user picks it there)", () => {
    expect(pageRedirect("onboarding", "en", { authenticated: true, onboarded: false, locale: "pt" })).toBeNull();
  });

  it("localeRedirect ignores a path from another locale or an unsafe path", () => {
    expect(localeRedirect("/en/profile", "pt", "en")).toBe("/en/today");
    expect(localeRedirect("/pt//evil.example", "pt", "en")).toBe("/en/today");
    expect(localeRedirect("/pt", "pt", "en")).toBe("/en/today");
    expect(localeRedirect(null, "pt", "en")).toBe("/en/today");
    expect(localeRedirect("/pt/wheel", "pt", "pt")).toBeNull();
  });
});

describe("callbackRedirect", () => {
  it("goes to Today on success (the app layout bounces to onboarding if needed)", () => {
    expect(callbackRedirect("en", true)).toBe("/en/today");
  });
  it("goes back to login with an error flag on failure", () => {
    expect(callbackRedirect("pt", false)).toBe("/pt/login?error=oauth");
  });
  it("falls back to the default locale for an unknown one", () => {
    expect(callbackRedirect("fr", true)).toBe("/pt/today");
  });
});
