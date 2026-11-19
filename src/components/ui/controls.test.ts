// Guards the shared button variants: a button gets exactly ONE variant class, and the variant
// rules are ordered secondary, primary, ghost, danger (equal specificity: the last one wins).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "ui.module.css"), "utf8");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tsxFiles(join(dir, e.name)) : e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx") ? [join(dir, e.name)] : [],
  );
}

describe("shared button variants", () => {
  it("variant order matters: secondary, primary, ghost, danger", () => {
    const at = (s: string) => css.indexOf(`${s} {`);
    expect(at(".btnSecondary")).toBeGreaterThan(-1);
    expect(at(".btnSecondary")).toBeLessThan(at(".btnPrimary"));
    expect(at(".btnPrimary")).toBeLessThan(at(".btnGhost"));
    expect(at(".btnGhost")).toBeLessThan(at(".btnDanger"));
    expect(css.match(/\.btnPrimary \{/g)).toHaveLength(1);
  });

  it("no profile button stacks the neutral .button with a primary/danger variant", () => {
    const offenders = tsxFiles(join(__dirname, "../profile")).filter((f) =>
      /styles\.button\}?\s*\$\{styles\.(primary|danger)\}|styles\.(primary|danger)\}\s*\$\{styles\.button/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("the shared .btn base is declared before every variant so the variants win", () => {
    const at = (s: string) => css.indexOf(`${s} {`);
    for (const v of [".btnSecondary", ".btnPrimary", ".btnGhost", ".btnDanger"]) expect(at(".btn")).toBeLessThan(at(v));
  });

  it("every button class in a feature module composes the shared base AND its variant", () => {
    const profile = readFileSync(join(__dirname, "../profile/profile.module.css"), "utf8");
    const want: Record<string, string> = { button: "btnSecondary", primary: "btnPrimary", danger: "btnDanger", ghost: "btnGhost" };
    for (const [cls, variant] of Object.entries(want)) {
      const m = profile.match(new RegExp(`^\\.${cls} \\{\\s*composes: ([^;]+) from "\\.\\./ui/ui\\.module\\.css";`, "m"));
      if (!m) {
        expect(cls, "ghost is optional").toBe("ghost");
        continue;
      }
      const names = m[1].split(/\s+/);
      expect(names, `.${cls}`).toEqual(expect.arrayContaining(["btn", variant]));
    }
  });
});
