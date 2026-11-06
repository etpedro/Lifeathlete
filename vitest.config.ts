import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // next-intl/navigation imports "next/navigation" without extension; inline it so Vite resolves it.
    server: { deps: { inline: ["next-intl"] } },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "supabase/functions/**/*.test.ts"],
  },
});
