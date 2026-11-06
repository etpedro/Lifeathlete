// Single source of truth for every tunable engine value.
export const ENGINE_CONFIG = {
  xpPerHabit: 10,
  dayCompleteBonus: 20,
  weeklyBalanceBonus: 30,
  balanceMinDays: 4,
  freezePerWeek: 1,
  wheelWindowDays: 30,
  backfillDays: 2,
  /** Balance index = 1 - stddev / this divisor. */
  balanceStdDevDivisor: 50,
  balanceBrightThreshold: 0.75,
  balanceDimThreshold: 0.4,
  levelsPerStage: 5,
} as const;
