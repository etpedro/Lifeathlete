import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Use the preinstalled Chromium when present (sandboxed dev environment).
const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath = existsSync(PREINSTALLED_CHROMIUM) ? PREINSTALLED_CHROMIUM : undefined;

/**
 * E2E tests need a running Supabase stack (e.g. `supabase start`) with email
 * confirmations disabled, and NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 * set for `npm run dev`.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: executablePath ? { executablePath } : {} },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/pt/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
