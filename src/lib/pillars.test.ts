import { describe, expect, it } from "vitest";
import { PILLAR_SLUGS } from "@/components/ui/PillarIcon";
import { isPillarSlug, pillarColor } from "./pillars";

describe("pillarColor", () => {
  it("maps each of the 10 slugs to its token", () => {
    expect(PILLAR_SLUGS).toHaveLength(10);
    for (const slug of PILLAR_SLUGS) expect(pillarColor(slug)).toBe(`var(--pillar-${slug})`);
  });
  it("falls back to the primary color for unknown and empty slugs", () => {
    expect(pillarColor("nope")).toBe("var(--color-primary)");
    expect(pillarColor("")).toBe("var(--color-primary)");
  });
});

describe("isPillarSlug", () => {
  it("narrows known slugs only", () => {
    expect(isPillarSlug("reading")).toBe(true);
    expect(isPillarSlug("toString")).toBe(false);
    expect(isPillarSlug("")).toBe(false);
  });
});
