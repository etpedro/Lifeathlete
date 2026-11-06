// Renders the landing page's share image public/landing/og.png (1200x630, dark theme) with
// the preinstalled Chromium (Playwright): the headline next to the dragonfly floating over
// the Wheel of Life, like the hero. Colors are the dark tokens of src/styles/tokens.css and
// the copy comes from the message files. Run when the hero changes:
//   node scripts/generate-og-image.mjs
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "landing", "og.png");
const PREINSTALLED = "/opt/pw-browsers/chromium";
const WIDTH = 1200;
const HEIGHT = 630;

/** The dark (default) token values: everything before the light media query. */
function darkTokens() {
  const css = readFileSync(join(ROOT, "src", "styles", "tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const dark = css.slice(0, css.indexOf("@media (prefers-color-scheme: light)"));
  return Object.fromEntries([...dark.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const t = darkTokens();
const pt = JSON.parse(readFileSync(join(ROOT, "src", "messages", "pt.json"), "utf8"));
const en = JSON.parse(readFileSync(join(ROOT, "src", "messages", "en.json"), "utf8"));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The wheel (same geometry as src/components/wheel/geometry.ts): 10 axes, first at the top.
const C = { cx: 300, cy: 384, r: 160 };
const point = (i, score, r = C.r) => {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / 10;
  return [C.cx + ((r * score) / 100) * Math.cos(a), C.cy + ((r * score) / 100) * Math.sin(a)];
};
const poly = (scores, r) => scores.map((s, i) => point(i, s, r).map((n) => n.toFixed(1)).join(",")).join(" ");
const SCORES = [80, 66, 72, 88, 58, 70, 62, 76, 84, 68];
const TONES = [t["color-primary"], t["mascot-wing-a"], t["color-secondary"], t["mascot-sparkle"]];
const rings = [25, 50, 75, 100].map((s) => `<polygon points="${poly(Array(10).fill(s))}" fill="none" stroke="${t["landing-ring"]}" stroke-width="1.2"/>`).join("");
const axes = Array.from({ length: 10 }, (_, i) => {
  const [x, y] = point(i, 100);
  return `<line x1="${C.cx}" y1="${C.cy}" x2="${x}" y2="${y}" stroke="${t["landing-ring"]}" stroke-width="1.2"/>`;
}).join("");
const dots = SCORES.map((s, i) => {
  const [x, y] = point(i, s);
  return `<circle cx="${x}" cy="${y}" r="6.5" fill="${TONES[i % 4]}" stroke="${t["color-bg"]}" stroke-width="2.5"/>`;
}).join("");
const beads = Array.from({ length: 10 }, (_, i) => {
  const [x, y] = point(i, 100, C.r + 30);
  return `<circle cx="${x}" cy="${y}" r="3.5" fill="${t["landing-ring"]}"/>`;
}).join("");
const stars = [
  [60, 80, 2], [520, 60, 2.4], [560, 220, 1.6], [40, 300, 1.5], [570, 480, 1.8], [110, 560, 1.4], [420, 30, 1.3], [200, 40, 1.2],
].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${t["landing-star"]}" opacity="0.55"/>`).join("");

// The dragonfly at stage 5, bright (src/components/mascot/Mascot.tsx, flying pose).
const sparkle = (x, y) => `<path d="M${x} ${y - 5}L${x + 1.6} ${y - 1.6}L${x + 5} ${y}L${x + 1.6} ${y + 1.6}L${x} ${y + 5}L${x - 1.6} ${y + 1.6}L${x - 5} ${y}L${x - 1.6} ${y - 1.6}Z" fill="${t["mascot-sparkle"]}"/>`;
const s = 0.78 + 5 * 0.06;
const mascot = `
  <circle cx="60" cy="34" r="17" fill="none" stroke="${t["mascot-sparkle"]}" stroke-width="2" stroke-dasharray="3 3"/>
  <ellipse cx="${60 - 24 * s}" cy="46" rx="${26 * s}" ry="10" fill="${t["mascot-wing-a"]}" opacity="0.7" transform="rotate(-18 ${60 - 24 * s} 46)"/>
  <ellipse cx="${60 + 24 * s}" cy="46" rx="${26 * s}" ry="10" fill="${t["mascot-wing-a"]}" opacity="0.7" transform="rotate(18 ${60 + 24 * s} 46)"/>
  <ellipse cx="${60 - 22 * s}" cy="62" rx="${22 * s}" ry="8" fill="${t["mascot-wing-b"]}" opacity="0.6" transform="rotate(14 ${60 - 22 * s} 62)"/>
  <ellipse cx="${60 + 22 * s}" cy="62" rx="${22 * s}" ry="8" fill="${t["mascot-wing-b"]}" opacity="0.6" transform="rotate(-14 ${60 + 22 * s} 62)"/>
  <path d="M54 28Q50 20 45 18M66 28Q70 20 75 18" stroke="${t["mascot-body"]}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <rect x="56" y="40" width="8" height="70" rx="4" fill="${t["mascot-body"]}"/>
  ${[0, 1, 2].map((i) => `<line x1="56" x2="64" y1="${56 + i * 10}" y2="${56 + i * 10}" stroke="${t["mascot-eye"]}" stroke-width="1.5" opacity="0.7"/>`).join("")}
  <circle cx="60" cy="34" r="9" fill="${t["mascot-body"]}"/>
  <circle cx="56.5" cy="32.5" r="1.6" fill="${t["mascot-eye"]}"/>
  <circle cx="63.5" cy="32.5" r="1.6" fill="${t["mascot-eye"]}"/>
  ${sparkle(20, 24)}${sparkle(100, 30)}${sparkle(14, 70)}${sparkle(106, 74)}`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; font-family: ${t["font-sans"]};
    background: linear-gradient(180deg, ${t["landing-sky-top"]}, ${t["landing-sky-bottom"]}); color: ${t["color-text"]}; }
  .copy { position: absolute; left: 80px; top: 0; bottom: 0; width: 560px; display: flex; flex-direction: column; justify-content: center; gap: 22px; }
  .brand { display: flex; align-items: center; gap: 12px; font-size: 28px; font-weight: 600; }
  h1 { font-size: 76px; line-height: 1.02; font-weight: 650; letter-spacing: -0.035em; }
  .en { font-size: 34px; color: ${t["color-text-muted"]}; font-weight: 500; letter-spacing: -0.01em; }
  .promise { font-size: 25px; white-space: nowrap; color: ${t["color-primary"]}; font-weight: 500; }
  .art { position: absolute; right: 10px; top: -20px; width: 600px; height: 660px; }
  .glow { position: absolute; left: 70px; top: 150px; width: 460px; height: 460px; border-radius: 50%;
    background: radial-gradient(closest-side, ${t["landing-glow"]}, transparent); }
  .art > svg { position: absolute; inset: 0; }
  .art > svg.fly { position: absolute; inset: auto; left: 190px; top: -4px; width: 220px; height: 220px;
    filter: drop-shadow(0 0 10px color-mix(in srgb, ${t["color-accent-gold"]} 55%, transparent)) saturate(1.2); }
</style></head><body>
  <div class="copy">
    <div class="brand"><svg width="40" height="40" viewBox="0 0 120 120">
      <ellipse cx="36" cy="46" rx="26" ry="10" fill="${t["mascot-wing-a"]}" opacity="0.85" transform="rotate(-18 36 46)"/>
      <ellipse cx="84" cy="46" rx="26" ry="10" fill="${t["mascot-wing-a"]}" opacity="0.85" transform="rotate(18 84 46)"/>
      <ellipse cx="38" cy="64" rx="22" ry="8" fill="${t["mascot-wing-b"]}" opacity="0.75" transform="rotate(14 38 64)"/>
      <ellipse cx="82" cy="64" rx="22" ry="8" fill="${t["mascot-wing-b"]}" opacity="0.75" transform="rotate(-14 82 64)"/>
      <rect x="56" y="40" width="8" height="62" rx="4" fill="${t["mascot-body"]}"/><circle cx="60" cy="34" r="9" fill="${t["mascot-body"]}"/>
    </svg>${esc(pt.common.appName)}</div>
    <h1>${esc(pt.landing.hero.title)}</h1>
    <p class="en">${esc(en.landing.hero.title)}</p>
    <p class="promise">${esc(pt.landing.hero.subtitle)}</p>
  </div>
  <div class="art">
    <div class="glow"></div>
    <svg viewBox="0 0 600 660" width="600" height="660">
      ${stars}
      <circle cx="${C.cx}" cy="${C.cy}" r="${C.r + 30}" fill="none" stroke="${t["landing-ring"]}" stroke-dasharray="2 7"/>
      ${rings}${axes}
      <polygon points="${poly(SCORES)}" fill="color-mix(in srgb, ${t["color-primary"]} 20%, transparent)" stroke="${t["color-primary"]}" stroke-width="3" stroke-linejoin="round"/>
      ${dots}${beads}
    </svg>
    <svg class="fly" viewBox="0 0 120 120">${mascot}</svg>
  </div>
</body></html>`;

mkdirSync(dirname(OUT), { recursive: true });
const browser = await chromium.launch(existsSync(PREINSTALLED) ? { executablePath: PREINSTALLED } : {});
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.screenshot({ path: OUT });
  console.log(`wrote public/landing/og.png (${WIDTH}x${HEIGHT})`);
} finally {
  await browser.close();
}
