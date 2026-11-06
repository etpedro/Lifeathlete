import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import pt from "../src/messages/pt.json";
import { E2E_PASSWORD, signUpAndOnboard } from "./helpers";

// Requires a live Supabase stack with the `recalculate` Edge Function served (see playwright.config.ts).
// NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY must be set for the test process too.
const DAY_MS = 86_400_000;
const PILLARS = Object.keys(pt.pillars) as (keyof typeof pt.pillars)[];
const stageOf = (text: string | null) => Number(/fase (\d) de 5/.exec(text ?? "")?.[1] ?? 0);

test("30 simulated days unlock the meditation medal and evolve the dragonfly", async ({ page }) => {
  // All 10 pillars: a 30-day history of every habit is what moves the level past a mascot stage.
  const email = await signUpAndOnboard(page, PILLARS);

  await page.goto("/pt/achievements");
  const caption = page.locator("figcaption").first();
  await expect(caption).toContainText("fase 1");
  const medal = page.getByRole("heading", { name: "Mente serena", level: 3 }).locator("..");
  await expect(medal).toHaveAttribute("data-unlocked", "false");

  // Simulate history as the signed-in user (RLS: own manual logs), then recalculate.
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const signIn = await supabase.auth.signInWithPassword({ email, password: E2E_PASSWORD });
  expect(signIn.error).toBeNull();
  const userId = signIn.data.user!.id;
  const habits = await supabase.from("user_habits").select("id, kind, target").eq("active", true);
  expect(habits.error).toBeNull();
  const today = Date.now();
  const rows = Array.from({ length: 30 }, (_, i) => new Date(today - (i + 1) * DAY_MS).toISOString().slice(0, 10)).flatMap(
    (date) =>
      (habits.data ?? []).map((h) => ({
        user_id: userId,
        user_habit_id: h.id,
        date,
        value: h.kind === "check" ? 1 : Number(h.target ?? 1),
        source: "manual",
      })),
  );
  const inserted = await supabase.from("habit_logs").upsert(rows, { onConflict: "user_habit_id,date" });
  expect(inserted.error).toBeNull();
  const recalc = await supabase.functions.invoke("recalculate", { method: "POST" });
  expect(recalc.error).toBeNull();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Mente serena", level: 3 }).locator("..")).toHaveAttribute(
    "data-unlocked",
    "true",
  );
  expect(stageOf(await page.locator("figcaption").first().textContent())).toBeGreaterThan(1);
});
