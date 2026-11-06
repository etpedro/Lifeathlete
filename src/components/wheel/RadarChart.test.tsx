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
});
