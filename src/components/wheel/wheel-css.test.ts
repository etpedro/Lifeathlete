// The two insight cards sit side by side only when each column is at least ~14rem wide.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

it("`.two` needs >= 14rem per column before going side by side", () => {
  const css = readFileSync(join(process.cwd(), "src/components/wheel/wheel.module.css"), "utf8");
  const rule = css.match(/\.two\s*\{([^}]*)\}/);
  expect(rule).not.toBeNull();
  const m = rule![1].match(/minmax\(min\(100%,\s*([\d.]+)rem\)/);
  expect(m).not.toBeNull();
  expect(Number(m![1])).toBeGreaterThanOrEqual(14);
});
