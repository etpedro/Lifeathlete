// Motion guard: the global reduced-motion rule stays, and no component may override it with !important.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function moduleCss(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...moduleCss(p));
    else if (name.endsWith(".module.css")) out.push(p);
  }
  return out;
}

const root = process.cwd();
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("motion guard", () => {
  it("base.css disables animation and transition durations under prefers-reduced-motion", () => {
    const css = strip(readFileSync(join(root, "src/styles/base.css"), "utf8"));
    const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\n\}/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(block![0]).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
  });

  it.each(moduleCss(join(root, "src")).map((f) => [f.slice(root.length + 1), f] as const))(
    "%s has no !important duration overrides",
    (_n, f) => {
      expect(strip(readFileSync(f, "utf8"))).not.toMatch(/(?:animation|transition)-duration\s*:[^;]*!important/);
    },
  );
});
