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

  it("tightens the tabs on very narrow phones so labels stay on one line", () => {
    expect(css).toMatch(/@media \(max-width: 30rem\)\s*\{[^@]*\.label\s*\{[^}]*font-size/);
    expect(css).toMatch(/@media \(max-width: 23\.75rem\)\s*\{[^@]*--nav-inset/);
  });

  it("the EN Achievements tab label carries a soft hyphen so it wraps cleanly at 320px", async () => {
    const en = (await import("@/messages/en.json")).default;
    expect(en.common.nav.achievements.replace(/\u00ad/g, "")).toBe("Achievements");
    expect(en.common.nav.achievements).toContain("\u00ad");
  });
});
