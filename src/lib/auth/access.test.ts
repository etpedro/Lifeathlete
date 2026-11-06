import { describe, expect, it } from "vitest";
import { pageRedirect, proxyRedirect, splitLocale } from "./access";

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
    expect(proxyRedirect("/en", false)).toBe("/en/login");
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
