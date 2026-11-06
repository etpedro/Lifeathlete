// PURE shareable summary card. No Node/Deno APIs, no I/O: imported by the browser
// (src/lib/data/share.ts) and by the Deno entrypoint (index.ts).
//
// PRIVACY: the card shows ONLY level, streak, the wheel shape and generic labels.
// It never receives or prints a name, e-mail, habit title, raw habit value or date.

export type SummaryCardStats = { level: number; streak: number; scores: Record<string, number> };

export type SummaryCardLabels = {
  title: string;
  /** Word next to the level number, e.g. "Level". */
  level: string;
  /** Caption of the streak number, e.g. "Streak". */
  streak: string;
  /** Unit of the streak, e.g. "days". */
  days: string;
  /** Accessible name of the wheel, e.g. "Wheel of Life". */
  wheel: string;
  /** Pillar slug -> display name; a missing slug falls back to the slug itself. */
  pillars: Record<string, string>;
};

const SIZE = 1080;
const CX = 540;
const CY = 670;
const RADIUS = 230;
const BRAND = "Lifeathlete · O Atleta da Vida";
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
// Self-contained image: literal values mirroring the dark tokens in src/styles/tokens.css
// (bg, surface, text, text-muted, border, primary). No CSS variables on purpose.
const C = { bg: "#0e1a18", panel: "#1a2c28", text: "#dfe9e3", muted: "#9cb0a8", grid: "#2f4842", accent: "#7cc79b" };
/** Pillar labels around the wheel: at most this many characters per line, two lines. */
const LABEL_LINE = 18;
const LABEL_LINES = 2;
const LABEL_SIZE = 24;
const LABEL_LEADING = 28;

/** XML-escape; also drops characters that are illegal in XML 1.0. */
function esc(value: unknown): string {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const round = (n: number) => Math.round(n * 100) / 100;

function clampScore(score: unknown): number {
  return typeof score === "number" && Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0;
}

function count(value: unknown, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : min;
}

function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : text;
}

/**
 * Greedy word wrap into at most `maxLines` lines of at most `maxChars` characters
 * (counted as code points). Pure and deterministic; returns unescaped text. Only a label
 * that cannot fit (an over-long word, or more text than the lines hold) is shortened
 * with "…"; every real pillar name (PT and EN) fits in two lines.
 */
export function wrapLabel(text: string, maxChars = LABEL_LINE, maxLines = LABEL_LINES): string[] {
  const len = (s: string) => Array.from(s).length;
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (len(next) <= maxChars) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  const fitted = lines.slice(0, maxLines).map((l) => truncate(l, maxChars));
  if (lines.length > maxLines) {
    const last = Array.from(fitted[maxLines - 1]);
    if (last[last.length - 1] !== "…") fitted[maxLines - 1] = `${last.slice(0, maxChars - 1).join("")}…`;
  }
  return fitted.length > 0 ? fitted : [""];
}

// Geometry duplicated from src/components/wheel/geometry.ts (Deno cannot import from src/).
function point(index: number, total: number, score: number, radius: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / total;
  const r = (radius * score) / 100;
  return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle) };
}

