import { describe, expect, it } from "vitest";
import pt from "./pt.json";
import en from "./en.json";

const SLUGS = [
  "exercise",
  "nutrition",
  "nature",
  "gratitude",
  "screens",
  "lightness",
  "meditation",
  "active-lifestyle",
  "reading",
  "family",
];

function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object") Object.assign(out, flatten(v as Record<string, unknown>, key));
    else out[key] = v;
  }
  return out;
}

describe("messages", () => {
  const flatPt = flatten(pt);
  const flatEn = flatten(en);

  it("pt and en have the same keys", () => {
    expect(Object.keys(flatPt).sort()).toEqual(Object.keys(flatEn).sort());
  });

  it("has no empty strings", () => {
    for (const flat of [flatPt, flatEn]) {
      for (const [key, value] of Object.entries(flat)) {
        expect(typeof value, key).toBe("string");
        expect((value as string).trim(), key).not.toBe("");
      }
    }
  });

  it("has pillars.<slug>.name for all 10 slugs", () => {
    for (const slug of SLUGS) {
      expect(flatPt[`pillars.${slug}.name`], slug).toBeTruthy();
      expect(flatEn[`pillars.${slug}.name`], slug).toBeTruthy();
    }
  });
});
