/**
 * Client mirror of the metrics a habit can be filled from (user_habits.auto_source,
 * consent categories). MUST equal AUTO_METRICS / METRIC_LIMITS / MAX_DAYS of
 * supabase/functions/health-sync/health-sync.ts and the checks of migration 0012; a
 * test fails if they differ.
 */
export const AUTO_METRICS = ["steps", "workout_minutes", "sleep_hours", "mindful_minutes"] as const;
export type AutoMetric = (typeof AUTO_METRICS)[number];

/** Accepted range 0..max (outside -> the value is dropped, never clamped) and rounding. */
export const METRIC_LIMITS: Record<AutoMetric, { max: number; decimals: number }> = {
  steps: { max: 100_000, decimals: 0 },
  workout_minutes: { max: 1440, decimals: 0 },
  sleep_hours: { max: 24, decimals: 2 },
  mindful_minutes: { max: 1440, decimals: 0 },
};

/** Days read and sent per sync (local today included). */
export const SYNC_DAYS = 7;

export const isAutoMetric = (v: unknown): v is AutoMetric => (AUTO_METRICS as readonly unknown[]).includes(v);

/** The value to send (rounded), or null when it is not a number within 0..max. */
export function metricValue(metric: AutoMetric, value: unknown): number | null {
  const { max, decimals } = METRIC_LIMITS[metric];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) return null;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/** The known metrics of an unknown value, unique, in canonical order. */
export function knownMetrics(raw: unknown): AutoMetric[] {
  const set = new Set(Array.isArray(raw) ? raw : []);
  return AUTO_METRICS.filter((m) => set.has(m));
}
