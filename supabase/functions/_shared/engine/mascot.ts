import { ENGINE_CONFIG } from "./config.ts";

/**
 * Mascot (controller ruling): stage = min(5, ceil(level / levelsPerStage)),
 * level < 1 treated as 1. Variant: bright when balance >= 0.75, dim when
 * balance < 0.4, else normal; balance clamped to [0,1], NaN -> 0 (dim).
 */
export function mascotState(
  level: number,
  balance: number,
): { stage: 1 | 2 | 3 | 4 | 5; variant: "dim" | "normal" | "bright" } {
  const lvl = Number.isNaN(level) || level < 1 ? 1 : level;
  const stage = Math.min(5, Math.ceil(lvl / ENGINE_CONFIG.levelsPerStage)) as 1 | 2 | 3 | 4 | 5;
  const b = Number.isNaN(balance) ? 0 : Math.min(1, Math.max(0, balance));
  const variant =
    b >= ENGINE_CONFIG.balanceBrightThreshold
      ? "bright"
      : b < ENGINE_CONFIG.balanceDimThreshold
        ? "dim"
        : "normal";
  return { stage, variant };
}
