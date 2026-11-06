import { describe, expect, it } from "vitest";
import { clampScore, polygonPoints, radarPoint, wheelCallouts } from "./geometry";

const C = { cx: 100, cy: 100, radius: 50 };

describe("radar geometry", () => {
  it("places n=3 points starting at the top, clockwise", () => {
    const top = radarPoint(0, 3, 100, C);
    expect(top.x).toBeCloseTo(100);
    expect(top.y).toBeCloseTo(50);
    const second = radarPoint(1, 3, 100, C);
    expect(second.x).toBeCloseTo(100 + 50 * Math.cos(Math.PI / 6));
    expect(second.y).toBeCloseTo(100 + 25);
  });

  it("places n=10 points evenly: index 5 is opposite index 0", () => {
    const a = radarPoint(0, 10, 100, C);
    const b = radarPoint(5, 10, 100, C);
    expect(b.x).toBeCloseTo(200 - a.x);
    expect(b.y).toBeCloseTo(200 - a.y);
    expect(radarPoint(0, 10, 50, C).y).toBeCloseTo(75);
  });

  it("clamps scores to 0-100 and treats NaN as 0", () => {
    expect(clampScore(150)).toBe(100);
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(Number.NaN)).toBe(0);
    expect(radarPoint(0, 3, 500, C).y).toBeCloseTo(50);
    expect(radarPoint(0, 3, Number.NaN, C)).toEqual({ x: 100, y: 100 });
  });

  it("builds a polygon points string", () => {
    expect(polygonPoints([100, 100, 100], C).split(" ")).toHaveLength(3);
    expect(polygonPoints([], C)).toBe("");
  });
});

describe("wheelCallouts", () => {
  it("selects strongest and weakest with their scores", () => {
    expect(wheelCallouts({ scores: { a: 80, b: 20 }, weakest: "b", strongest: "a" })).toEqual({
      strongest: { slug: "a", score: 80 },
      weakest: { slug: "b", score: 20 },
    });
  });
  it("selects nothing when nothing is highlighted", () => {
    expect(wheelCallouts({ scores: { a: 50 } })).toEqual({});
  });
});
