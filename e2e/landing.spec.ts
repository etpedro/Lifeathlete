// The public landing page against a PRODUCTION build (run with `npm run test:e2e:landing`,
// see playwright.pwa.config.ts). Needs no Supabase: the proxy gets placeholder settings.
import { expect, test, type Page } from "@playwright/test";
import en from "../src/messages/en.json";
import pt from "../src/messages/pt.json";

const noHorizontalOverflow = (page: Page) =>
  page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));

test.describe("browser in Portuguese", () => {
  test.use({ locale: "pt-PT" });

  test("/ ends on /pt with the headline and the Entrar call to action", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/pt$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "pt");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(pt.landing.hero.title);
    const ctas = page.getByRole("link", { name: pt.landing.hero.cta, exact: true });
    await expect(ctas).toHaveCount(2);
    await expect(ctas.first()).toBeVisible();
    await expect(page).toHaveTitle(pt.landing.meta.title);
  });

  test("Entrar opens /pt/login", async ({ page }) => {
    await page.goto("/pt");
    await page.getByRole("link", { name: pt.landing.hero.cta, exact: true }).first().click();
    await expect(page).toHaveURL(/\/pt\/login$/);
    await expect(page.getByRole("heading", { level: 1, name: pt.onboarding.login.title })).toBeVisible();
  });

  test("'Ver como funciona' scrolls to the how-it-works section", async ({ page }) => {
    await page.goto("/pt");
    await page.getByRole("link", { name: pt.landing.hero.more }).click();
    await expect(page).toHaveURL(/\/pt#how-it-works$/);
    await expect(page.getByRole("heading", { level: 2, name: pt.landing.how.title })).toBeInViewport();
  });

  test("the installed app's start_url /?source=pwa, signed out, ends on /pt/login", async ({ page }) => {
    await page.goto("/?source=pwa");
    await expect(page).toHaveURL(/\/pt\/login$/);
  });
});

test.describe("browser in English", () => {
  test.use({ locale: "en-GB" });

  test("/en shows English copy and links to /en/login", async ({ page }) => {
    await page.goto("/en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(en.landing.hero.title);
    await expect(page.getByText(en.landing.hero.subtitle)).toBeVisible();
    const ctas = page.getByRole("link", { name: en.landing.hero.cta, exact: true });
    await expect(ctas).toHaveCount(2);
    for (const cta of await ctas.all()) await expect(cta).toHaveAttribute("href", "/en/login");
    const nav = page.getByRole("navigation", { name: en.landing.footer.language });
    await expect(nav.getByRole("link", { name: en.common.languages.en })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: en.common.languages.pt }).click();
    await expect(page).toHaveURL(/\/pt$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(pt.landing.hero.title);
  });

  test("/?source=pwa follows Accept-Language: /en/today, then /en/login when signed out", async ({ page }) => {
    await page.goto("/?source=pwa");
    await expect(page).toHaveURL(/\/en\/login$/);
  });
});

test("an unsupported browser language gets the default: / → /pt and /?source=pwa → /pt/login", async ({ browser }) => {
  const context = await browser.newContext({ locale: "de-DE" });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(/\/pt$/);
  await page.context().clearCookies();
  await page.goto("/?source=pwa");
  await expect(page).toHaveURL(/\/pt\/login$/);
  await context.close();
});

for (const width of [360, 1280]) {
  test(`no horizontal overflow at ${width}px (pt and en)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ["/pt", "/en"]) {
      await page.goto(path);
      const { scrollWidth, innerWidth } = await noHorizontalOverflow(page);
      expect(scrollWidth, path).toBeLessThanOrEqual(innerWidth);
    }
  });
}

test("the hero floats, and stops under prefers-reduced-motion", async ({ page }) => {
  const animation = () =>
    page.locator("[data-landing-float]").evaluate((el) => getComputedStyle(el).animationName);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/pt");
  expect(await animation()).toMatch(/float/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await animation()).toBe("none");
  expect(await page.locator("[data-landing-glow]").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
});

test("the screens below the fold are lazy-loaded", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pt");
  const loaded = () => page.evaluate(() => [...document.images].map((i) => i.complete && i.naturalWidth > 0));
  expect(await loaded()).toEqual([false, false]);
  await page.getByRole("img", { name: pt.landing.see.today.alt }).scrollIntoViewIfNeeded();
  await expect.poll(loaded).toEqual([true, true]);
});

test("the launch redirect goes to /{locale}/today (cookie first, then Accept-Language); plain / goes to the landing", async ({ request }) => {
  const location = async (headers: Record<string, string>, path = "/?source=pwa") =>
    (await request.get(path, { headers, maxRedirects: 0 })).headers()["location"];
  expect(await location({ "accept-language": "en-GB,en;q=0.9" })).toMatch(/\/en\/today$/);
  expect(await location({ "accept-language": "en-GB", cookie: "NEXT_LOCALE=pt" })).toMatch(/\/pt\/today$/);
  expect(await location({ "accept-language": "de-DE" })).toMatch(/\/pt\/today$/);
  expect(await location({ "accept-language": "en-GB" }, "/")).toMatch(/\/en$/);
  const landing = await request.get("/pt", { maxRedirects: 0 });
  expect(landing.status()).toBe(200); // public, signed out
});
