// Renders the dragonfly brand mark to the PWA icon PNGs in public/icons/ with the
// preinstalled Chromium (Playwright). Run once when the mark changes:
//   node scripts/generate-icons.mjs
// The shapes mirror src/components/mascot/Mascot.tsx (flying pose) so the icon matches the app.
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "icons");
const PREINSTALLED = "/opt/pw-browsers/chromium";

const BG = "#F4FBF6";
const BODY = "#2E933C";

/** The mark in a 120x120 box, centered on the dragonfly. */
const mark = `
  <ellipse cx="36" cy="46" rx="26" ry="10" fill="#5BC0EB" opacity="0.8" transform="rotate(-18 36 46)"/>
  <ellipse cx="84" cy="46" rx="26" ry="10" fill="#5BC0EB" opacity="0.8" transform="rotate(18 84 46)"/>
  <ellipse cx="38" cy="64" rx="22" ry="8" fill="#9B5DE5" opacity="0.7" transform="rotate(14 38 64)"/>
  <ellipse cx="82" cy="64" rx="22" ry="8" fill="#9B5DE5" opacity="0.7" transform="rotate(-14 82 64)"/>
  <rect x="56" y="40" width="8" height="62" rx="4" fill="${BODY}"/>
  <circle cx="60" cy="34" r="9" fill="${BODY}"/>
  <circle cx="56.5" cy="32.5" r="1.6" fill="#fff"/>
  <circle cx="63.5" cy="32.5" r="1.6" fill="#fff"/>`;

/**
 * `inset` is the fraction of the canvas the mark may use. Maskable icons keep the mark
 * inside the 80% safe zone and fill the canvas edge to edge; "any" icons get a rounded tile.
 */
function svg(size, { rounded, inset }) {
  const pad = (size * (1 - inset)) / 2;
  const scale = (size * inset) / 120;
  const bg = rounded
    ? `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${BG}"/>`
    : `<rect width="${size}" height="${size}" fill="${BG}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}<g transform="translate(${pad} ${pad}) scale(${scale})">${mark}</g></svg>`;
}

const ICONS = [
  { file: "icon-192.png", size: 192, rounded: true, inset: 0.86 },
  { file: "icon-512.png", size: 512, rounded: true, inset: 0.86 },
  { file: "icon-maskable-512.png", size: 512, rounded: false, inset: 0.66 },
  { file: "apple-touch-icon.png", size: 180, rounded: false, inset: 0.78 },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(existsSync(PREINSTALLED) ? { executablePath: PREINSTALLED } : {});
try {
  for (const icon of ICONS) {
    const page = await browser.newPage({ viewport: { width: icon.size, height: icon.size }, deviceScaleFactor: 1 });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg(icon.size, icon)}</body></html>`);
    await page.locator("svg").screenshot({ path: join(OUT, icon.file), omitBackground: true });
    await page.close();
    console.log(`wrote public/icons/${icon.file} (${icon.size}x${icon.size})`);
  }
} finally {
  await browser.close();
}
