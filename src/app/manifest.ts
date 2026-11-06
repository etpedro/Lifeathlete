import type { MetadataRoute } from "next";

export const THEME_COLOR = "#2E933C";
export const BACKGROUND_COLOR = "#F4FBF6";
export const APPLE_TOUCH_ICON = "/icons/apple-touch-icon.png";

/**
 * Web app manifest, served by Next at /manifest.webmanifest. `start_url` is "/" so the
 * proxy picks the locale; the app is PT-first, so `lang` and `description` are PT.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Lifeathlete",
    short_name: "Lifeathlete",
    description: "Cuida dos teus 10 pilares, um dia de cada vez.",
    lang: "pt",
    start_url: "/",
    scope: "/",
    display: "standalone",
    theme_color: THEME_COLOR,
    background_color: BACKGROUND_COLOR,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
