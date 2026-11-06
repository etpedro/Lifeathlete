import { describe, expect, it } from "vitest";
import { mascotState } from "./mascot.ts";

describe("mascotState stage", () => {
  it.each([
    [1, 1],
    [5, 1],
    [6, 2],
    [21, 5],
    [99, 5],
    [0, 1],
    [-3, 1],
  ])("level %i -> stage %i", (level, stage) => {
    expect(mascotState(level, 0.5).stage).toBe(stage);
  });
});

describe("mascotState variant", () => {
  it.each([
    [0.8, "bright"],
    [0.75, "bright"],
    [0.5, "normal"],
    [0.4, "normal"],
    [0.39, "dim"],
    [NaN, "dim"],
    [5, "bright"],
    [-1, "dim"],
  ])("balance %s -> %s", (balance, variant) => {
    expect(mascotState(1, balance).variant).toBe(variant);
  });
});
