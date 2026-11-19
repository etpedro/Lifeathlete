import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PillarIcon } from "./PillarIcon";
import { ProgressRing } from "./ProgressRing";

const ring = (done: number, total: number) =>
  renderToStaticMarkup(<ProgressRing done={done} total={total} label="Today" />);

describe("ProgressRing", () => {
  it("fills 0.4 for 4 of 10", () => {
    expect(ring(4, 10)).toContain('data-fraction="0.4"');
  });
  it("is 0 with no NaN when total is 0", () => {
    const html = ring(3, 0);
    expect(html).toContain('data-fraction="0"');
    expect(html).not.toContain("NaN");
  });
  it("clamps to 1", () => {
    expect(ring(12, 10)).toContain('data-fraction="1"');
  });
  it("uses the label as the accessible name of an img", () => {
    const html = ring(1, 2);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Today"');
  });
  it("renders children", () => {
    const html = renderToStaticMarkup(
      <ProgressRing done={1} total={2} label="L">
        <span>mid</span>
      </ProgressRing>,
    );
    expect(html).toContain("<span>mid</span>");
  });
});

describe("ProgressRing center", () => {
  it("renders a numeric 0 child", () => {
    const html = renderToStaticMarkup(
      <ProgressRing done={0} total={3} label="L">
        {0}
      </ProgressRing>,
    );
    expect(html).toContain(">0<");
  });
});

describe("PillarIcon", () => {
  it("renders a neutral glyph for an unknown slug", () => {
    const html = renderToStaticMarkup(<PillarIcon slug="mystery" />);
    expect(html).toContain("<svg");
    expect(html).toContain("<circle");
  });
});
