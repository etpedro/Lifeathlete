import { describe, expect, it } from "vitest";
import { buildSummaryCard, type SummaryCardLabels } from "./summary.ts";

const labels: SummaryCardLabels = {
  title: "O meu resumo",
  level: "Nível",
  streak: "Sequência",
  days: "dias",
  wheel: "Roda da vida",
  pillars: { exercise: "Exercício", nature: "Natureza", reading: "Leitura" },
};
const scores = { exercise: 80, nature: 40, reading: 60 };

function svgOf(stats: { level: number; streak: number; scores: Record<string, number> }, l = labels) {
  return buildSummaryCard(stats, l).svg;
}

/** Minimal well-formedness check: balanced tags, quoted attributes, no stray `<` or `&` in text. */
function assertWellFormed(svg: string) {
  expect(svg.startsWith("<svg ")).toBe(true);
  const stack: string[] = [];
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const text = svg.slice(last, m.index);
    expect(text).not.toMatch(/[<>]/);
    expect(text.replace(/&(amp|lt|gt|quot|apos|#\d+);/g, "")).not.toContain("&");
    last = re.lastIndex;
    if (m[4]) continue; // self-closing
    if (m[1]) expect(stack.pop()).toBe(m[2]);
    else stack.push(m[2]);
  }
  expect(svg.slice(last)).toBe("");
  expect(stack).toEqual([]);
  const attrText = [...svg.matchAll(/="([^"]*)"/g)].map((a) => a[1].replace(/&(amp|lt|gt|quot|apos|#\d+);/g, ""));
  for (const a of attrText) expect(a).not.toContain("&");
}

describe("buildSummaryCard", () => {
  it("is a square, accessible, self-contained SVG with level and streak", () => {
    const svg = svgOf({ level: 7, streak: 12, scores });
    expect(svg).toContain('viewBox="0 0 1080 1080"');
    expect(svg).toContain('role="img"');
    expect(svg).toContain("<title");
    expect(svg).toContain("<desc");
    expect(svg).toMatch(/>7<\/text>/);
    expect(svg).toMatch(/>12<\/text>/);
    expect(svg).toContain("Lifeathlete · O Atleta da Vida");
    expect(svg).toContain("Exercício");
    assertWellFormed(svg);
  });

  it("draws a polygon and one dot per pillar", () => {
    const svg = svgOf({ level: 1, streak: 0, scores });
    expect(svg).toContain("<polygon");
    expect(svg.match(/<circle class="dot"/g)).toHaveLength(3);
  });

  it("never contains names, habit titles/values or dates", () => {
    const hostile = {
      ...labels,
      // unrelated extra fields the card must ignore
      displayName: "Maria Larsen",
      habitTitle: "Run 42 minutes",
      date: "2026-11-05",
    } as unknown as SummaryCardLabels;
    const svg = svgOf(
      { level: 3, streak: 4, scores, displayName: "Maria Larsen", habits: [{ title: "Run", value: "42 minutes" }], date: "2026-11-05" } as never,
      hostile,
    );
    for (const secret of ["Maria Larsen", "42 minutes", "Run", "2026-11-05", "@"]) expect(svg).not.toContain(secret);
    expect(svg).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("escapes hostile labels", () => {
    const evil = { ...labels, title: "<script>alert(1)</script>", pillars: { exercise: `a"b'c&d<e>` } };
    const svg = svgOf({ level: 2, streak: 2, scores: { exercise: 50, 'x"onload="y': 10 } }, evil);
    expect(svg).not.toContain("<script");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("a&quot;b&apos;c&amp;d&lt;e&gt;");
    expect(svg).not.toMatch(/\son\w+\s*=/);
    expect(svg).not.toContain('x"onload');
    assertWellFormed(svg);
  });

  it("has no scripts, event handlers or external references", () => {
    const svg = svgOf({ level: 5, streak: 5, scores });
    expect(svg).not.toContain("<script");
    expect(svg).not.toMatch(/\son\w+\s*=/i);
    // the XML namespace declaration is the only URL allowed (needed to rasterize standalone)
    expect(svg.replace('xmlns="http://www.w3.org/2000/svg"', "")).not.toMatch(/http/i);
    expect(svg).not.toMatch(/href/i);
    expect(svg).not.toContain("url(");
  });

  it("clamps scores and sanitizes level and streak", () => {
    const svg = svgOf({ level: Number.NaN, streak: -5, scores: { exercise: Number.NaN, nature: -20, reading: 500 } });
    expect(svg).toMatch(/>1<\/text>/); // level >= 1
    expect(svg).toMatch(/>0<\/text>/); // streak 0
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
    const pts = svg.match(/<polygon[^>]*points="([^"]+)"/)![1].split(" ");
    expect(pts).toHaveLength(3);
    // exercise (NaN->0) and nature (-20->0) collapse to the centre; reading (500->100) reaches the radius
    expect(pts[0]).toBe(pts[1]);
    expect(Math.hypot(...pts[2].split(",").map((n) => Number(n) - 540) as [number, number])).toBeGreaterThan(200);
    expect(svgOf({ level: Infinity, streak: Infinity, scores })).not.toMatch(/Infinity/);
  });

  it.each([0, 1, 2, 3, 10])("renders valid output for %i pillars", (n) => {
    const s: Record<string, number> = {};
    for (let i = 0; i < n; i++) s[`p${i}`] = (i * 17) % 101;
    const svg = svgOf({ level: 4, streak: 9, scores: s });
    assertWellFormed(svg);
    if (n >= 3) {
      expect(svg).toContain("<polygon");
      expect(svg.match(/<circle class="dot"/g)).toHaveLength(n);
    } else {
      expect(svg).not.toContain("<polygon");
      expect(svg.match(/<rect class="bar"/g) ?? []).toHaveLength(n);
    }
  });

  it("falls back to the slug when a label is missing", () => {
    const svg = svgOf({ level: 1, streak: 1, scores: { mystery: 50, exercise: 20, nature: 30 } });
    expect(svg).toContain(">mystery<");
  });

  it("is deterministic", () => {
    const a = svgOf({ level: 9, streak: 3, scores });
    expect(svgOf({ level: 9, streak: 3, scores })).toBe(a);
  });
});
