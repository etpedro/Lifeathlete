// Enforces WCAG 2.x contrast for the design tokens in src/styles/tokens.css, in the dark
// (default) and the light variant. Fails when a palette change makes text or a
// state-conveying UI boundary too faint.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const LIGHT_QUERY = "@media (prefers-color-scheme: light)";

function hexTokens(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}

const split = css.indexOf(LIGHT_QUERY);
const dark = hexTokens(css.slice(0, split));
const light = { ...dark, ...hexTokens(css.slice(split)) };
const THEMES = { dark, light } as const;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const BACKGROUNDS = ["color-bg", "color-surface", "color-surface-raised"];
const TEXT_ROLES = ["color-text", "color-text-muted", "color-primary", "color-secondary", "color-danger", "color-accent-gold", "color-success"];
/** Boundaries that convey state or identify a control (WCAG 1.4.11): 3:1. */
const UI_ROLES = ["color-border-strong", "color-focus", "color-primary", "color-danger", "color-accent-gold"];

/** [foreground, background, minimum] pairs beyond the role x background grid. */
const PAIRS: [string, string, number][] = [
  ["color-on-primary", "color-primary", 4.5],
  ["color-on-primary", "color-primary-hover", 4.5],
  ["color-on-gold", "color-accent-gold", 4.5],
  ["color-text", "color-surface-hover", 4.5],
  ["color-text", "color-input-bg", 4.5],
  ["color-text", "color-primary-soft", 4.5],
  ["color-text-muted", "color-primary-soft", 4.5],
  ["color-primary", "color-primary-soft", 4.5],
  ["color-text", "color-secondary-soft", 4.5],
  ["color-text", "color-gold-soft", 4.5],
  ["color-accent-gold", "color-gold-soft", 4.5],
  ["color-text", "color-danger-soft", 4.5],
  ["color-danger", "color-danger-soft", 4.5],
  ["color-text", "color-selection", 4.5],
  ["color-border-strong", "color-input-bg", 3],
  ["color-primary", "color-track", 3],
  ["color-secondary", "color-track", 3],
];

/**
 * The landing page's section surfaces and every gradient stop (hero sky, wheel glow, final
 * call-to-action). Text over a gradient is between two stops, so it is checked on each stop.
 */
const LANDING_BACKGROUNDS = [
  "landing-sky-top",
  "landing-sky-bottom",
  "landing-glow",
  "landing-band",
  "landing-cta-top",
  "landing-cta-bottom",
];
/** Every text color the landing page puts on those surfaces. */
const LANDING_TEXT = ["color-text", "color-text-muted", "color-primary", "color-secondary", "color-accent-gold"];
/** The outlined secondary button's border and the focus ring on those surfaces: 3:1. */
const LANDING_UI = ["color-border-strong", "color-focus", "color-primary"];

describe.each(Object.entries(THEMES))("%s theme landing page", (_name, t) => {
  it.each(LANDING_TEXT.flatMap((fg) => LANDING_BACKGROUNDS.map((bg) => [fg, bg] as const)))(
    "text %s on %s is at least 4.5:1",
    (fg, bg) => {
      expect(t[bg], bg).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(LANDING_UI.flatMap((fg) => LANDING_BACKGROUNDS.map((bg) => [fg, bg] as const)))(
    "UI boundary %s on %s is at least 3:1",
    (fg, bg) => {
      expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(3);
    },
  );
});

describe.each(Object.entries(THEMES))("%s theme tokens", (_name, t) => {
  it("defines every color role as a hex value", () => {
    const needed = [...BACKGROUNDS, ...TEXT_ROLES, ...UI_ROLES, ...PAIRS.flatMap(([a, b]) => [a, b])];
    for (const key of needed) expect(t[key], key).toMatch(/^#[0-9a-f]{6}$/);
  });

  it.each(TEXT_ROLES.flatMap((fg) => BACKGROUNDS.map((bg) => [fg, bg] as const)))("text %s on %s is at least 4.5:1", (fg, bg) => {
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(UI_ROLES.flatMap((fg) => BACKGROUNDS.map((bg) => [fg, bg] as const)))("UI boundary %s on %s is at least 3:1", (fg, bg) => {
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(3);
  });

  it.each(PAIRS)("%s on %s is at least %d:1", (fg, bg, min) => {
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
  });

  it("keeps text soft: no pure white on black, no pure black on white", () => {
    expect(t["color-text"]).not.toBe("#ffffff");
    expect(t["color-bg"]).not.toBe("#000000");
    expect(t["color-bg"]).not.toBe("#ffffff");
    expect(contrast(t["color-text"], t["color-bg"])).toBeLessThan(17);
  });
});
