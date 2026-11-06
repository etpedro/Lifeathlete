import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { XpBar } from "./XpBar";

describe("XpBar", () => {
  it("exposes progressbar semantics", () => {
    const html = renderToStaticMarkup(<XpBar label="Experiência" valueText="40 / 100 XP" value={40} max={100} />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="40"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html).toContain('aria-label="Experiência"');
    expect(html).toContain('aria-valuetext="40 / 100 XP"');
  });

  it("clamps the value into 0..max and survives max 0 or NaN", () => {
    const over = renderToStaticMarkup(<XpBar label="x" valueText="y" value={500} max={100} />);
    expect(over).toContain('aria-valuenow="100"');
    expect(over).toContain("width:100%");
    const bad = renderToStaticMarkup(<XpBar label="x" valueText="y" value={Number.NaN} max={0} />);
    expect(bad).not.toMatch(/NaN|Infinity/);
    expect(bad).toContain('aria-valuenow="0"');
  });
});
