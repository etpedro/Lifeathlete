import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import pt from "@/messages/pt.json";
import { Landing } from "./Landing";
import { PILLAR_SLUGS } from "./PillarIcon";
import { SCREEN_HEIGHT, SCREEN_WIDTH, screenSrc } from "./SeeIt";

const MESSAGES = { pt, en } as const;
type L = keyof typeof MESSAGES;

function render(locale: L) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="UTC">
      <Landing />
    </NextIntlClientProvider>,
  );
}

/** How React escapes text in markup. */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

/** Width x height of a WebP file (lossy "VP8 ", lossless "VP8L" or extended "VP8X"). */
function webpSize(buf: Buffer): { width: number; height: number } {
  expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
  expect(buf.toString("ascii", 8, 12)).toBe("WEBP");
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8X") return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  if (chunk === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  throw new Error(`Unknown WebP chunk ${chunk}`);
}

describe.each(["pt", "en"] as const)("landing page (%s)", (locale) => {
  const m = MESSAGES[locale];
  const html = render(locale);

  it("has the landmarks: header, main, a labelled nav and footer", () => {
    expect(count(html, /<header[\s>]/g)).toBe(1);
    expect(count(html, /<main[\s>]/g)).toBe(1);
    expect(count(html, /<footer[\s>]/g)).toBe(1);
    expect(html).toContain(`<nav aria-label="${esc(m.landing.footer.language)}"`);
  });

  it("has a single h1 with the headline, then h2 and h3 in order (no skipped level)", () => {
    expect(count(html, /<h1[\s>]/g)).toBe(1);
    expect(html).toMatch(new RegExp(`<h1[^>]*>${esc(m.landing.hero.title)}</h1>`));
    const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map((x) => Number(x[1]));
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1], `heading ${i}`).toBeLessThanOrEqual(1);
    for (const title of [m.landing.pillars.title, m.landing.how.title, m.landing.see.title, m.landing.dragonfly.title, m.landing.final.title]) {
      expect(html).toMatch(new RegExp(`<h2[^>]*>${esc(title)}</h2>`));
    }
  });

  it("has exactly two 'Entrar' calls to action, both to the locale's login page", () => {
    const ctas = [...html.matchAll(/<a[^>]*data-cta="login"[^>]*>([^<]*)<\/a>/g)];
    expect(ctas).toHaveLength(2);
    for (const [tag, text] of ctas) {
      expect(tag).toContain(`href="/${locale}/login"`);
      expect(text).toBe(m.landing.hero.cta);
    }
    expect(m.landing.final.cta).toBe(m.landing.hero.cta);
    expect(count(html, /href="[^"]*\/login"/g)).toBe(2);
  });

  it("the secondary link scrolls to the 'how it works' section", () => {
    expect(html).toContain(`href="#how-it-works"`);
    expect(html).toContain(`id="how-it-works"`);
    expect(html).toContain(`>${esc(m.landing.hero.more)}</a>`);
  });

  it("lists the 10 pillars with their names and descriptions from the pillars messages, each with an icon", () => {
    for (const slug of PILLAR_SLUGS) {
      expect(html).toContain(`>${esc(m.pillars[slug].name)}</h3>`);
      expect(html).toContain(esc(m.pillars[slug].description));
      expect(html).toContain(`data-pillar-icon="${slug}"`);
    }
    expect(count(html, /data-pillar-icon=/g)).toBe(10);
  });

  it("has the 3 steps", () => {
    expect(count(html, /data-step="/g)).toBe(3);
    for (const step of ["checkin", "progress", "balance"] as const) {
      expect(html).toContain(esc(m.landing.how[step].title));
      expect(html).toContain(esc(m.landing.how[step].body));
    }
  });

  it("shows the 5 dragonfly stages (plus the decorative one in the hero)", () => {
    expect(count(html, /<li[^>]*data-stage="[1-5]"/g)).toBe(5);
    for (const stage of [1, 2, 3, 4, 5]) expect(html).toContain(`data-stage="${stage}"`);
    expect(html).toContain(esc(m.landing.dragonfly.body));
  });

  it("shows the two localized app screens as lazy images with alt text and explicit size", () => {
    for (const screen of ["today", "wheel"] as const) {
      const img = new RegExp(`<img[^>]*src="${screenSrc(screen, locale)}"[^>]*>`).exec(html)?.[0];
      expect(img, screen).toBeTruthy();
      expect(img).toContain(`alt="${esc(m.landing.see[screen].alt)}"`);
      expect(img).toContain(`width="${SCREEN_WIDTH}"`);
      expect(img).toContain(`height="${SCREEN_HEIGHT}"`);
      expect(img).toContain(`loading="lazy"`);
      expect(img).toContain(`decoding="async"`);
    }
  });

  it("links to both languages (plain /pt and /en), marking the current one", () => {
    for (const l of ["pt", "en"] as const) {
      const link = new RegExp(`<a[^>]*href="/${l}"[^>]*>${esc(m.common.languages[l])}</a>`).exec(html)?.[0];
      expect(link, l).toBeTruthy();
      if (l === locale) expect(link).toContain(`aria-current="page"`);
      else expect(link).not.toContain("aria-current");
    }
  });

  it("every SVG is decorative (aria-hidden)", () => {
    const svgs = [...html.matchAll(/<svg[^>]*>/g)].map((x) => x[0]);
    expect(svgs.length).toBeGreaterThan(10);
    for (const svg of svgs) expect(svg).toContain(`aria-hidden="true"`);
  });

  it("never mentions a studio, author or partner brand", () => {
    for (const text of [html, JSON.stringify(m.landing)]) {
      expect(text).not.toMatch(/Pilates/i);
      expect(text).not.toMatch(/Maria Larsen/i);
      expect(text).not.toMatch(/Larsen/i);
    }
  });

  it("promises nothing the app does not do (integrations, export, deletion, privacy claims, coming soon)", () => {
    expect(JSON.stringify(m.landing)).not.toMatch(
      /strava|garmin|fitbit|oura|huawei|apple health|google fit|rel[óo]gio|watch|export|apagar|delete|rgpd|gdpr|privacidade|privacy|em breve|coming soon|brevemente|#1|n\.º 1|utilizadores|users/i,
    );
  });
});

describe("landing page in both languages", () => {
  it("PT and EN render different copy (no hard-coded visible strings)", () => {
    const [p, e] = [render("pt"), render("en")];
    expect(p).not.toBe(e);
    expect(p).toContain(pt.landing.hero.subtitle);
    expect(e).toContain(en.landing.hero.subtitle);
    expect(e).not.toContain(pt.landing.hero.subtitle);
    expect(p).not.toContain(en.landing.hero.subtitle);
  });
});

describe("committed landing images", () => {
  const PUBLIC = join(process.cwd(), "public");
  it.each(["today", "wheel"].flatMap((s) => ["pt", "en"].map((l) => screenSrc(s as "today", l))))(
    "%s is a 2x WebP of a 390x844 viewport, at most 70 KB",
    (src) => {
      const file = join(PUBLIC, src);
      expect(statSync(file).size).toBeLessThanOrEqual(70 * 1024);
      expect(webpSize(readFileSync(file))).toEqual({ width: SCREEN_WIDTH * 2, height: SCREEN_HEIGHT * 2 });
    },
  );
});
