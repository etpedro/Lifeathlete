// PWA behavior against a production build (run with `npm run test:e2e:pwa`, see
// playwright.pwa.config.ts). Service workers only exist in `next build && next start`.
import { expect, test, type Page } from "@playwright/test";
import en from "../src/messages/en.json";
import pt from "../src/messages/pt.json";
import { BACKGROUND_COLOR, THEME_COLOR, THEME_COLOR_LIGHT } from "../src/app/manifest";
import { PAGES_CACHE, PRECACHE_URLS, SHELL_CACHE } from "../src/lib/pwa/cache-rules";
import { signUpAndOnboard } from "./helpers";

/** Waits until the service worker is activated and controls this page. */
async function waitForControllingWorker(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready); // `ready` resolves while still "activating"
  await page.waitForFunction(async () => (await navigator.serviceWorker.ready).active?.state === "activated");
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

const cachedPaths = (page: Page, name: string) =>
  page.evaluate(async (cacheName) => {
    if (!(await caches.has(cacheName))) return [];
    const keys = await (await caches.open(cacheName)).keys();
    return keys.map((r) => new URL(r.url).pathname + new URL(r.url).search);
  }, name);

test("(a) the web app manifest is reachable, valid and linked", async ({ page, request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/manifest+json");
  const manifest = await res.json();
  expect(manifest).toMatchObject({ name: "Lifeathlete", start_url: "/?source=pwa", scope: "/", display: "standalone", lang: "pt", id: "/" });
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
  for (const icon of manifest.icons as { src: string }[]) {
    const iconRes = await request.get(icon.src);
    expect(iconRes.status(), icon.src).toBe(200);
    expect(iconRes.headers()["content-type"]).toBe("image/png");
  }

  await page.goto("/pt/login");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/icons/apple-touch-icon.png");
  // Dark by default, with a light entry for systems in light mode (src/styles/tokens.css).
  await expect(page.locator('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]')).toHaveAttribute("content", THEME_COLOR);
  await expect(page.locator('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')).toHaveAttribute("content", THEME_COLOR_LIGHT);
  expect(manifest).toMatchObject({ theme_color: THEME_COLOR, background_color: BACKGROUND_COLOR });
});

test("(b) after a first visit to /pt/login the service worker activates and precaches the shell", async ({ page }) => {
  await page.goto("/pt/login");
  await waitForControllingWorker(page);
  const scriptUrl = await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.scriptURL);
  expect(new URL(scriptUrl!).pathname).toBe("/sw.js");
  const shell = await cachedPaths(page, SHELL_CACHE);
  expect(shell.sort()).toEqual([...PRECACHE_URLS].sort());
  // The login page itself is never stored.
  expect(await cachedPaths(page, PAGES_CACHE)).toEqual([]);
});

test("(c) offline, an uncached page shows the localized offline page instead of a browser error", async ({ page, context }) => {
  await page.goto("/pt/login");
  await waitForControllingWorker(page);

  await context.setOffline(true);
  await page.goto("/pt/wheel");
  await expect(page.getByRole("heading", { level: 1, name: pt.offline.heading })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "pt");
  await expect(page.getByRole("link", { name: pt.offline.retry })).toHaveAttribute("href", "/pt/today");

  await page.goto("/en/achievements");
  await expect(page.getByRole("heading", { level: 1, name: en.offline.heading })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  // Login was visited online but is never cached: offline it also gets the offline page.
  await page.goto("/pt/login");
  await expect(page.getByRole("heading", { level: 1, name: pt.offline.heading })).toBeVisible();

  // The landing page is never stored either: offline it is the localized offline page.
  await page.goto("/en");
  await expect(page.getByRole("heading", { level: 1, name: en.offline.heading })).toBeVisible();
  await page.goto("/pt");
  await expect(page.getByRole("heading", { level: 1, name: pt.offline.heading })).toBeVisible();
  // The installed app's launch with no stored Hoje: the offline page as well.
  await page.goto("/?source=pwa");
  // (Its locale follows navigator.language, as for any URL without a locale.)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(new RegExp(`^(${pt.offline.heading}|${en.offline.heading})$`));
  await context.setOffline(false);
});

test("(d) signed in: /pt/today opens offline after a first visit, and sign-out wipes it", async ({ page, context }) => {
  test.skip(!process.env.E2E_SUPABASE, "Needs a live Supabase stack (supabase start + NEXT_PUBLIC_SUPABASE_*); set E2E_SUPABASE=1.");
  await signUpAndOnboard(page, ["exercise"]);
  await waitForControllingWorker(page);
  await page.reload(); // a controlled navigation stores Hoje (the first load is also warmed)
  await expect.poll(() => cachedPaths(page, PAGES_CACHE)).toContain("/pt/today");

  await context.setOffline(true);
  await page.goto("/pt/today");
  await expect(page.getByRole("heading", { name: pt.today.title, level: 1 })).toBeVisible();
  // Launching the installed app (start_url "/?source=pwa") offline reaches the stored Hoje too.
  await page.goto("/?source=pwa");
  await expect(page.getByRole("heading", { name: pt.today.title, level: 1 })).toBeVisible();
  // The landing page (/ and /pt) is not Hoje: offline it gets the offline page.
  await page.goto("/pt");
  await expect(page.getByRole("heading", { level: 1, name: pt.offline.heading })).toBeVisible();
  expect(await cachedPaths(page, PAGES_CACHE)).toEqual(["/pt/today"]); // nothing stored under /, /pt or the launch URL
  await context.setOffline(false);

  await page.goto("/pt/profile");
  await page.getByRole("button", { name: pt.profile.signOut.button }).click();
  await expect(page).toHaveURL(/\/pt\/login$/);
  expect(await cachedPaths(page, PAGES_CACHE)).toEqual([]);

  await context.setOffline(true);
  await page.goto("/pt/today");
  await expect(page.getByRole("heading", { level: 1, name: pt.offline.heading })).toBeVisible();
  await context.setOffline(false);
});
