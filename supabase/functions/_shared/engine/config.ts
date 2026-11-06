// Single source of truth for every tunable engine value.
export const ENGINE_CONFIG = {
  xpPerHabit: 10,
  dayCompleteBonus: 20,
  weeklyBalanceBonus: 30,
  balanceMinDays: 4,
  freezePerWeek: 1,
  wheelWindowDays: 30,
  backfillDays: 2,
} as const;
