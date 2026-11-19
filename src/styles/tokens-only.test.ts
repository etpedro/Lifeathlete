// Colors must come from tokens: component styles and base.css may not hard-code a color.
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
const files = [...moduleCss(join(root, "src")), join(root, "src/styles/base.css")];
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const FUNC = /\b(?:rgb|hsl)a?\(/i;

describe("styles use tokens only", () => {
  it("finds the stylesheets", () => {
    expect(files.length).toBeGreaterThan(1);
  });
  it.each(files.map((f) => [f.slice(root.length + 1), f] as const))("%s has no hard-coded color", (_n, f) => {
    const css = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(HEX);
    expect(css).not.toMatch(FUNC);
  });
});