function wheelShape(entries: { label: string; score: number }[]): string {
  const n = entries.length;
  const rings = [25, 50, 75, 100]
    .map((p) => `<circle class="ring" cx="${CX}" cy="${CY}" r="${round((RADIUS * p) / 100)}" fill="none" stroke="${C.grid}" stroke-width="2"/>`)
    .join("");
  if (n === 0) return rings;
  if (n < 3) {
    // Too few axes for a polygon: horizontal bars.
    const bars = entries
      .map((e, i) => {
        const y = 560 + i * 140;
        const w = round((760 * e.score) / 100);
        return (
          `<text class="label" x="160" y="${y}" font-size="34" fill="${C.text}">${esc(truncate(e.label, 40))}</text>` +
          `<rect x="160" y="${y + 16}" width="760" height="28" rx="14" fill="${C.panel}"/>` +
          `<rect class="bar" x="160" y="${y + 16}" width="${w}" height="28" rx="14" fill="${C.accent}"/>`
        );
      })
      .join("");
    return bars;
  }
  const spokes = entries
    .map((_, i) => {
      const p = point(i, n, 100, RADIUS);
      return `<line x1="${CX}" y1="${CY}" x2="${round(p.x)}" y2="${round(p.y)}" stroke="${C.grid}" stroke-width="2"/>`;
    })
    .join("");
  const pts = entries.map((e, i) => point(i, n, e.score, RADIUS));
  const polygon = `<polygon points="${pts.map((p) => `${round(p.x)},${round(p.y)}`).join(" ")}" fill="${C.accent}" fill-opacity="0.35" stroke="${C.accent}" stroke-width="5" stroke-linejoin="round"/>`;
  const dots = pts.map((p) => `<circle class="dot" cx="${round(p.x)}" cy="${round(p.y)}" r="9" fill="${C.accent}"/>`).join("");
  const labels = entries
    .map((e, i) => {
      const p = point(i, n, 100, RADIUS + 28);
      const cos = Math.cos(-Math.PI / 2 + (2 * Math.PI * i) / n);
      const anchor = Math.abs(cos) < 0.2 ? "middle" : cos > 0 ? "start" : "end";
      const lines = wrapLabel(e.label);
      const extra = (lines.length - 1) * LABEL_LEADING;
      // Below the centre the block grows downward, above it upward, at the sides it is centred.
      const first = p.y > CY + 1 ? p.y + 22 : p.y < CY - 1 ? p.y - extra : p.y + 9 - extra / 2;
      const x = round(p.x);
      const spans = lines
        .map((line, li) => `<tspan x="${x}" ${li === 0 ? `y="${round(first)}"` : `dy="${LABEL_LEADING}"`}>${esc(line)}</tspan>`)
        .join("");
      return `<text class="label" text-anchor="${anchor}" font-size="${LABEL_SIZE}" fill="${C.muted}">${spans}</text>`;
    })
    .join("");
  return rings + spokes + polygon + dots + labels;
}

/** Builds the square share card. Deterministic; text is XML-escaped; no scripts or external references. */
export function buildSummaryCard(stats: SummaryCardStats, labels: SummaryCardLabels): { svg: string } {
  const level = count(stats?.level, 1, 9999);
  const streak = count(stats?.streak, 0, 99999);
  const pillarNames = labels.pillars ?? {};
  const entries = Object.entries(stats?.scores ?? {}).map(([slug, score]) => ({
    label: typeof pillarNames[slug] === "string" && pillarNames[slug] !== "" ? pillarNames[slug] : slug,
    score: clampScore(score),
  }));

  const desc =
    `${labels.level} ${level}, ${labels.streak} ${streak} ${labels.days}. ${labels.wheel}: ` +
    (entries.length === 0 ? "-" : entries.map((e) => `${e.label} ${Math.round(e.score)}`).join(", "));

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-labelledby="card-title card-desc" font-family="${FONT}">` +
    `<title id="card-title">${esc(labels.title)}</title>` +
    `<desc id="card-desc">${esc(desc)}</desc>` +
    `<rect width="${SIZE}" height="${SIZE}" fill="${C.bg}"/>` +
    `<text x="${CX}" y="110" text-anchor="middle" font-size="52" font-weight="700" fill="${C.text}">${esc(truncate(labels.title, 40))}</text>` +
    `<text x="300" y="290" text-anchor="middle" font-size="150" font-weight="700" fill="${C.accent}">${level}</text>` +
    `<text x="300" y="350" text-anchor="middle" font-size="40" fill="${C.muted}">${esc(truncate(labels.level, 20))}</text>` +
    `<text x="780" y="290" text-anchor="middle" font-size="150" font-weight="700" fill="${C.accent}">${streak}</text>` +
    `<text x="780" y="350" text-anchor="middle" font-size="40" fill="${C.muted}">${esc(truncate(`${labels.streak} · ${labels.days}`, 30))}</text>` +
    `<g aria-label="${esc(labels.wheel)}">${wheelShape(entries)}</g>` +
    `<text x="${CX}" y="1046" text-anchor="middle" font-size="28" fill="${C.muted}">${esc(BRAND)}</text>` +
    `</svg>`;
  return { svg };
}
