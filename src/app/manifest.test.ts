import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readPngSize } from "@/lib/pwa/png";
import manifest from "./manifest";
import { APPLE_TOUCH_ICON, THEME_COLOR } from "./manifest";

const PUBLIC = join(process.cwd(), "public");
const file = (src: string) => join(PUBLIC, src.replace(/^\//, ""));

describe("web app manifest", () => {
  const m = manifest();

  it("has the installability fields", () => {
    expect(m.name).toBe("Lifeathlete");
    expect(m.short_name).toBeTruthy();
    expect(m.description).toMatch(/pilares/); // pt
    expect(m.id).toBe("/");
    expect(m.lang).toBe("pt");
    expect(m.display).toBe("standalone");
    expect(m.theme_color).toBe(THEME_COLOR);
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("start_url is inside scope and both are same-origin root paths", () => {
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
    expect(m.start_url!.startsWith(m.scope!)).toBe(true);
  });

  it("declares 192 and 512 'any' icons and a 512 maskable icon", () => {
    const icons = m.icons ?? [];
    const has = (sizes: string, purpose: string) => icons.some((i) => i.sizes === sizes && (i.purpose ?? "any") === purpose);
    expect(has("192x192", "any")).toBe(true);
    expect(has("512x512", "any")).toBe(true);
    expect(has("512x512", "maskable")).toBe(true);
  });

  it.each((manifest().icons ?? []).map((i) => [i.src, i.sizes] as const))("%s exists as a PNG of %s", (src, sizes) => {
    expect(existsSync(file(src))).toBe(true);
    const { width, height } = readPngSize(readFileSync(file(src)));
    expect(`${width}x${height}`).toBe(sizes);
  });

  it("apple-touch icon is a 180x180 PNG", () => {
    expect(readPngSize(readFileSync(file(APPLE_TOUCH_ICON)))).toEqual({ width: 180, height: 180 });
  });
});

describe("readPngSize", () => {
  it("rejects non-PNG data", () => {
    expect(() => readPngSize(Buffer.from("not a png at all, definitely not"))).toThrow();
  });
});
