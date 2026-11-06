import { expect, test } from "@playwright/test";
import pt from "../src/messages/pt.json";

// Requires a live Supabase stack (see playwright.config.ts).
test("new account: onboarding with 2 pillars lands on /pt/today", async ({ page }) => {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  await page.goto("/pt/today");
  await expect(page).toHaveURL(/\/pt\/login$/);

  // sign up
  await page.getByRole("button", { name: pt.onboarding.login.toSignUp }).click();
  await page.getByLabel(pt.onboarding.login.email).fill(email);
  await page.getByLabel(pt.onboarding.login.password).fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: pt.onboarding.login.signUp, exact: true }).click();
  await expect(page).toHaveURL(/\/pt\/onboarding$/);

  // 1. language (PT preselected from the URL) + time zone
  await expect(page.getByRole("heading", { name: pt.onboarding.language.title })).toBeVisible();
  await expect(page.getByRole("radio", { name: pt.common.languages.pt })).toBeChecked();
  await page.getByRole("button", { name: pt.common.next }).click();

  // 2. the 10 pillars
  await expect(page.getByRole("heading", { name: pt.onboarding.intro.title })).toBeVisible();
  await page.getByRole("button", { name: pt.common.next }).click();

  // 3. choose 2 pillars (their suggested habits are pre-checked)
  await expect(page.getByRole("heading", { name: pt.onboarding.choose.title })).toBeVisible();
  await page.getByRole("checkbox", { name: pt.pillars.exercise.name }).check();
  await page.getByRole("checkbox", { name: pt.pillars.meditation.name }).check();
  await expect(page.getByRole("checkbox", { name: "Meditar 10 min" })).toBeChecked();
  await page.getByRole("button", { name: pt.common.next }).click();

  // 4. meet the dragonfly and finish
  await expect(page.getByRole("heading", { name: pt.onboarding.dragonfly.title })).toBeVisible();
  await page.getByRole("button", { name: pt.common.finish }).click();

  await expect(page).toHaveURL(/\/pt\/today$/);
  await expect(page.getByRole("heading", { name: pt.today.title })).toBeVisible();

  // onboarded users are sent from onboarding/login back to Today
  await page.goto("/pt/onboarding");
  await expect(page).toHaveURL(/\/pt\/today$/);
});
