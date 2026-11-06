import { expect, test } from "@playwright/test";
import pt from "../src/messages/pt.json";
import { signUpAndOnboard } from "./helpers";

// Requires a live Supabase stack with the `recalculate` Edge Function served (see playwright.config.ts).
const WORKOUT = "Treino do dia"; // exercise/workout template, a `check` habit
const xpToast = (xp: number) => pt.today.toast.xp.replace("{xp}", String(xp));

test("marking a habit gives immediate feedback: +10 XP", async ({ page }) => {
  await signUpAndOnboard(page, ["exercise", "meditation"]);
  await expect(page.getByRole("heading", { name: pt.today.title, level: 1 })).toBeVisible();

  const habit = page.getByRole("button", { name: WORKOUT, exact: true });
  await expect(habit).toHaveAttribute("aria-pressed", "false");
  await habit.click();
  await expect(habit).toHaveAttribute("aria-pressed", "true"); // optimistic

  // exercise + meditation give 6 habits, so one tick is 10 XP (no day-complete bonus)
  await expect(page.getByRole("status").filter({ hasText: xpToast(10) })).toBeVisible({ timeout: 15_000 });
  const stats = page.getByRole("region", { name: pt.today.stats.label });
  await expect(stats.getByText(pt.today.stats.xp.replace("{xp}", "10"), { exact: true })).toBeVisible();

  // persisted: still ticked after a reload
  await page.reload();
  await expect(page.getByRole("button", { name: WORKOUT, exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("offline check-in is kept locally and synced when back online", async ({ page, context }) => {
  await signUpAndOnboard(page, ["exercise"]);
  const habit = page.getByRole("button", { name: WORKOUT, exact: true });
  await expect(habit).toHaveAttribute("aria-pressed", "false");

  await context.setOffline(true);
  await expect(page.getByText(pt.today.offline)).toBeVisible();
  await habit.click();
  await expect(habit).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(pt.today.habit.pending)).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText(pt.today.habit.pending)).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(pt.today.offline)).toBeHidden();

  // the server has exactly the synced value: ticked after a reload, nothing pending
  await page.reload();
  await expect(page.getByRole("button", { name: WORKOUT, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(pt.today.habit.pending)).toHaveCount(0);
});
