import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RadarChart, type RadarEntry, type RadarLabels } from "./RadarChart";

const labels: RadarLabels = {
  ariaLabel: "Resumo da roda",
  tableCaption: "Pontuação por pilar",
  pillarHeader: "Pilar",
  valueHeader: "Pontuação",
  formatValue: (s) => `${s}%`,
};
const make = (n: number): RadarEntry[] =>
  Array.from({ length: n }, (_, i) => ({ slug: `p${i}`, label: `Pilar ${i}`, score: (i + 1) * 7 }));

describe("RadarChart", () => {
  it("renders nothing for zero pillars", () => {
    expect(renderToStaticMarkup(<RadarChart entries={[]} labels={labels} />)).toBe("");
  });

  it("renders a labelled svg and a hidden table with every pillar value (10 pillars)", () => {
    const entries = make(10);
    const html = renderToStaticMarkup(<RadarChart entries={entries} labels={labels} />);
    expect(html).toMatch(/<svg[^>]*role="img"[^>]*aria-label="Resumo da roda"/);
    expect(html).toContain("<table");
    for (const e of entries) {
      expect(html).toContain(`<th scope="row">${e.label}</th><td>${e.score}%</td>`);
    }
    expect(html).not.toMatch(/NaN|Infinity/);
  });

  it("renders a bar list, not a polygon, for 1 and 2 pillars", () => {
    for (const n of [1, 2]) {
      const html = renderToStaticMarkup(<RadarChart entries={make(n)} labels={labels} />);
      expect(html).not.toContain("<svg");
      expect(html).toContain('aria-label="Resumo da roda"');
      expect(html.match(/<li/g)).toHaveLength(n);
    }
  });

  it("clamps out-of-range and NaN scores without producing NaN", () => {
    const html = renderToStaticMarkup(
      <RadarChart
        entries={[
          { slug: "a", label: "A", score: 250 },
          { slug: "b", label: "B", score: Number.NaN },
          { slug: "c", label: "C", score: -3 },
        ]}
        labels={labels}
      />,
    );
    expect(html).not.toMatch(/NaN/);
    expect(html).toContain("<td>100%</td>");
  });

  it("fills the polygon with a gradient and colors each point by its pillar", () => {
    const entries: RadarEntry[] = [
      { slug: "exercise", label: "Exercício", score: 70 },
      { slug: "nature", label: "Natureza", score: 90 },
      { slug: "reading", label: "Ler", score: 30 },
    ];
    const html = renderToStaticMarkup(<RadarChart entries={entries} labels={labels} />);
    expect(html).toMatch(/<(radial|linear)Gradient/);
    expect(html).toMatch(/fill="url\(#[^)]+\)"|fill:url\(#/);
    for (const e of entries) {
      expect(html).toMatch(new RegExp(`data-pillar="${e.slug}"[^>]*fill="var\\(--pillar-${e.slug}\\)"`));
    }
    expect(html).toContain("<caption>Pontuação por pilar</caption>");
  });

  it("does not throw for unknown pillar slugs and falls back to the primary color", () => {
    const html = renderToStaticMarkup(<RadarChart entries={make(5)} labels={labels} />);
    expect(html).toContain('fill="var(--color-primary)"');
  });

  it("keeps label text uncolored by the pillar (only dot and tick carry it)", () => {
    const html = renderToStaticMarkup(<RadarChart entries={make(5)} labels={labels} />);
    expect(html).not.toMatch(/<text[^>]*fill="var\(--pillar/);
  });

  it("two radars on one page get distinct gradient ids, each url(#id) pointing at its own gradient", () => {
    const html = renderToStaticMarkup(
      <>
        <RadarChart entries={make(10)} labels={labels} />
        <RadarChart entries={make(10)} labels={labels} />
      </>,
    );
    const ids = [...html.matchAll(/<radialGradient id="([^"]+)"/g)].map((m) => m[1]);
    const refs = [...html.matchAll(/fill="url\(#([^)]+)\)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(refs).toEqual(ids);
    for (const id of ids) expect(id).not.toContain(":");
  });
});
