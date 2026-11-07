// Regression: the `hidden` attribute must always hide. base.css gives every element zero
// specificity (:where) so component classes win, but a class like `.habits { display: grid }`
// then also beats the browser's built-in `[hidden] { display: none }`, so a collapsed Hoje
// pillar stayed open (the toggle flipped aria-expanded and `hidden`, yet the list stayed visible).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const base = readFileSync(join(process.cwd(), "src/styles/base.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("base.css [hidden]", () => {
  it("has a rule that hides [hidden] elements even against a component's display rule", () => {
    const rule = /(^|\})\s*\[hidden\]\s*\{([^}]*)\}/.exec(base);
    expect(rule, "a top-level `[hidden] { … }` rule (not wrapped in :where)").not.toBeNull();
    expect(rule![2]).toMatch(/display\s*:\s*none\s*!important/);
  });
});
