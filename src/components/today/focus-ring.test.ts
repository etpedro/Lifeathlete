// The global focus ring is a 3px outline with a 2px offset (5px outside the control). A habit row
// that clips its overflow would cut that ring off, so it must not clip unless the button's ring
// is drawn inside.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/components/today/today.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rule = (selector: string) => {
  const esc = selector.replace(/[.:()]/g, "\\$&");
  return [...css.matchAll(new RegExp(`(?:^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`, "g"))].map((m) => m[1]).join("\n");
};

describe("today habit rows keep the focus ring visible", () => {
  it("does not clip .habit unless the button's focus ring is inset", () => {
    const habit = rule(".habit");
    expect(habit.trim().length, "the .habit rule must be found (not grouped or renamed)").toBeGreaterThan(0);
    const clips = /overflow(?:-x|-y)?\s*:\s*(hidden|clip|auto)/.test(habit);
    const inset = /outline-offset\s*:\s*-/.test(rule(".habitButton:focus-visible"));
    expect(clips && !inset).toBe(false);
  });
});
