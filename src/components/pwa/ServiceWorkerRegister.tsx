"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/pwa/client";

/** Registers the service worker once, in production builds only. Renders nothing. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    void registerServiceWorker({
      production: process.env.NODE_ENV === "production",
      serviceWorker: "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
      href: window.location.href,
      performance: window.performance,
    });
  }, []);
  return null;
}
