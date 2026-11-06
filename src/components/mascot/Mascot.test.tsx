import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Mascot } from "./Mascot";

const render = (p: Partial<Parameters<typeof Mascot>[0]> = {}) =>
  renderToStaticMarkup(<Mascot stage={1} variant="normal" description="desc" {...p} />);

describe("Mascot", () => {
  it("renders a decorative svg with an adjacent text description", () => {
    const html = render({ description: "Libelinha, fase 1" });
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).toContain("<figcaption");
    expect(html).toContain("Libelinha, fase 1");
  });

  it("renders distinct output for each stage 1-5", () => {
    const outputs = [1, 2, 3, 4, 5].map((stage) => render({ stage }));
    expect(new Set(outputs).size).toBe(5);
  });

  it("renders distinct output for each variant, with a non-color cue (sparkle count)", () => {
    const sparkles = (v: "dim" | "normal" | "bright") =>
      (render({ variant: v }).match(/data-sparkle/g) ?? []).length;
    expect(new Set(["dim", "normal", "bright"].map((v) => render({ variant: v as "dim" })).map(String)).size).toBe(3);
    expect(sparkles("dim")).toBeLessThan(sparkles("normal"));
    expect(sparkles("normal")).toBeLessThan(sparkles("bright"));
  });

  it("clamps stage into 1-5", () => {
    expect(render({ stage: 9 })).toBe(render({ stage: 5 }));
    expect(render({ stage: 0 })).toBe(render({ stage: 1 }));
    expect(render({ stage: Number.NaN })).toBe(render({ stage: 1 }));
  });

  it("rests with a distinct, still pose and no animation", () => {
    const awake = render({ stage: 3 });
    const resting = render({ stage: 3, resting: true });
    expect(resting).not.toBe(awake);
    expect(resting).toContain('data-resting="true"');
    expect(resting).not.toMatch(/data-sparkle/);
    expect(awake).toContain('data-resting="false"');
  });
});
