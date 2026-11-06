import type { Wheel } from "@/lib/data/stats";

export type Circle = { cx: number; cy: number; radius: number };

/** Score forced into 0..100; NaN and non-numbers become 0. */
export function clampScore(score: number): number {
  return Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : 0;
}

/** Point of axis `index` of `count` (first axis at the top, clockwise) at `score`% of the radius. */
export function radarPoint(index: number, count: number, score: number, c: Circle): { x: number; y: number } {
  const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
  const r = (c.radius * clampScore(score)) / 100;
  return { x: c.cx + r * Math.cos(angle), y: c.cy + r * Math.sin(angle) };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** SVG `points` attribute of the polygon through every score. */
export function polygonPoints(scores: number[], c: Circle): string {
  return scores
    .map((s, i) => radarPoint(i, scores.length, s, c))
    .map((p) => `${round(p.x)},${round(p.y)}`)
    .join(" ");
}

/** Which pillars to call out; empty when nothing is worth highlighting. */
export function wheelCallouts(wheel: Wheel): {
  strongest?: { slug: string; score: number };
  weakest?: { slug: string; score: number };
} {
  const pick = (slug?: string) => (slug ? { slug, score: wheel.scores[slug] ?? 0 } : undefined);
  const strongest = pick(wheel.strongest);
  const weakest = pick(wheel.weakest);
  return { ...(strongest ? { strongest } : {}), ...(weakest ? { weakest } : {}) };
}
