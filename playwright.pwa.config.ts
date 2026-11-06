import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * PWA e2e (e2e/pwa.spec.ts) against a PRODUCTION build: the service worker is only
 * registered by `next build && next start`. Run with `npm run test:e2e:pwa`.
 *
 * Without E2E_SUPABASE=1 the server gets placeholder Supabase settings pointing at a dead
 * local port (not secrets): the tested pages (/pt/login, manifest, offline pages) need no
 * backend. With E2E_SUPABASE=1 the real NEXT_PUBLIC_SUPABASE_* from the environment are used
 * and the signed-in offline Hoje scenario runs too.
 */
const PORT = 3100;
const placeholderEnv: Record<string, string> = process.env.E2E_SUPABASE
  ? {}
  : { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54399", NEXT_PUBLIC_SUPABASE_ANON_KEY: "e2e-placeholder-anon-key" };

export default defineConfig({
  ...base,
  testMatch: "pwa.spec.ts",
  testIgnore: [],
  fullyParallel: false,
  workers: 1,
  use: { ...base.use, baseURL: `http://localhost:${PORT}`, serviceWorkers: "allow" },
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/pt/login`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: placeholderEnv,
  },
});
