// Forced-colors drops the inset accent shadow: alert and status notices must keep distinct borders.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/components/today/today.module.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("today notices in forced-colors", () => {
  it("gives status and alert notices visible, different borders", () => {
    const block = css.match(/@media \(forced-colors: active\)\s*\{([\s\S]*?\n\})/);
    expect(block).not.toBeNull();
    const status = block![1].match(/\.notice\s*\{[^}]*border:\s*([^;]+);/);
    const alert = block![1].match(/\.notice\[role="alert"\]\s*\{[^}]*border:\s*([^;]+);/);
    expect(status).not.toBeNull();
    expect(alert).not.toBeNull();
    expect(status![1]).not.toBe(alert![1]);
  });
});
