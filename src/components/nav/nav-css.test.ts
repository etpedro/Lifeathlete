// CSS-source guards for the bottom navigation (no browser in unit tests).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/components/nav/nav.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("nav css", () => {
  it("keeps a non-color cue for the active tab in forced-colors", () => {
    const block = css.match(/@media \(forced-colors: active\)\s*\{([\s\S]*?\n\})/);
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/aria-current="page"[\s\S]*border[^;]*Highlight/);
  });

  it("glass background stays at least 90% opaque", () => {
    const m = css.match(/color-mix\(in srgb, var\(--color-surface-raised\) (\d+)%/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(90);
  });

  it("label can shrink and wrap so tabs do not widen at 320px", () => {
    const rule = css.match(/\.label\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/min-width:\s*0/);
    expect(rule![1]).toMatch(/overflow-wrap:\s*anywhere/);
  });
});
