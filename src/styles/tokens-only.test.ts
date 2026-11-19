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

/** Hard-coded colors in declaration values only: `#id` selectors and `url(#frag)` are fine. */
function hardCodedColors(source: string): string[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const found: string[] = [];
  for (const block of css.matchAll(/\{([^{}]*)\}/g)) {
    for (const decl of block[1].split(";")) {
      const colon = decl.indexOf(":");
      if (colon < 0) continue;
      const value = decl.slice(colon + 1).replace(/url\([^)]*\)/gi, "");
      const hit = value.match(HEX) ?? value.match(FUNC);
      if (hit) found.push(decl.trim());
    }
  }
  return found;
}

describe("the hard-coded color check itself", () => {
  it.each(["color: #fff", "color: #FFAA00", "background: rgb(0 0 0)", "background: rgba(0, 0, 0, .5)", "border-color: hsl(10 20% 30%)", "color: hsla(1, 2%, 3%, .4)"])(
    "flags `%s`",
    (decl) => {
      expect(hardCodedColors(`.a { ${decl}; }`)).toHaveLength(1);
      expect(hardCodedColors(`@media (x) { .a { margin: 0; ${decl} } }`)).toHaveLength(1);
    },
  );
  it.each([
    ".a #b { margin: 0; }",
    "#main:hover { margin: 0; }",
    "a:not(#x) .y { margin: 0; }",
    ".a { fill: url(#frag); }",
    ".a { fill: url(#abc) var(--color-text); }",
    ".a { color: var(--color-text); background: color-mix(in srgb, var(--color-bg) 50%, transparent); }",
  ])("passes `%s`", (css) => {
    expect(hardCodedColors(css)).toEqual([]);
  });
});

describe("styles use tokens only", () => {
  it("finds the stylesheets", () => {
    expect(files.length).toBeGreaterThan(1);
  });
  it.each(files.map((f) => [f.slice(root.length + 1), f] as const))("%s has no hard-coded color", (_n, f) => {
    expect(hardCodedColors(readFileSync(f, "utf8"))).toEqual([]);
  });
});
