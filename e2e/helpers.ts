import { expect, type Page } from "@playwright/test";
import pt from "../src/messages/pt.json";

type PillarSlug = keyof typeof pt.pillars;

/** Signs up a fresh account and finishes onboarding with `pillars`, landing on /pt/today. */
export async function signUpAndOnboard(page: Page, pillars: PillarSlug[]): Promise<void> {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.goto("/pt/login");
  await page.getByRole("button", { name: pt.onboarding.login.toSignUp }).click();
  await page.getByLabel(pt.onboarding.login.email).fill(email);
  await page.getByLabel(pt.onboarding.login.password).fill("correct-horse-battery-staple");
  await page.getByRole("button", { name: pt.onboarding.login.signUp, exact: true }).click();
  await expect(page).toHaveURL(/\/pt\/onboarding$/);

  await page.getByRole("button", { name: pt.common.next }).click(); // language
  await page.getByRole("button", { name: pt.common.next }).click(); // the 10 pillars
  for (const slug of pillars) await page.getByRole("checkbox", { name: pt.pillars[slug].name }).check();
  await page.getByRole("button", { name: pt.common.next }).click();
  await page.getByRole("button", { name: pt.common.finish }).click();
  await expect(page).toHaveURL(/\/pt\/today$/);
}
