import { expect, test } from "@playwright/test";
import en from "../src/messages/en.json";
import pt from "../src/messages/pt.json";
import { signUpAndOnboard } from "./helpers";

// Spec §6 "mudança de idioma": the language chosen on Perfil is stored (profiles.locale)
// and wins over the URL locale on later visits.
test.describe("language switch", () => {
  test.skip(!process.env.E2E_SUPABASE, "Needs a live Supabase stack (supabase start + NEXT_PUBLIC_SUPABASE_*); set E2E_SUPABASE=1.");

  test("switching to English on Perfil keeps the page, persists, and redirects other-locale URLs", async ({ page }) => {
    await signUpAndOnboard(page, ["exercise"]);
    await page.getByRole("link", { name: pt.common.nav.profile }).click();
    await expect(page).toHaveURL(/\/pt\/profile$/);

    await page.getByRole("radio", { name: "English" }).check();
    await expect(page).toHaveURL(/\/en\/profile$/);
    await expect(page.getByRole("heading", { level: 1, name: en.profile.title })).toBeVisible();
    await expect(page.getByRole("radio", { name: "English" })).toBeChecked();

    // Stored: a Portuguese URL now lands on the same page in English.
    await page.goto("/pt/today");
    await expect(page).toHaveURL(/\/en\/today$/);
    await expect(page.getByRole("heading", { level: 1, name: en.today.title })).toBeVisible();

    // And back to Portuguese.
    await page.goto("/en/profile");
    await page.getByRole("radio", { name: "Português" }).check();
    await expect(page).toHaveURL(/\/pt\/profile$/);
    await page.goto("/en/wheel");
    await expect(page).toHaveURL(/\/pt\/wheel$/);
  });
});
