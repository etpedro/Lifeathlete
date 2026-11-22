import type { CapacitorConfig } from "@capacitor/cli";

// The Android shell loads the deployed app; native/www only holds the offline fallback.
const config: CapacitorConfig = {
  appId: "app.lifeathlete.android",
  appName: "Lifeathlete",
  webDir: "native/www",
  server: {
    url: "https://lifeathlete.vercel.app/?source=pwa",
    allowNavigation: ["lifeathlete.vercel.app"],
    cleartext: false,
    errorPath: "offline.html",
  },
};

export default config;
