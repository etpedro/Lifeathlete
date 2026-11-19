// A habit row sits inside a glass pillar card: it must use the darker --glass-inset tint, never
// --glass again (glass on glass lightens the background behind the light text).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/components/today/today.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

it("`.habit` uses --glass-inset, not --glass", () => {
  const rule = css.match(/(?:^|\})\s*\.habit\s*\{([^}]*)\}/);
  expect(rule).not.toBeNull();
  expect(rule![1]).toMatch(/background:\s*var\(--glass-inset\)/);
  expect(rule![1]).not.toMatch(/var\(--glass\)/);
});
